/**
 * Chunked sync endpoints for handling large games
 * Allows sending game data in multiple smaller requests
 */

import { Request, Response } from "express";
import { RobloxInstance } from "../types/roblox";
import { SyncResponse } from "../types/api";
import { FileSystemWriter } from "../file-system/writer";
import { updateSyncStats } from "./health";
import { getWatcher } from "./changes";
import { pathConfig } from "../config/path-config";
import {
  createSession,
  getSession,
  addServiceToSession,
  addWorkspaceChunk,
  addDeepChunk,
  assembleGameData,
  deleteSession,
  getSessionProgress,
  initWriteProgress,
  updateWriteProgress,
  getWriteProgress,
  clearWriteProgress,
} from "../sync-session";

// Types for chunked sync requests
interface StartSyncRequest {
  expectedServices?: number;
}

interface StartSyncResponse {
  success: boolean;
  sessionId?: string;
  error?: string;
}

interface ChunkRequest {
  sessionId: string;
  type: "service" | "workspace_chunk" | "deep_chunk";
  serviceName?: string;
  serviceData?: RobloxInstance;
  chunkIndex?: number;
  totalChunks?: number;
  children?: RobloxInstance[];
  // For deep chunks
  parentPath?: string;
  instanceData?: RobloxInstance;
}

interface ChunkResponse {
  success: boolean;
  received: boolean;
  progress?: string;
  error?: string;
}

interface CompleteSyncRequest {
  sessionId: string;
}

/**
 * POST /sync/start - Initialize a chunked sync session
 */
export async function handleSyncStart(req: Request, res: Response): Promise<void> {
  try {
    const body: StartSyncRequest = req.body;
    const expectedServices = body.expectedServices || 13; // Default to all services

    const session = createSession(expectedServices);

    console.log(`Started chunked sync session: ${session.id}`);

    const response: StartSyncResponse = {
      success: true,
      sessionId: session.id,
    };

    res.json(response);
  } catch (error: any) {
    console.error("Error starting sync session:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to start sync session",
    } as StartSyncResponse);
  }
}

/**
 * POST /sync/chunk - Receive a chunk of game data
 */
export async function handleSyncChunk(req: Request, res: Response): Promise<void> {
  try {
    const body: ChunkRequest = req.body;

    // Validate session ID
    if (!body.sessionId) {
      res.status(400).json({
        success: false,
        received: false,
        error: "Missing sessionId",
      } as ChunkResponse);
      return;
    }

    const session = getSession(body.sessionId);
    if (!session) {
      res.status(404).json({
        success: false,
        received: false,
        error: "Session not found or expired",
      } as ChunkResponse);
      return;
    }

    // Handle different chunk types
    if (body.type === "service") {
      // Validate service data
      if (!body.serviceName || !body.serviceData) {
        res.status(400).json({
          success: false,
          received: false,
          error: "Missing serviceName or serviceData for service chunk",
        } as ChunkResponse);
        return;
      }

      const added = addServiceToSession(body.sessionId, body.serviceName, body.serviceData);
      if (!added) {
        res.status(500).json({
          success: false,
          received: false,
          error: "Failed to add service to session",
        } as ChunkResponse);
        return;
      }

      console.log(`Received service chunk: ${body.serviceName} (session: ${body.sessionId.slice(0, 8)}...)`);
    } else if (body.type === "workspace_chunk") {
      // Validate workspace chunk data
      if (body.chunkIndex === undefined || body.totalChunks === undefined || !body.children) {
        res.status(400).json({
          success: false,
          received: false,
          error: "Missing chunkIndex, totalChunks, or children for workspace chunk",
        } as ChunkResponse);
        return;
      }

      const added = addWorkspaceChunk(
        body.sessionId,
        body.chunkIndex,
        body.totalChunks,
        body.children
      );
      if (!added) {
        res.status(500).json({
          success: false,
          received: false,
          error: "Failed to add workspace chunk to session",
        } as ChunkResponse);
        return;
      }

      console.log(
        `Received Workspace chunk ${body.chunkIndex + 1}/${body.totalChunks} ` +
        `(${body.children.length} children, session: ${body.sessionId.slice(0, 8)}...)`
      );
    } else if (body.type === "deep_chunk") {
      // Validate deep chunk data
      if (!body.parentPath || !body.instanceData) {
        res.status(400).json({
          success: false,
          received: false,
          error: "Missing parentPath or instanceData for deep chunk",
        } as ChunkResponse);
        return;
      }

      const added = addDeepChunk(body.sessionId, body.parentPath, body.instanceData);
      if (!added) {
        res.status(500).json({
          success: false,
          received: false,
          error: "Failed to add deep chunk to session",
        } as ChunkResponse);
        return;
      }

      // Only log occasionally to avoid spam (every 100 chunks)
      const session = getSession(body.sessionId);
      if (session && session.deepChunks.length % 100 === 0) {
        console.log(
          `Received ${session.deepChunks.length} deep chunks (session: ${body.sessionId.slice(0, 8)}...)`
        );
      }
    } else {
      res.status(400).json({
        success: false,
        received: false,
        error: `Unknown chunk type: ${body.type}`,
      } as ChunkResponse);
      return;
    }

    const response: ChunkResponse = {
      success: true,
      received: true,
      progress: getSessionProgress(body.sessionId),
    };

    res.json(response);
  } catch (error: any) {
    console.error("Error handling sync chunk:", error);
    res.status(500).json({
      success: false,
      received: false,
      error: error.message || "Failed to process chunk",
    } as ChunkResponse);
  }
}

