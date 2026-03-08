/**
 * Startup Verifier - Checks that .rtvs/bases/ matches actual files on disk
 *
 * If scripts were edited outside of commit mode (e.g. git checkout, manual edit),
 * the bases mirror will be stale. This verifier detects mismatches and prompts
 * the user to re-baseline or abort.
 */

import path from "path";
import fs from "fs/promises";
import readlineSync from "readline-sync";
import { simpleHash } from "../change-tracker";
import { logger } from "../utils/logger";

export interface VerificationResult {
  verified: boolean;
  rebaselined: string[];
  mismatches: string[];
}

/**
 * Verify that all base files match their live counterparts.
 * If mismatches are found, prompt the user to re-baseline or abort.
 */
export async function verifyBases(
  storagePath: string,
  basesDir: string
): Promise<VerificationResult> {
  const mismatches: string[] = [];

  // Check if bases directory exists
  try {
    await fs.access(basesDir);
  } catch {
    // No bases yet — nothing to verify
    return { verified: true, rebaselined: [], mismatches: [] };
  }

  const baseFiles = await findAllFiles(basesDir);

  for (const relPath of baseFiles) {
    const basePath = path.join(basesDir, relPath);
    const livePath = path.join(storagePath, relPath);

    try {
      const baseContent = await fs.readFile(basePath, "utf-8");
      const liveContent = await fs.readFile(livePath, "utf-8");

      if (simpleHash(baseContent) !== simpleHash(liveContent)) {
        mismatches.push(relPath);
      }
    } catch {
      // Live file doesn't exist but base does — mismatch
      mismatches.push(relPath);
    }
  }

  if (mismatches.length === 0) {
    logger.info("Commit mode: all bases verified OK");
    return { verified: true, rebaselined: [], mismatches: [] };
  }

  // Print mismatches
  console.log("\n========================================");
  console.log("COMMIT MODE: BASE MISMATCH DETECTED");
  console.log("========================================");
  console.log("The following scripts have changed outside of commit mode:");
  console.log("");
  for (const m of mismatches) {
    console.log(`  - ${m}`);
  }
  console.log("");
  console.log("Pending commits for these files may not apply correctly.");
  console.log("");

  const choice = readlineSync.question(
    "(R)e-baseline these files and discard their commits, or (A)bort? [R/A]: ",
    { defaultInput: "R" }
  );

  if (choice.toUpperCase() === "A") {
    console.log("Aborting startup.");
    process.exit(1);
  }

  // Re-baseline mismatched files
  const rebaselined: string[] = [];
  for (const relPath of mismatches) {
    const basePath = path.join(basesDir, relPath);
    const livePath = path.join(storagePath, relPath);

    try {
      const liveContent = await fs.readFile(livePath, "utf-8");
      await fs.mkdir(path.dirname(basePath), { recursive: true });
      await fs.writeFile(basePath, liveContent, "utf-8");
      rebaselined.push(relPath);
    } catch {
      // Live file doesn't exist — remove the stale base
      await fs.unlink(basePath).catch(() => {});
      rebaselined.push(relPath);
    }
  }

  logger.info(`Re-baselined ${rebaselined.length} file(s)`);
  console.log(`Re-baselined ${rebaselined.length} file(s). Continuing startup.`);
  console.log("========================================\n");

  return { verified: true, rebaselined, mismatches };
}

/**
 * Recursively find all files under a directory, returning relative paths.
 */
async function findAllFiles(dir: string, base?: string): Promise<string[]> {
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
    if (entry.isDirectory()) {
      const subFiles = await findAllFiles(fullPath, baseDir);
      results.push(...subFiles);
    } else {
      results.push(path.relative(baseDir, fullPath));
    }
  }

  return results;
}
