/**
 * Diff Store - Tracks script changes as unified diffs
 *
 * When commit mode is enabled, filesystem changes to .lua files are recorded
 * here as unified diffs instead of being sent to Studio immediately. The diffs
 * are stored in a human-readable file at .rtvs/commits.diff, and a mirror of
 * each script's last-known content is kept in .rtvs/bases/ for computing diffs.
 */

import { createTwoFilesPatch } from "diff";
import path from "path";
import fs from "fs/promises";
import { logger } from "../utils/logger";

export interface CommitEntry {
  timestamp: string;
  path: string;
  type: "create" | "update" | "delete";
  patch: string;
  resolvedContent: string;
}

const COMMIT_SEPARATOR = "# RtVS Commit";

export class DiffStore {
  private basesDir: string;
  private commitsFilePath: string;
  private initialized = false;

  constructor(storagePath: string) {
    const rtvsDir = path.join(storagePath, ".rtvs");
    this.basesDir = path.join(rtvsDir, "bases");
    this.commitsFilePath = path.join(rtvsDir, "commits.diff");
  }

  /**
   * Initialize the .rtvs directory structure and baseline all existing scripts.
   */
  async initialize(storagePath: string): Promise<void> {
    if (this.initialized) return;

    await fs.mkdir(this.basesDir, { recursive: true });

    // Ensure commits.diff exists
    try {
      await fs.access(this.commitsFilePath);
    } catch {
      await fs.writeFile(this.commitsFilePath, "", "utf-8");
    }

    // Baseline any .lua files that don't have a base yet
    await this.baselineNewFiles(storagePath);
    this.initialized = true;
  }

  /**
   * Scan storagePath for .lua files and copy any that don't have a base yet.
   */
  private async baselineNewFiles(storagePath: string): Promise<void> {
    const luaFiles = await this.findLuaFiles(storagePath);
    let baselined = 0;

    for (const relPath of luaFiles) {
      const basePath = path.join(this.basesDir, relPath);
      try {
        await fs.access(basePath);
        // Base already exists
      } catch {
        // No base yet — copy current content
        const srcPath = path.join(storagePath, relPath);
        try {
          const content = await fs.readFile(srcPath, "utf-8");
          await fs.mkdir(path.dirname(basePath), { recursive: true });
          await fs.writeFile(basePath, content, "utf-8");
          baselined++;
        } catch {
          // File may have been deleted between scan and read
        }
      }
    }

    if (baselined > 0) {
      logger.info(`Baselined ${baselined} new script(s) for commit tracking`);
    }
  }

  /**
   * Recursively find all .lua files under a directory, returning relative paths.
   * Skips .rtvs directory.
   */
  private async findLuaFiles(dir: string, base?: string): Promise<string[]> {
    const results: string[] = [];
    const baseDir = base || dir;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, fullPath);

      if (entry.name === ".rtvs" || entry.name.startsWith(".")) continue;

      if (entry.isDirectory()) {
        const subFiles = await this.findLuaFiles(fullPath, baseDir);
        results.push(...subFiles);
      } else if (entry.name.endsWith(".lua")) {
        results.push(relPath);
      }
    }

    return results;
  }

  /**
   * Record a commit (script change) as a unified diff.
   */
  async recordCommit(
    relativePath: string,
    type: "create" | "update" | "delete",
    newContent: string
  ): Promise<void> {
    const basePath = path.join(this.basesDir, relativePath);
    let oldContent = "";

    try {
      oldContent = await fs.readFile(basePath, "utf-8");
    } catch {
      // Base doesn't exist — this is a create
    }

    // Don't record if content hasn't actually changed
    if (type === "update" && oldContent === newContent) {
      return;
    }

    let patch = "";
    if (type !== "delete") {
      patch = createTwoFilesPatch(
        `a/${relativePath}`,
        `b/${relativePath}`,
        oldContent,
        newContent,
        "",
        "",
        { context: 3 }
      );
    }

    const header = [
      COMMIT_SEPARATOR,
      `# timestamp: ${new Date().toISOString()}`,
      `# path: ${relativePath}`,
      `# type: ${type}`,
      "",
    ].join("\n");

    await fs.appendFile(this.commitsFilePath, header + patch + "\n");

    // Update bases mirror
    if (type === "delete") {
      await fs.unlink(basePath).catch(() => {});
    } else {
      await fs.mkdir(path.dirname(basePath), { recursive: true });
      await fs.writeFile(basePath, newContent, "utf-8");
    }

    logger.info(`Commit recorded: ${type} ${relativePath}`);
  }

  /**
   * Parse commits.diff and return all pending commits.
   * resolvedContent is read from the bases mirror (current state).
   */
  async listPendingCommits(): Promise<CommitEntry[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.commitsFilePath, "utf-8");
    } catch {
      return [];
    }

    if (!raw.trim()) return [];

    const blocks = raw.split(COMMIT_SEPARATOR).filter((b) => b.trim());
    const commits: CommitEntry[] = [];

    for (const block of blocks) {
      const lines = block.split("\n");
      let timestamp = "";
      let filePath = "";
      let type: "create" | "update" | "delete" = "update";
      const patchLines: string[] = [];
      let inPatch = false;

      for (const line of lines) {
        if (line.startsWith("# timestamp: ")) {
          timestamp = line.slice("# timestamp: ".length);
        } else if (line.startsWith("# path: ")) {
          filePath = line.slice("# path: ".length);
        } else if (line.startsWith("# type: ")) {
          type = line.slice("# type: ".length) as "create" | "update" | "delete";
        } else if (line.startsWith("---") || inPatch) {
          inPatch = true;
          patchLines.push(line);
        }
      }

      // Read resolved content from bases mirror
      let resolvedContent = "";
      if (type !== "delete") {
        try {
          resolvedContent = await fs.readFile(
            path.join(this.basesDir, filePath),
            "utf-8"
          );
        } catch {
          // Base may have been deleted
        }
      }

      commits.push({
        timestamp,
        path: filePath,
        type,
        patch: patchLines.join("\n"),
        resolvedContent,
      });
    }

    return commits;
  }

  /**
   * Clear all pending commits.
   */
  async clearCommits(): Promise<number> {
    const commits = await this.listPendingCommits();
    const count = commits.length;
    await fs.writeFile(this.commitsFilePath, "", "utf-8");
    logger.info(`Cleared ${count} pending commit(s)`);
    return count;
  }

  /**
   * Get count of pending commits without full parse.
   */
  async getPendingCount(): Promise<number> {
    try {
      const raw = await fs.readFile(this.commitsFilePath, "utf-8");
      if (!raw.trim()) return 0;
      return raw.split(COMMIT_SEPARATOR).filter((b) => b.trim()).length;
    } catch {
      return 0;
    }
  }

  /**
   * Get the bases directory path (for startup verification).
   */
  getBasesDir(): string {
    return this.basesDir;
  }

  /**
   * Get the commits file path.
   */
  getCommitsFilePath(): string {
    return this.commitsFilePath;
  }
}

/** Singleton — initialized in server.ts when commit mode is enabled */
export let diffStore: DiffStore | null = null;

export function initializeDiffStore(storagePath: string): DiffStore {
  diffStore = new DiffStore(storagePath);
  return diffStore;
}
