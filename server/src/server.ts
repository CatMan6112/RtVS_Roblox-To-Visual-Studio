/**
 * RtVS Server - Local HTTP server for syncing Roblox Studio to file system
 */

import express from "express";
import cors from "cors";
import { handlePing, handleStatus } from "./api/health";
import { handleSync } from "./api/sync";
import { handleChanges, initializeWatcher, stopWatcher } from "./api/changes";
import { handleStudioChange } from "./api/studio-change";
import { pathConfig } from "./config/path-config";
import { preloadExitMessage, getPreloadedExitMessage } from "./utils/exit-message";

const app = express();

// Configuration
const PORT = Number(process.env.PORT) || 8080;
const HOST = "localhost"; // MUST be "localhost" not "127.0.0.1" for Roblox Studio

// Middleware
app.use(cors()); // Enable CORS for cross-origin requests
app.use(express.json({ limit: "100mb" })); // Parse JSON bodies with 100MB limit for large games
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Request logging middleware
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes

/**
 * GET /ping - Health check
 * Returns: { status: "ok", version: "1.0.0" }
 */
app.get("/ping", handlePing);

/**
 * GET /status - Server status
 * Returns: { connected: true, lastSync: "...", filesCount: 0, version: "1.0.0" }
 */
app.get("/status", handleStatus);

/**
 * POST /sync - Receive game data from plugin
 * Body: GameData JSON
 * Returns: { success: true, filesWritten: number, timestamp: "..." }
 */
app.post("/sync", handleSync);

/**
 * GET /changes - Poll for file system changes (Phase 3)
 * Returns: { changes: [] }
 */
app.get("/changes", handleChanges);

/**
 * POST /studio-change - Receive individual file changes from Studio
 * Body: { path: string, content: string, type: "create" | "update" | "delete" }
 * Returns: { success: boolean, path: string, type: string }
 */
app.post("/studio-change", handleStudioChange);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Endpoint ${req.method} ${req.path} does not exist`,
  });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
  });
});

// Start server with async initialization
(async () => {
  // Preload exit message FIRST (before anything else)
  await preloadExitMessage();

  // Prompt for storage path before starting server
  const syncedGamePath = await pathConfig.promptForPath();

  app.listen(PORT, HOST, async () => {
  console.log("\nRtVS Server Started");
  console.log(`Listening on http://${HOST}:${PORT}`);
  console.log(`Storage path: ${syncedGamePath}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`   GET  /ping           - Health check`);
  console.log(`   GET  /status         - Server status`);
  console.log(`   POST /sync           - Sync game data from plugin`);
  console.log(`   GET  /changes        - Poll for file changes`);
  console.log(`   POST /studio-change  - Receive individual Studio changes`);
  console.log(`\nReady to receive sync requests from Roblox Studio plugin\n`);

  // Ensure storage directory exists
  await pathConfig.ensureStorageDirectory();

  // Initialize file watcher
  initializeWatcher(syncedGamePath);
  });
})();

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down RtVS Server...");
  await stopWatcher();
  console.log(getPreloadedExitMessage());
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down RtVS Server...");
  await stopWatcher();
  console.log(getPreloadedExitMessage());
  process.exit(0);
});
