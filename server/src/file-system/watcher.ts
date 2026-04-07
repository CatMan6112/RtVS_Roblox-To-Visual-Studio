import chokidar, { FSWatcher } from "chokidar";
import path from "path";
import fs from "fs/promises";
import { FileChange } from "../types/api";
import { SERVICE_NAMES_SET } from "../types/roblox";
import { ChangeTracker, simpleHash } from "../change-tracker";
import { logger } from "../utils/logger";

function matchesIgnorePath(relativePath: string, pattern: string): boolean {
  if (!pattern.includes("*")) {
    return relativePath === pattern || relativePath.startsWith(pattern + "/");
  }

  if (pattern.startsWith("**/") && pattern.endsWith("/**")) {
    const segment = pattern.slice(3, -3);
    return (
      relativePath === segment ||
      relativePath.startsWith(segment + "/") ||
      relativePath.includes("/" + segment + "/") ||
      relativePath.endsWith("/" + segment)
    );
  }

  return relativePath === pattern || relativePath.startsWith(pattern + "/");
}

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

  setCommitMode(
    enabled: boolean,
    onCommit?: (relativePath: string, type: "create" | "update" | "delete", content: string) => Promise<void>
  ): void {
    this.commitModeEnabled = enabled;
    this.onCommitCallback = onCommit ?? null;
    logger.info(`Commit mode ${enabled ? "enabled" : "disabled"} on watcher`);
  }

  start(): void {
    if (this.isWatching) {
      logger.warn("File watcher already running");
      return;
    }

    logger.info(`Starting file watcher on: ${this.watchPath}`);
    if (this.ignorePaths.length > 0) {
      logger.info(`Ignoring paths: ${this.ignorePaths.join(", ")}`);
    }

    const globPatterns = this.ignorePaths.filter((p) => p.includes("*"));
    const exactPaths = this.ignorePaths.filter((p) => !p.includes("*"));
    const ignoreAbsolute = exactPaths.flatMap((p) => [
      path.join(this.watchPath, p),
      path.join(this.watchPath, p, "**"),
    ]);

    this.watcher = chokidar.watch(this.watchPath, {
      ignored: [
        /(^|[\/\\])\./,
        "**/node_modules/**",
        "**/.git/**",
        ...ignoreAbsolute,
        ...globPatterns,
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on("add", (filePath) => {
      void this.addChange("create", filePath);
    });

    this.watcher.on("change", (filePath) => {
      void this.addChange("update", filePath);
    });

    this.watcher.on("unlink", (filePath) => {
      void this.addChange("delete", filePath);
    });

    this.watcher.on("error", (error) => {
      logger.error("File watcher error:", error);
    });

    this.watcher.on("ready", () => {
      this.isWatching = true;
      logger.info("File watcher ready");
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
      logger.info("File watcher stopped");
    }
  }

  private async addChange(
    type: "create" | "update" | "delete",
    filePath: string
  ): Promise<void> {
    const relativePath = path.relative(this.watchPath, filePath);

    const firstSegment = relativePath.split(/[/\\]/)[0];
    if (!SERVICE_NAMES_SET.has(firstSegment)) {
      return;
    }

    // Object properties are strictly one-way (Studio -> disk). FS edits to
    // __main__.json must not propagate back to Studio.
    if (path.basename(relativePath) === "__main__.json") {
      return;
    }

    const normalizedRelative = relativePath.replace(/\\/g, "/");
    if (this.ignorePaths.some((p) => matchesIgnorePath(normalizedRelative, p))) {
      return;
    }

    let contentHash = "";
    if (type !== "delete") {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        contentHash = simpleHash(content);
      } catch {
        return;
      }
    }

    if (!this.changeTracker.shouldForwardToPlugin(relativePath, contentHash)) {
      return;
    }

    if (this.commitModeEnabled && this.onCommitCallback && relativePath.endsWith(".lua")) {
      try {
        const content = type !== "delete" ? await fs.readFile(filePath, "utf-8") : "";
        await this.onCommitCallback(relativePath, type, content);
      } catch (err) {
        logger.error(`Commit callback error for ${relativePath}: ${err}`);
      }
      return;
    }

    this.changeTracker.markFsOrigin(relativePath, contentHash);

    if (this.changeQueue.length >= FileSystemWatcher.MAX_QUEUE_SIZE) {
      this.changeQueue = this.changeQueue.slice(
        -Math.floor(FileSystemWatcher.MAX_QUEUE_SIZE / 2)
      );
      logger.warn("Change queue overflow - dropped oldest entries to prevent memory leak");
    }

    const change: FileChange = {
      type,
      path: relativePath,
      timestamp: new Date().toISOString(),
    };

    this.changeQueue.push(change);
    logger.info(`File ${type}: ${relativePath}`);
  }

  getChanges(): FileChange[] {
    const changes = [...this.changeQueue];
    this.changeQueue = [];
    return changes;
  }

  getPendingCount(): number {
    return this.changeQueue.length;
  }

  isActive(): boolean {
    return this.isWatching;
  }

  clearQueue(): void {
    const count = this.changeQueue.length;
    this.changeQueue = [];
    logger.info(`Cleared ${count} pending changes`);
  }
}
