/**
 * Sync endpoint - receives game data from plugin and writes to file system
 */

import { Request, Response } from "express";
import { GameData } from "../types/roblox";
import { SyncResponse } from "../types/api";
import { FileSystemWriter } from "../file-system/writer";
import { generateManifest, saveManifest } from "../file-system/manifest";
import { updateSyncStats } from "./health";
import { getWatcher, getChangeTracker } from "./changes";
import { pathConfig } from "../config/path-config";
import { logger } from "../utils/logger";

/**
 * POST /sync - Receive game data from plugin
 */
export async function handleSync(req: Request, res: Response): Promise<void> {
  try {
    const gameData: GameData = req.body;

    // Validate request body
    if (!gameData || !gameData.Services) {
      res.status(400).json({
        success: false,
        error: "Invalid request body: missing Services array",
      } as SyncResponse);
      return;
    }

    // Validate it's a DataModel
    if (gameData.ClassName !== "DataModel") {
      res.status(400).json({
        success: false,
        error: `Invalid ClassName: expected "DataModel", got "${gameData.ClassName}"`,
      } as SyncResponse);
      return;
    }

    logger.info(`Received sync request with ${gameData.Services.length} services`);

    // Enter bulk write mode to suppress all watcher events during full sync
    const changeTracker = getChangeTracker();
    changeTracker.beginBulkWrite();

    const watcher = getWatcher();
    if (watcher) {
      watcher.clearQueue(); // Clear any pending changes
    }

    let filesWritten = 0;

    try {
      // Write to file system
      const SYNCED_GAME_PATH = await pathConfig.getStoragePath();
      const writer = new FileSystemWriter(SYNCED_GAME_PATH);
      filesWritten = await writer.writeGameData(gameData);

      // Generate sync manifest for future delta syncs
      try {
        const manifest = await generateManifest(SYNCED_GAME_PATH, "0.1.4");
        await saveManifest(SYNCED_GAME_PATH, manifest);
      } catch (manifestError: any) {
        logger.warn("Failed to generate sync manifest:", manifestError.message);
      }

      // Update stats
      updateSyncStats(filesWritten);

      logger.info(`Sync complete: ${filesWritten} files written to ${SYNCED_GAME_PATH}`);

      // Wait a bit for all file writes to settle
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      // Exit bulk write mode
      changeTracker.endBulkWrite();
    }

    // Send success response
    const response: SyncResponse = {
      success: true,
      filesWritten,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error: any) {
    logger.error("Sync error:", error);

    const response: SyncResponse = {
      success: false,
      error: error.message || "Unknown error occurred",
    };

    res.status(500).json(response);
  }
}
