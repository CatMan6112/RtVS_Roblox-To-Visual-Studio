/**
 * File System Watcher - Monitors synced-game directory for changes
 * Uses chokidar to watch for file creation, updates, and deletions
 */

import chokidar, { FSWatcher } from "chokidar";
import path from "path";
import { FileChange } from "../types/api";

export class FileSystemWatcher {
  private watcher: FSWatcher | null = null;
  private changeQueue: FileChange[] = [];
  private watchPath: string;
  private isWatching: boolean = false;
  private isPaused: boolean = false;

  constructor(watchPath: string) {
    this.watchPath = watchPath;
  }

  /**
   * Start watching the file system for changes
   */
  start(): void {
    if (this.isWatching) {
      console.warn("File watcher already running");
      return;
    }

    console.log(`Starting file watcher on: ${this.watchPath}`);

    this.watcher = chokidar.watch(this.watchPath, {
      ignored: [
        /(^|[\/\\])\../, // Ignore dotfiles
        "**/node_modules/**", // Ignore node_modules
        "**/.git/**", // Ignore git directory
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
      this.addChange("create", filePath);
    });

    // File changed
    this.watcher.on("change", (filePath) => {
      this.addChange("update", filePath);
    });

    // File deleted
    this.watcher.on("unlink", (filePath) => {
      this.addChange("delete", filePath);
    });

    // Error handling
    this.watcher.on("error", (error) => {
      console.error("File watcher error:", error);
    });

    // Ready event
    this.watcher.on("ready", () => {
      this.isWatching = true;
      console.log("File watcher ready");
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
      console.log("File watcher stopped");
    }
  }

  /**
   * Add a file change to the queue
   */
  private addChange(type: "create" | "update" | "delete", filePath: string): void {
    // Don't add changes while paused
    if (this.isPaused) {
      return;
    }

    // Convert absolute path to relative path from synced-game directory
    const relativePath = path.relative(this.watchPath, filePath);

    const change: FileChange = {
      type,
      path: relativePath,
      timestamp: new Date().toISOString(),
    };

    this.changeQueue.push(change);

    console.log(`File ${type}: ${relativePath}`);
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
   * Pause the watcher temporarily (stops queueing changes)
   */
  async pause(): Promise<void> {
    this.isPaused = true;
    // Clear any pending changes from the queue to prevent conflicts
    this.clearQueue();
    console.log("File watcher paused");
  }

  /**
   * Resume the watcher
   */
  resume(): void {
    this.isPaused = false;
    console.log("File watcher resumed");
  }

  /**
   * Clear all pending changes without processing them
   */
  clearQueue(): void {
    const count = this.changeQueue.length;
    this.changeQueue = [];
    console.log(`Cleared ${count} pending changes`);
  }
}
