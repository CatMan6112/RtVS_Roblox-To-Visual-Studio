/**
 * Changes endpoint - returns file system changes
 */

import { Request, Response } from "express";
import { ChangesResponse, FileChangeWithContent } from "../types/api";
import { FileSystemWatcher } from "../file-system/watcher";
import { pathConfig } from "../config/path-config";
import fs from "fs/promises";
import path from "path";

let watcher: FileSystemWatcher | null = null;

/**
 * Initialize the file watcher
 */
export function initializeWatcher(watchPath: string): void {
  if (watcher) {
    console.warn("File watcher already initialized");
    return;
  }

  watcher = new FileSystemWatcher(watchPath);
  watcher.start();
}

/**
 * Stop the file watcher
 */
export async function stopWatcher(): Promise<void> {
  if (watcher) {
    await watcher.stop();
    watcher = null;
  }
}

/**
 * Get the watcher instance (for pausing during sync operations)
 */
export function getWatcher(): FileSystemWatcher | null {
  return watcher;
}

/**
 * GET /changes - Poll for file system changes
 * Returns changes with file content for updates/creates
 */
export async function handleChanges(_req: Request, res: Response): Promise<void> {
  try {
    if (!watcher) {
      res.status(503).json({
        error: "File watcher not initialized",
        changes: [],
      } as ChangesResponse);
      return;
    }

    // Get all pending changes
    const changes = watcher.getChanges();

    // Get the configured storage path
    const storagePath = await pathConfig.getStoragePath();

    // For each change, read the file content if it's a create or update
    const changesWithContent: FileChangeWithContent[] = await Promise.all(
      changes.map(async (change) => {
        const fullPath = path.join(storagePath, change.path);

        let content: string | undefined = undefined;

        // Read file content for creates and updates
        if (change.type === "create" || change.type === "update") {
          try {
            content = await fs.readFile(fullPath, "utf-8");
          } catch (error: any) {
            console.warn(`Could not read file ${change.path}:`, error.message);
            // Log the attempted path for debugging
            console.warn(`    Attempted path: ${fullPath}`);
          }
        }

        return {
          ...change,
          content,
        };
      })
    );

    const response: ChangesResponse = {
      changes: changesWithContent,
    };

    if (changesWithContent.length > 0) {
      console.log(`Sending ${changesWithContent.length} changes to plugin`);
    }

    res.json(response);
  } catch (error: any) {
    console.error("Error getting changes:", error);
    res.status(500).json({
      error: error.message,
      changes: [],
    } as ChangesResponse);
  }
}
