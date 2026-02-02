/**
 * Main file system writer - converts Roblox game data to files
 * Uses streaming writes for memory efficiency with large projects
 */

import fs from "fs/promises";
import path from "path";
import { GameData, RobloxInstance, isScriptInstance, hasChildren, SERVICE_NAMES_SET } from "../types/roblox";
import { sanitizeName, pathArrayToAbsolute, makeUniqueName } from "./path-generator";
import { serializeProperties, toJsonString } from "../serializers/property-writer";
import { buildRootIndex, indexToJsonString } from "./index-builder";

export interface WriteProgress {
  phase: "preparing" | "writing" | "complete";
  filesWritten: number;
  totalFiles: number;
  currentService?: string;
}

export type ProgressCallback = (progress: WriteProgress) => void;

// Concurrency limit for parallel writes
const WRITE_CONCURRENCY = 50;

// Batch size for streaming writes (process this many instances before yielding)
const STREAM_BATCH_SIZE = 100;

export class FileSystemWriter {
  private basePath: string;
  private filesWritten: number = 0;
  private totalFiles: number = 0;
  private progressCallback?: ProgressCallback;
  private currentService?: string;

  // For streaming writes: track active writes and pending queue
  private activeWrites: number = 0;
  private pendingWrites: Array<{ filePath: string; content: string }> = [];
  private writeResolvers: Array<() => void> = [];
  private createdDirs = new Set<string>();

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Count total files that will be written (lightweight traversal)
   */
  private countFiles(instance: RobloxInstance): number {
    let count = 0;
    const isScript = isScriptInstance(instance);
    const hasKids = hasChildren(instance);

    if (isScript && !hasKids) {
      count = 1; // .lua file
    } else if (isScript && hasKids) {
      count = 2; // __main__.lua + __main__.json
    } else {
      count = 1; // __main__.json
    }

    if (hasKids) {
      for (const child of instance.Children!) {
        count += this.countFiles(child);
      }
    }

    return count;
  }

  /**
   * Write the entire game data to the file system using streaming writes.
   * Files are written as we traverse, not collected into memory first.
   */
  async writeGameData(gameData: GameData, progressCallback?: ProgressCallback): Promise<number> {
    this.filesWritten = 0;
    this.progressCallback = progressCallback;
    this.activeWrites = 0;
    this.pendingWrites = [];
    this.writeResolvers = [];
    this.createdDirs = new Set<string>();

    // Count total files first (lightweight, just counting)
    this.totalFiles = 1; // index.json
    for (const service of gameData.Services) {
      this.totalFiles += this.countFiles(service);
    }

    this.reportProgress("preparing");

    // Clear/create output directory
    await this.prepareOutputDirectory();

    this.reportProgress("writing");

    // Stream-write each service (writes files as we traverse, not collecting first)
    for (const service of gameData.Services) {
      this.currentService = service.Name;
      await this.streamWriteInstance(service, []);

      // Allow GC between services by yielding
      await new Promise(resolve => setImmediate(resolve));
    }

    // Write root index.json
    const index = buildRootIndex(gameData);
    await this.queueWrite(
      path.join(this.basePath, "index.json"),
      indexToJsonString(index)
    );

    // Wait for all pending writes to complete
    await this.flushWrites();

    this.reportProgress("complete");

    return this.filesWritten;
  }

  /**
   * Report progress via callback
   */
  private reportProgress(phase: WriteProgress["phase"], currentService?: string): void {
    if (this.progressCallback) {
      this.progressCallback({
        phase,
        filesWritten: this.filesWritten,
        totalFiles: this.totalFiles,
        currentService: currentService || this.currentService,
      });
    }
  }

  /**
   * Prepare the output directory (create or clear it)
   */
  private async prepareOutputDirectory(): Promise<void> {
    try {
      // Check if directory exists
      await fs.access(this.basePath);

      // Directory exists, remove only service directories and index.json.
      // Non-service files (claude.md, .gitignore, etc.) are preserved.
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });

