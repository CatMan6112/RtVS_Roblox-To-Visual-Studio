/**
 * Studio Change endpoint - receives individual file changes from Studio
 * Used when "Prioritize Studio" or "Bidirectional" mode is enabled.
 *
 * Echo suppression: Before writing, checks the ChangeTracker to see if
 * this change is an echo of an FS-originated change that was just applied
 * to Studio. If so, the write is skipped (the file already has this content).
 */

import { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { getChangeTracker } from "./changes";
import { pathConfig } from "../config/path-config";
import { simpleHash } from "../change-tracker";
import { logger } from "../utils/logger";

export interface StudioChangeRequest {
  path: string; // Relative path like "Workspace/Part1/__main__.json"
  content: string; // File content
  type: "create" | "update" | "delete";
}

/**
 * POST /studio-change - Receive individual file change from Studio
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

    const changeTracker = getChangeTracker();
    const contentHash = type !== "delete" ? simpleHash(content || "") : "";

    // Check if this is an echo of an FS-originated change applied to Studio
    if (!changeTracker.shouldWriteToFs(relativePath, contentHash)) {
      logger.info(`Suppressed echo ${type}: ${relativePath}`);
      res.json({ success: true, path: relativePath, type, suppressed: true });
      return;
    }

    const syncedGamePath = await pathConfig.getStoragePath();
    const fullPath = path.join(syncedGamePath, relativePath);

    // Mark studio origin so the watcher suppresses the echo
    changeTracker.markStudioOrigin(relativePath, contentHash);

    if (type === "delete") {
      // Delete the file
      try {
        await fs.unlink(fullPath);
        logger.info(`Deleted: ${relativePath}`);
      } catch (error: any) {
        if (error.code !== "ENOENT") {
          throw error;
        }
        // File doesn't exist, that's fine
      }

      // Clean up empty parent directories (handles container/folder deletions).
      // Walk up from the deleted file's directory, removing directories that are
      // now empty. Stop at the storage root so we never delete service-level dirs.
      let dirToRemove = path.dirname(fullPath);
      while (dirToRemove !== syncedGamePath && dirToRemove.startsWith(syncedGamePath)) {
        try {
          await fs.rmdir(dirToRemove); // fails if non-empty — intentional
          logger.info(`Removed empty directory: ${path.relative(syncedGamePath, dirToRemove)}`);
          dirToRemove = path.dirname(dirToRemove);
        } catch {
          break; // directory not empty or already gone — stop climbing
        }
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
        logger.info(`Created: ${relativePath}`);
      } else {
        logger.info(`Updated: ${relativePath}`);
      }
    }

    res.json({
      success: true,
      path: relativePath,
      type,
    });
  } catch (error: any) {
    logger.error("Error handling studio change:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
