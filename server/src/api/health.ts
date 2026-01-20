/**
 * Health check and status endpoints
 */

import { Request, Response } from "express";
import { PingResponse, StatusResponse } from "../types/api";

const VERSION = "0.1.1";

// Track last sync time
let lastSyncTime: string | null = null;
let totalFilesWritten: number = 0;

/**
 * GET /ping - Simple health check
 */
export function handlePing(_req: Request, res: Response): void {
  const response: PingResponse = {
    status: "ok",
    version: VERSION,
  };

  res.json(response);
}

/**
 * GET /status - Detailed server status
 */
export function handleStatus(_req: Request, res: Response): void {
  const response: StatusResponse = {
    connected: true,
    lastSync: lastSyncTime,
    filesCount: totalFilesWritten,
    version: VERSION,
  };

  res.json(response);
}

/**
 * Update sync statistics (called by sync endpoint)
 */
export function updateSyncStats(filesWritten: number): void {
  lastSyncTime = new Date().toISOString();
  totalFilesWritten = filesWritten;
}