      // Delete in parallel
      await Promise.all(
        entries.map(async (entry) => {
          // Only clean entries that belong to the sync output.
          if (!SERVICE_NAMES_SET.has(entry.name) && entry.name !== "index.json") {
            return;
          }

          const fullPath = path.join(this.basePath, entry.name);
          if (entry.isDirectory()) {
            await fs.rm(fullPath, { recursive: true, force: true });
          } else {
            await fs.unlink(fullPath);
          }
        })
      );
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // Directory doesn't exist, create it
        await fs.mkdir(this.basePath, { recursive: true });
      } else {
        throw error;
      }
    }
  }

  /**
   * Queue a write operation. Writes happen with concurrency limiting.
   * Content is not held in memory after being queued - it's written immediately.
   */
  private async queueWrite(filePath: string, content: string): Promise<void> {
    // Ensure directory exists (cached to avoid repeated checks)
    const dirPath = path.dirname(filePath);
    if (!this.createdDirs.has(dirPath)) {
      await fs.mkdir(dirPath, { recursive: true }).catch(() => {});
      this.createdDirs.add(dirPath);
    }

    // If under concurrency limit, write immediately
    if (this.activeWrites < WRITE_CONCURRENCY) {
      this.activeWrites++;
      this.executeWrite(filePath, content);
      return;
    }

    // Otherwise wait for a slot
    return new Promise((resolve) => {
      this.pendingWrites.push({ filePath, content });
      this.writeResolvers.push(resolve);
    });
  }

  /**
   * Execute a single write and trigger next pending write
   */
  private executeWrite(filePath: string, content: string): void {
    fs.writeFile(filePath, content, "utf-8")
      .then(() => {
        this.filesWritten++;
        this.onWriteComplete();
      })
      .catch((err) => {
        console.error(`Failed to write ${filePath}:`, err.message);
        this.filesWritten++;
        this.onWriteComplete();
      });
  }

  /**
   * Called when a write completes - starts next pending write if any
   */
  private onWriteComplete(): void {
    this.activeWrites--;

    // Report progress every 100 files
    if (this.filesWritten % 100 === 0) {
      this.reportProgress("writing");
    }

    // Start next pending write if any
    if (this.pendingWrites.length > 0) {
      const next = this.pendingWrites.shift()!;
      const resolver = this.writeResolvers.shift()!;
      this.activeWrites++;
      this.executeWrite(next.filePath, next.content);
      resolver();
    }
  }

  /**
   * Wait for all pending writes to complete
   */
  private async flushWrites(): Promise<void> {
    while (this.activeWrites > 0 || this.pendingWrites.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Stream-write an instance and its children. Writes files immediately during traversal
   * instead of collecting them all first.
   */
  private async streamWriteInstance(
    instance: RobloxInstance,
    parentPath: string[],
    fsName?: string
  ): Promise<void> {
    const sanitized = fsName ?? sanitizeName(instance.Name);
    const currentPath = [...parentPath, sanitized];
    const isScript = isScriptInstance(instance);
    const hasKids = hasChildren(instance);

    if (isScript && !hasKids) {
      await this.writeScriptFile(instance, currentPath);
    } else if (isScript && hasKids) {
      await this.writeScriptFolder(instance, currentPath);
    } else {
      await this.writeObjectFolder(instance, currentPath);
    }

    // Process children
    if (hasKids) {
      const usedNames = new Set<string>();
      let batchCount = 0;

      for (const child of instance.Children!) {
        const childSanitized = sanitizeName(child.Name);
        const uniqueName = makeUniqueName(childSanitized, usedNames);
        usedNames.add(uniqueName);

        await this.streamWriteInstance(child, currentPath, uniqueName);

        // Yield periodically to allow GC and prevent stack overflow
        batchCount++;
        if (batchCount >= STREAM_BATCH_SIZE) {
          batchCount = 0;
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    }
  }

  /**
   * Write a script file (no children case)
   */
  private async writeScriptFile(instance: RobloxInstance, currentPath: string[]): Promise<void> {
    const dirPath = pathArrayToAbsolute(this.basePath, currentPath.slice(0, -1));
    const baseName = currentPath[currentPath.length - 1];

    let extension = ".lua";
    if (instance.ClassName === "LocalScript") {
      extension = ".client.lua";
    } else if (instance.ClassName === "ModuleScript") {
      extension = ".module.lua";
    }

    const filePath = path.join(dirPath, `${baseName}${extension}`);
    const source = instance.Properties?.Source || "";

    await this.queueWrite(filePath, source);
  }

  /**
   * Write a script folder (script with children)
   */
  private async writeScriptFolder(instance: RobloxInstance, currentPath: string[]): Promise<void> {
    const dirPath = pathArrayToAbsolute(this.basePath, currentPath);
    const fsName = currentPath[currentPath.length - 1];

    // __main__.lua
    const source = instance.Properties?.Source || "";
    await this.queueWrite(path.join(dirPath, "__main__.lua"), source);

    // __main__.json
    const properties = serializeProperties(instance) as Record<string, unknown>;
    if (fsName !== instance.Name && fsName !== sanitizeName(instance.Name)) {
      properties._fsName = fsName;
    }
    await this.queueWrite(path.join(dirPath, "__main__.json"), toJsonString(properties));
  }

  /**
   * Write an object folder (non-script)
   */
  private async writeObjectFolder(instance: RobloxInstance, currentPath: string[]): Promise<void> {
    const dirPath = pathArrayToAbsolute(this.basePath, currentPath);
    const fsName = currentPath[currentPath.length - 1];

    const properties = serializeProperties(instance) as Record<string, unknown>;
    if (fsName !== instance.Name && fsName !== sanitizeName(instance.Name)) {
      properties._fsName = fsName;
    }
    await this.queueWrite(path.join(dirPath, "__main__.json"), toJsonString(properties));
  }

  /**
   * Get the number of files written
   */
  getFilesWritten(): number {
    return this.filesWritten;
  }
}
