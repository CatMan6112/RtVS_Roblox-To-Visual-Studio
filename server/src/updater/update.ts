/**
 * RtVS Update Script
 * Pulls latest files from GitHub and updates the local installation
 *
 * Usage: npm run update [--force] [--dry-run] [--verbose]
 */

import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";
import { FILES_TO_UPDATE } from "./file-manifest";
import { fetchFromGitHub } from "./github-fetcher";

interface UpdateOptions {
  force: boolean;
  dryRun: boolean;
  verbose: boolean;
}

interface VersionInfo {
  version: string;
  releaseDate: string;
  changelog: Record<string, string[]>;
}

interface UpdateResult {
  filesUpdated: number;
  filesSkipped: number;
  filesFailed: number;
  errors: string[];
}

function parseArgs(): UpdateOptions {
  const args = process.argv.slice(2);
  return {
    force: args.includes("--force") || args.includes("-f"),
    dryRun: args.includes("--dry-run") || args.includes("-n"),
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
}

function getRepoRoot(): string {
  // update.ts is at server/src/updater/update.ts
  // repo root is 3 levels up
  return path.resolve(__dirname, "..", "..", "..");
}

async function getCurrentVersion(): Promise<string> {
  const packagePath = path.join(getRepoRoot(), "server", "package.json");
  const content = await fs.readFile(packagePath, "utf-8");
  const pkg = JSON.parse(content);
  return pkg.version;
}

async function getRemoteVersion(): Promise<VersionInfo | null> {
  const result = await fetchFromGitHub("version.json");
  if (!result.success || !result.content) {
    return null;
  }
  try {
    return JSON.parse(result.content);
  } catch {
    return null;
  }
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

function displayChangelog(
  versionInfo: VersionInfo,
  currentVersion: string
): void {
  console.log("\nChanges in this update:");
  console.log("----------------------------------------");

  const versions = Object.keys(versionInfo.changelog).sort((a, b) =>
    compareVersions(b, a)
  );

  for (const version of versions) {
    if (compareVersions(version, currentVersion) > 0) {
      console.log(`\nv${version}:`);
      for (const change of versionInfo.changelog[version]) {
        console.log(`  - ${change}`);
      }
    }
  }
  console.log("----------------------------------------\n");
}

function isExcluded(filePath: string): boolean {
  return filePath.startsWith("server/src/updater/");
}

async function update(): Promise<void> {
  const options = parseArgs();
  const repoRoot = getRepoRoot();

  console.log("========================================");
  console.log("RtVS Updater");
  console.log("========================================\n");

  if (options.dryRun) {
    console.log("DRY RUN MODE - No files will be modified\n");
  }

  // Step 1: Check versions
  console.log("Checking versions...");
  const currentVersion = await getCurrentVersion();
  console.log(`Current version: v${currentVersion}`);

  const remoteVersionInfo = await getRemoteVersion();
  if (!remoteVersionInfo) {
    console.error("Failed to fetch version info from GitHub");
    console.error("Check your internet connection and try again.");
    process.exit(1);
  }

  const remoteVersion = remoteVersionInfo.version;
  console.log(`Latest version:  v${remoteVersion}`);

  const comparison = compareVersions(remoteVersion, currentVersion);

  if (comparison === 0 && !options.force) {
    console.log("\nYou are already on the latest version.");
    console.log("Use --force to reinstall anyway.");
    return;
  }

  if (comparison < 0 && !options.force) {
    console.log("\nYour version is ahead of the latest release.");
    console.log("Use --force to downgrade.");
    return;
  }

  if (comparison > 0) {
    displayChangelog(remoteVersionInfo, currentVersion);
  }

  // Step 2: Download and update files
  console.log("Downloading files...\n");

  const result: UpdateResult = {
    filesUpdated: 0,
    filesSkipped: 0,
    filesFailed: 0,
    errors: [],
  };

  const totalFiles = FILES_TO_UPDATE.length;

  for (let i = 0; i < FILES_TO_UPDATE.length; i++) {
    const file = FILES_TO_UPDATE[i];
    const progress = `[${i + 1}/${totalFiles}]`;

    // Safety check - never update the updater itself
    if (isExcluded(file.path)) {
      if (options.verbose) {
        console.log(`${progress} SKIP (protected): ${file.path}`);
      }
      result.filesSkipped++;
      continue;
    }

    if (options.verbose) {
      console.log(`${progress} Fetching: ${file.path}`);
    }

    const fetchResult = await fetchFromGitHub(file.path);

    if (!fetchResult.success) {
      if (file.required) {
        console.error(`${progress} FAIL: ${file.path}`);
        console.error(`         Error: ${fetchResult.error}`);
        result.filesFailed++;
        result.errors.push(`${file.path}: ${fetchResult.error}`);
      } else {
        if (options.verbose) {
          console.log(`${progress} SKIP (not found): ${file.path}`);
        }
        result.filesSkipped++;
      }
      continue;
    }

    // Write the file
    const localPath = path.join(repoRoot, file.path);

    if (options.dryRun) {
      console.log(`${progress} Would update: ${file.path}`);
      result.filesUpdated++;
    } else {
      try {
        await fs.mkdir(path.dirname(localPath), { recursive: true });
        await fs.writeFile(localPath, fetchResult.content!, "utf-8");
        console.log(`${progress} Updated: ${file.path}`);
        result.filesUpdated++;
      } catch (error) {
        console.error(`${progress} FAIL (write): ${file.path}`);
        console.error(
          `         Error: ${error instanceof Error ? error.message : String(error)}`
        );
        result.filesFailed++;
        result.errors.push(`${file.path}: Write failed`);
      }
    }
  }

  // Step 3: Run npm install if package.json was updated
  if (!options.dryRun && result.filesFailed === 0) {
    console.log("\nInstalling dependencies...");
    try {
      execSync("npm install", {
        cwd: path.join(repoRoot, "server"),
        stdio: "inherit",
      });
      console.log("Dependencies installed successfully.");
    } catch (error) {
      console.error("Warning: npm install failed. Run it manually.");
      result.errors.push("npm install failed");
    }
  }

  // Step 4: Summary
  console.log("\n========================================");
  console.log("Update Summary");
  console.log("========================================");
  console.log(`Version: v${currentVersion} -> v${remoteVersion}`);
  console.log(`Files updated: ${result.filesUpdated}`);
  console.log(`Files skipped: ${result.filesSkipped}`);
  console.log(`Files failed:  ${result.filesFailed}`);

  if (result.errors.length > 0 && options.verbose) {
    console.log("\nErrors:");
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
  }

  if (result.filesFailed === 0) {
    console.log("\nUpdate completed successfully!");
    console.log("\nNext steps:");
    console.log('  1. Run "npm run deploy" to update the Roblox Studio plugin');
    console.log('  2. Restart the server with "npm run start"');
  } else {
    console.log("\nUpdate completed with errors.");
    console.log("Some files failed to update.");
    process.exit(1);
  }

  console.log("========================================\n");
}

update().catch((error) => {
  console.error("Update failed:", error);
  process.exit(1);
});