/**
 * POST /sync/complete - Finalize chunked sync and write to filesystem
 * IMPORTANT: This endpoint responds immediately and writes files in the background.
 * The client should poll /sync/status/:sessionId for progress.
 */
export async function handleSyncComplete(req: Request, res: Response): Promise<void> {
  try {
    const body: CompleteSyncRequest = req.body;

    // Validate session ID
    if (!body.sessionId) {
      res.status(400).json({
        success: false,
        error: "Missing sessionId",
      } as SyncResponse);
      return;
    }

    const session = getSession(body.sessionId);
    if (!session) {
      res.status(404).json({
        success: false,
        error: "Session not found or expired",
      } as SyncResponse);
      return;
    }

    console.log(`Completing chunked sync session: ${body.sessionId.slice(0, 8)}...`);
    console.log(`Final progress: ${getSessionProgress(body.sessionId)}`);

    // Initialize write progress tracking
    initWriteProgress(body.sessionId);

    // Assemble complete GameData from chunks
    const gameData = assembleGameData(body.sessionId);
    if (!gameData) {
      updateWriteProgress(body.sessionId, { phase: "error", error: "Failed to assemble game data" });
      res.status(500).json({
        success: false,
        error: "Failed to assemble game data from chunks",
      } as SyncResponse);
      return;
    }

    console.log(`Assembled GameData with ${gameData.Services.length} services`);

    // Respond immediately - file writing happens in the background
    // The client should poll /sync/status/:sessionId for progress
    res.json({
      success: true,
      started: true,
      message: "File writing started. Poll /sync/status/:sessionId for progress.",
      timestamp: new Date().toISOString(),
    } as SyncResponse & { started: boolean; message: string });

    // Delete session immediately to free memory - gameData now owns the data
    deleteSession(body.sessionId);

    // Write files in the background (after response is sent)
    setImmediate(async () => {
      // Pause file watcher to avoid detecting our own writes
      const watcher = getWatcher();
      if (watcher) {
        watcher.pause();
        watcher.clearQueue();
      }

      let filesWritten = 0;

      try {
        // Write to file system with progress tracking
        const SYNCED_GAME_PATH = await pathConfig.getStoragePath();
        const writer = new FileSystemWriter(SYNCED_GAME_PATH);

        filesWritten = await writer.writeGameData(gameData, (progress) => {
          updateWriteProgress(body.sessionId, {
            phase: progress.phase,
            filesWritten: progress.filesWritten,
            totalFiles: progress.totalFiles,
            currentService: progress.currentService,
          });
        });

        // Update stats
        updateSyncStats(filesWritten);

        // Mark as complete
        updateWriteProgress(body.sessionId, {
          phase: "complete",
          filesWritten,
        });

        console.log(`Chunked sync complete: ${filesWritten} files written to ${SYNCED_GAME_PATH}`);

        // Wait a bit for all file writes to settle
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (writeError: any) {
        console.error("Error writing files:", writeError);
        updateWriteProgress(body.sessionId, {
          phase: "error",
          error: writeError.message || "Write failed",
        });
      } finally {
        // Resume file watcher
        if (watcher) {
          watcher.resume();
        }

        // Keep progress available for a bit longer so client can poll final status
        setTimeout(() => {
          clearWriteProgress(body.sessionId);
        }, 60000); // Keep progress for 1 minute after completion
      }
    });
  } catch (error: any) {
    console.error("Error completing sync:", error);

    // Try to clean up session on error
    if (req.body.sessionId) {
      deleteSession(req.body.sessionId);
      updateWriteProgress(req.body.sessionId, {
        phase: "error",
        error: error.message || "Failed to complete sync",
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to complete sync",
    } as SyncResponse);
  }
}

/**
 * GET /sync/status/:sessionId - Get write progress for a session
 */
export async function handleSyncStatus(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = req.params.sessionId;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: "Missing sessionId",
      });
      return;
    }

    const progress = getWriteProgress(sessionId);

    if (!progress) {
      res.status(404).json({
        success: false,
        error: "Session not found or progress not available",
      });
      return;
    }

    res.json({
      success: true,
      ...progress,
    });
  } catch (error: any) {
    console.error("Error getting sync status:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to get sync status",
    });
  }
}
