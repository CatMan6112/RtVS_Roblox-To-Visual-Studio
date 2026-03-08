/**
 * Commits API - Serves pending commit diffs to the plugin
 */

import { Request, Response } from "express";
import { diffStore } from "../commit-mode/diff-store";
import { getChangeTracker } from "./changes";
import { simpleHash } from "../change-tracker";
import { logger } from "../utils/logger";

/**
 * GET /commits - Return all pending commits with resolved content
 */
export async function handleGetCommits(_req: Request, res: Response): Promise<void> {
  try {
    if (!diffStore) {
      res.status(503).json({
        error: "Commit mode is not enabled",
        commits: [],
      });
      return;
    }

    const commits = await diffStore.listPendingCommits();
    res.json({ commits });
  } catch (error: any) {
    logger.error("Error getting commits:", error);
    res.status(500).json({
      error: error.message,
      commits: [],
    });
  }
}

/**
 * POST /commits/applied - Mark all commits as applied, clear the file
 */
export async function handleCommitsApplied(_req: Request, res: Response): Promise<void> {
  try {
    if (!diffStore) {
      res.status(503).json({ error: "Commit mode is not enabled" });
      return;
    }

    // Get commits before clearing so we can set up echo suppression
    const commits = await diffStore.listPendingCommits();
    const changeTracker = getChangeTracker();

    // Mark each applied path for echo suppression so Studio's subsequent
    // studio-change events don't cause echo writes back to disk
    for (const commit of commits) {
      if (commit.type !== "delete" && commit.resolvedContent) {
        changeTracker.markFsOrigin(commit.path, simpleHash(commit.resolvedContent));
      }
    }

    const cleared = await diffStore.clearCommits();
    res.json({ success: true, cleared });
  } catch (error: any) {
    logger.error("Error clearing commits:", error);
    res.status(500).json({ error: error.message });
  }
}
