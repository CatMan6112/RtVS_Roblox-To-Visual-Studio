/**
 * RtVS Server - Local HTTP server for syncing Roblox Studio to file system
 */

import { app } from "./app";
import { initializeWatcher, stopWatcher, getWatcher } from "./api/changes";
import { pathConfig } from "./config/path-config";
import { preloadExitMessage, getPreloadedExitMessage } from "./utils/exit-message";
import { startVersionChecker } from "./utils/version-checker";
import { logger } from "./utils/logger";
import { initializeDiffStore } from "./commit-mode/diff-store";
import { verifyBases } from "./commit-mode/startup-verifier";

// Configuration
const PORT = Number(process.env.PORT) || 8080;
const HOST = "localhost"; // MUST be "localhost" not "127.0.0.1" for Roblox Studio
const VERSION = "0.1.7"; // Server version

// Start server with async initialization
(async () => {
  // Preload exit message FIRST (before anything else)
  await preloadExitMessage();

  // Prompt for storage path before starting server
  const syncedGamePath = await pathConfig.promptForPath();

  app.listen(PORT, HOST, async () => {
  console.log("\nRtVS Server Started");
  console.log(`Version: ${VERSION}`);
  console.log(`Listening on http://${HOST}:${PORT}`);
  console.log(`Storage path: ${syncedGamePath}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`   GET  /ping                  - Health check`);
  console.log(`   GET  /status                - Server status`);
  console.log(`   POST /sync                  - Sync game data (single request)`);
  console.log(`   POST /sync/start            - Start chunked sync session`);
  console.log(`   POST /sync/chunk            - Send sync chunk`);
  console.log(`   POST /sync/complete         - Complete chunked sync`);
  console.log(`   GET  /sync/status/:id       - Get write progress`);
  console.log(`   GET  /changes               - Poll for file changes`);
  console.log(`   POST /studio-change         - Receive individual Studio changes`);
  console.log(`\nReady to receive sync requests from Roblox Studio plugin\n`);

  // Ensure storage directory exists
  await pathConfig.ensureStorageDirectory();

  // Initialize file watcher
  initializeWatcher(syncedGamePath, pathConfig.getIgnorePaths());

  // Set up commit mode if enabled
  if (pathConfig.getCommitMode()) {
    const store = initializeDiffStore(syncedGamePath);
    await store.initialize(syncedGamePath);

    // Verify bases match live files
    await verifyBases(syncedGamePath, store.getBasesDir());

    // Wire the watcher to route .lua changes to the diff store
    const watcher = getWatcher();
    if (watcher) {
      watcher.setCommitMode(true, async (relativePath, type, content) => {
        await store.recordCommit(relativePath, type, content);
      });
    }

    const pendingCount = await store.getPendingCount();
    console.log(`\nCommit mode active (${pendingCount} pending commit(s))`);
    console.log(`   GET  /commits               - Fetch pending commits`);
    console.log(`   POST /commits/applied        - Mark commits as applied`);
  }

  // Start version checker
  logger.info("Checking for updates...");
  startVersionChecker(VERSION);
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
