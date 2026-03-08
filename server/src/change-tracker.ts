/**
 * Change Tracker - Origin-tagged echo suppression for bidirectional sync
 *
 * Tracks the origin of file changes to prevent circular update loops.
 * When Studio writes a file, the watcher would normally detect it and
 * send it back to Studio. The ChangeTracker recognizes this as an echo
 * and suppresses it. Same logic applies in the reverse direction.
 *
 * Uses content hashing so that only identical content is suppressed —
 * legitimate rapid re-edits to the same file are still forwarded.
 */

import { logger } from "./utils/logger";

interface TrackedEntry {
  hash: string;
  expires: number;
}

/**
 * Simple FNV-1a hash for content fingerprinting.
 * Not cryptographic — just needs to distinguish different file contents.
 */
export function simpleHash(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

export class ChangeTracker {
  /**
   * Changes recently written by Studio → file system.
   * The watcher should ignore these (they're echoes of Studio edits).
   */
  private studioOriginPaths = new Map<string, TrackedEntry>();

  /**
   * Changes recently sent from file system → Studio.
   * The studio-change endpoint should ignore echoes of these.
   */
  private fsOriginPaths = new Map<string, TrackedEntry>();

  /** When true, ALL watcher events are suppressed (used during full sync) */
  private bulkWriteActive = false;

  private readonly ECHO_TTL_MS = 5000;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodic cleanup of expired entries
    this.cleanupInterval = setInterval(() => this.cleanup(), 10000);
  }

  /**
   * Mark that a change originated from Studio (so watcher suppresses the echo).
   */
  markStudioOrigin(path: string, hash: string): void {
    this.studioOriginPaths.set(path, {
      hash,
      expires: Date.now() + this.ECHO_TTL_MS,
    });
  }

  /**
   * Mark that a change originated from the file system (so studio-change
   * endpoint suppresses the echo when Studio sends it back).
   */
  markFsOrigin(path: string, hash: string): void {
    this.fsOriginPaths.set(path, {
      hash,
      expires: Date.now() + this.ECHO_TTL_MS,
    });
  }

  /**
   * Should a watcher-detected change be forwarded to the plugin?
   * Returns false if this change is an echo of a Studio write.
   */
  shouldForwardToPlugin(path: string, hash: string): boolean {
    if (this.bulkWriteActive) {
      return false;
    }

    const entry = this.studioOriginPaths.get(path);
    if (!entry) {
      return true; // No record of Studio writing this — it's a genuine FS change
    }

    if (Date.now() > entry.expires) {
      this.studioOriginPaths.delete(path);
      return true; // Entry expired — treat as genuine
    }

    if (entry.hash === hash) {
      // Same content — this is the echo. Suppress it and remove the entry.
      this.studioOriginPaths.delete(path);
      return false;
    }

    // Different content — Studio wrote something, but FS now has different content.
    // This is a legitimate new change. Forward it.
    return true;
  }

  /**
   * Should a studio-change request actually write to the file system?
   * Returns false if this change is an echo of an FS change we sent to Studio.
   */
  shouldWriteToFs(path: string, hash: string): boolean {
    const entry = this.fsOriginPaths.get(path);
    if (!entry) {
      return true; // No record of FS sending this — it's a genuine Studio change
    }

    if (Date.now() > entry.expires) {
      this.fsOriginPaths.delete(path);
      return true; // Entry expired — treat as genuine
    }

    if (entry.hash === hash) {
      // Same content — this is the echo. Suppress it and remove the entry.
      this.fsOriginPaths.delete(path);
      return false;
    }

    // Different content — FS sent something, but Studio now has different content.
    // This is a legitimate new change. Write it.
    return true;
  }

  /**
   * Enter bulk write mode (used during full sync).
   * All watcher events are suppressed to avoid thousands of echo checks.
   */
  beginBulkWrite(): void {
    this.bulkWriteActive = true;
    logger.info("ChangeTracker: bulk write mode enabled");
  }

  /**
   * Exit bulk write mode. Clears all tracked entries since
   * the full sync has overwritten everything.
   */
  endBulkWrite(): void {
    this.bulkWriteActive = false;
    this.studioOriginPaths.clear();
    this.fsOriginPaths.clear();
    logger.info("ChangeTracker: bulk write mode disabled");
  }

  /**
   * Remove expired entries from both maps.
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [path, entry] of this.studioOriginPaths) {
      if (now > entry.expires) {
        this.studioOriginPaths.delete(path);
      }
    }

    for (const [path, entry] of this.fsOriginPaths) {
      if (now > entry.expires) {
        this.fsOriginPaths.delete(path);
      }
    }
  }

  /**
   * Stop the cleanup interval (for graceful shutdown).
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
