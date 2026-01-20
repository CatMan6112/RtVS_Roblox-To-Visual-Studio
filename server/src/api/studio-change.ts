/**
 * Studio Change endpoint - receives individual file changes from Studio
 * Used when "Prioritize Studio" mode is enabled
 */

import { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { getWatcher } from "./changes";
import { pathConfig } from "../config/path-config";

export interface StudioChangeRequest {
  path: string; // Relative path like "Workspace/Part1/__main__.json"
  content: string; // File content
  type: "create" | "update" | "delete";
}

/**
 * POST /studio-change - Receive individual file change from Studio
 * Used when plugin is in "Prioritize Studio" mode
 */
export async function handleStudioChange(req: Request, res: Response): Promise<void> {
  try {
    const { path: relativePath, content, type } = req.body as StudioChangeRequest;

    if (!relativePath) {
      res.status(400).json({
        success: false,
        error: "Missing 'path' in request body",
      });
      return;
    }

    if (!type || !["create", "update", "delete"].includes(type)) {
      res.status(400).json({
        success: false,
        error: "Invalid or missing 'type' (must be create, update, or delete)",
      });
      return;
    }

    const syncedGamePath = await pathConfig.getStoragePath();
    const fullPath = path.join(syncedGamePath, relativePath);

    // Temporarily pause the file watcher to prevent circular updates
    const watcher = getWatcher();
    if (watcher) {
      await watcher.pause();
    }

    try {
      if (type === "delete") {
        // Delete the file
        try {
          await fs.unlink(fullPath);
          console.log(`Deleted: ${relativePath}`);
        } catch (error: any) {
          if (error.code !== "ENOENT") {
            throw error;
          }
          // File doesn't exist, that's fine
        }
      } else {
        // Create or update the file
        if (!content && content !== "") {
          res.status(400).json({
            success: false,
            error: "Missing 'content' for create/update operation",
          });
          return;
        }

        // Ensure parent directory exists
        const parentDir = path.dirname(fullPath);
        await fs.mkdir(parentDir, { recursive: true });

        // Write the file
        await fs.writeFile(fullPath, content, "utf-8");

        if (type === "create") {
          console.log(`Created: ${relativePath}`);
        } else {
          console.log(`Updated: ${relativePath}`);
        }
      }

      res.json({
        success: true,
        path: relativePath,
        type,
      });
    } finally {
      // Resume the file watcher after a short delay
      if (watcher) {
        setTimeout(() => {
          watcher.resume();
        }, 100);
      }
    }
  } catch (error: any) {
    console.error("Error handling studio change:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
