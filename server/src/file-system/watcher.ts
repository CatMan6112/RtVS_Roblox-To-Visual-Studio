/**
 * File System Watcher - Monitors synced-game directory for changes
 * Uses chokidar to watch for file creation, updates, and deletions.
 *
 * Echo suppression is handled by the ChangeTracker — when Studio writes
 * a file, the watcher reads its content, hashes it, and checks whether
 * it matches a recently-tracked Studio-origin write. If so, the change
 * is silently dropped instead of being queued for the plugin.
 */

import chokidar, { FSWatcher } from "chokidar";
import path from "path";
import fs from "fs/promises";
import { FileChange } from "../types/api";
import { SERVICE_NAMES_SET } from "../types/roblox";
import { ChangeTracker, simpleHash } from "../change-tracker";
import { logger } from "../utils/logger";

export class FileSystemWatcher {
  private watcher: FSWatcher | null = null;
  private changeQueue: FileChange[] = [];
  private watchPath: string;
  private isWatching: boolean = false;
  private changeTracker: ChangeTracker;
  private ignorePaths: string[];

  private static readonly MAX_QUEUE_SIZE = 10000;

  private commitModeEnabled = false;
  private onCommitCallback: ((relativePath: string, type: "create" | "update" | "delete", content: string) => Promise<void>) | null = null;

  constructor(watchPath: string, changeTracker: ChangeTracker, ignorePaths: string[] = []) {
    this.watchPath = watchPath;
    this.changeTracker = changeTracker;
    this.ignorePaths = ignorePaths;
  }

  /**
   * Enable or disable commit mode. When enabled, .lua file changes are
   * routed to the commit callback instead of being queued for polling.
   */
  setCommitMode(
    enabled: boolean,
    onCommit?: (relativePath: string, type: "create" | "update" | "delete", content: string) => Promise<void>
  ): void {
    this.commitModeEnabled = enabled;
    this.onCommitCallback = onCommit ?? null;
    logger.info(`Commit mode ${enabled ? "enabled" : "disabled"} on watcher`);
  }

  /**
   * Start watching the file system for changes
   */
  start(): void {
    if (this.isWatching) {
      logger.warn("File watcher already running");
      return;
    }

    logger.info(`Starting file watcher on: ${this.watchPath}`);
    if (this.ignorePaths.length > 0) {
      logger.info(`Ignoring paths: ${this.ignorePaths.join(", ")}`);
    }

    // Build absolute ignore patterns from configured relative ignore paths.
    // Both the directory itself and everything inside it must be excluded so
    // chokidar never creates inotify watchers for those subtrees.
    const ignoreAbsolute = this.ignorePaths.flatMap((p) => [
      path.join(this.watchPath, p),
      path.join(this.watchPath, p, "**"),
    ]);

    this.watcher = chokidar.watch(this.watchPath, {
      ignored: [
        /(^|[\/\\])\./, // Ignore dotfiles
        "**/node_modules/**", // Ignore node_modules
        "**/.git/**", // Ignore git directory
        ...ignoreAbsolute, // User-configured ignore paths
      ],
      persistent: true,
      ignoreInitial: true, // Don't trigger events for existing files on startup
      awaitWriteFinish: {
        stabilityThreshold: 100, // Wait 100ms for file writes to finish
        pollInterval: 50,
      },
    });

    // File added
    this.watcher.on("add", (filePath) => {
      void this.addChange("create", filePath);
    });

    // File changed
    this.watcher.on("change", (filePath) => {
      void this.addChange("update", filePath);
    });

    // File deleted
    this.watcher.on("unlink", (filePath) => {
      void this.addChange("delete", filePath);
    });

    // Error handling
    this.watcher.on("error", (error) => {
      logger.error("File watcher error:", error);
    });

    // Ready event
    this.watcher.on("ready", () => {
      this.isWatching = true;
      logger.info("File watcher ready");
    });
  }

  /**
   * Stop watching the file system
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
      logger.info("File watcher stopped");
    }
  }

  /**
   * Add a file change to the queue (with echo suppression via ChangeTracker)
   */
  private async addChange(
    type: "create" | "update" | "delete",
    filePath: string
  ): Promise<void> {
    // Convert absolute path to relative path from synced-game directory
    const relativePath = path.relative(this.watchPath, filePath);

    // Only queue changes that are inside a known Roblox service directory.
    // Files at the root of synced-game (e.g. claude.md, .gitignore) are not
    // part of the sync and must be ignored to avoid confusing the plugin.
    const firstSegment = relativePath.split(/[/\\]/)[0];
    if (!SERVICE_NAMES_SET.has(firstSegment)) {
      return;
    }

    // Drop changes under configured ignore paths (belt-and-suspenders on top of chokidar).
    const normalizedRelative = relativePath.replace(/\\/g, "/");
    if (this.ignorePaths.some((p) => normalizedRelative === p || normalizedRelative.startsWith(p + "/"))) {
      return;
    }

    // Compute content hash for create/update to enable echo suppression
    let contentHash = "";
    if (type !== "delete") {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        contentHash = simpleHash(content);
      } catch {
        // File may have been deleted between the event and our read
        return;
      }
    }

    // Check if this is an echo of a Studio-originated write
    if (!this.changeTracker.shouldForwardToPlugin(relativePath, contentHash)) {
      return;
    }

    // In commit mode, route .lua changes to the commit callback
    if (this.commitModeEnabled && this.onCommitCallback && relativePath.endsWith(".lua")) {
      try {
        const content = type !== "delete" ? await fs.readFile(filePath, "utf-8") : "";
        await this.onCommitCallback(relativePath, type, content);
      } catch (err) {
        logger.error(`Commit callback error for ${relativePath}: ${err}`);
      }
      return;
    }

    // Mark that we're sending this to the plugin so the reverse echo gets suppressed
    this.changeTracker.markFsOrigin(relativePath, contentHash);

    // Enforce queue size limit to prevent memory leaks
    if (this.changeQueue.length >= FileSystemWatcher.MAX_QUEUE_SIZE) {
      this.changeQueue = this.changeQueue.slice(
        -Math.floor(FileSystemWatcher.MAX_QUEUE_SIZE / 2)
      );
      logger.warn("Change queue overflow — dropped oldest entries to prevent memory leak");
    }

    const change: FileChange = {
      type,
      path: relativePath,
      timestamp: new Date().toISOString(),
    };

    this.changeQueue.push(change);

    logger.info(`File ${type}: ${relativePath}`);
  }

  /**
   * Get all pending changes and clear the queue
   */
  getChanges(): FileChange[] {
    const changes = [...this.changeQueue];
    this.changeQueue = [];
    return changes;
  }

  /**
   * Get number of pending changes without clearing queue
   */
  getPendingCount(): number {
    return this.changeQueue.length;
  }

  /**
   * Check if watcher is active
   */
  isActive(): boolean {
    return this.isWatching;
  }

  /**
   * Clear all pending changes without processing them
   */
  clearQueue(): void {
    const count = this.changeQueue.length;
    this.changeQueue = [];
    logger.info(`Cleared ${count} pending changes`);
  }
}
