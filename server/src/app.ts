/**
 * Express app setup - separated from server startup for testability
 */

import express from "express";
import cors from "cors";
import { handlePing, handleStatus } from "./api/health";
import { handleSync } from "./api/sync";
import { handleSyncStart, handleSyncChunk, handleSyncComplete, handleSyncStatus } from "./api/sync-chunked";
import { handleChanges } from "./api/changes";
import { handleStudioChange } from "./api/studio-change";
import { handleGetCommits, handleCommitsApplied } from "./api/commits";
import { logger } from "./utils/logger";

export const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.get("/ping", handlePing);
app.get("/status", handleStatus);
app.post("/sync", handleSync);
app.post("/sync/start", handleSyncStart);
app.post("/sync/chunk", handleSyncChunk);
app.post("/sync/complete", handleSyncComplete);
app.get("/sync/status/:sessionId", handleSyncStatus);
app.get("/changes", handleChanges);
app.post("/studio-change", handleStudioChange);
app.get("/commits", handleGetCommits);
app.post("/commits/applied", handleCommitsApplied);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Endpoint ${req.method} ${req.path} does not exist`,
  });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Server error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
  });
});
