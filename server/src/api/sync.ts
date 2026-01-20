/**
 * Sync endpoint - receives game data from plugin and writes to file system
 */

import { Request, Response } from "express";
import { GameData } from "../types/roblox";
import { SyncResponse } from "../types/api";
import { FileSystemWriter } from "../file-system/writer";
import { updateSyncStats } from "./health";
import { getWatcher } from "./changes";
import { pathConfig } from "../config/path-config";

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

    console.log(`Received sync request with ${gameData.Services.length} services`);

    // Pause file watcher to avoid detecting our own writes
    const watcher = getWatcher();
    if (watcher) {
      watcher.pause();
      watcher.clearQueue(); // Clear any pending changes
    }

    let filesWritten = 0;

    try {
      // Write to file system
      const SYNCED_GAME_PATH = await pathConfig.getStoragePath();
      const writer = new FileSystemWriter(SYNCED_GAME_PATH);
      filesWritten = await writer.writeGameData(gameData);

      // Update stats
      updateSyncStats(filesWritten);

      console.log(`Sync complete: ${filesWritten} files written to ${SYNCED_GAME_PATH}`);

      // Wait a bit for all file writes to settle
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      // Resume file watcher
      if (watcher) {
        watcher.resume();
      }
    }

    // Send success response
    const response: SyncResponse = {
      success: true,
      filesWritten,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error: any) {
    console.error("Sync error:", error);

    const response: SyncResponse = {
      success: false,
      error: error.message || "Unknown error occurred",
    };

    res.status(500).json(response);
  }
}
