/**
 * Version checking utility
 * Fetches latest version from GitHub and compares with current server version
 */

import https from "https";

const GITHUB_VERSION_URL =
  "https://raw.githubusercontent.com/CatMan6112/RtVS_Roblox-To-Visual-Studio/main/version.json";
const VERSION_CHECK_INTERVAL_MS = 3600000; // Check every hour

export interface VersionInfo {
  version: string;
  releaseDate: string;
  changelog: Record<string, string[]>;
}

let latestVersion: string | null = null;
let lastCheckTime: number = 0;

/**
 * Fetch version info from GitHub
 */
async function fetchLatestVersion(): Promise<VersionInfo | null> {
  return new Promise((resolve) => {
    https
      .get(GITHUB_VERSION_URL, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const versionInfo = JSON.parse(data) as VersionInfo;
            latestVersion = versionInfo.version;
            lastCheckTime = Date.now();
            resolve(versionInfo);
          } catch (error) {
            console.error("Failed to parse version.json:", error);
            resolve(null);
          }
        });
      })
      .on("error", (error) => {
        console.error("Failed to fetch version from GitHub:", error.message);
        resolve(null);
      });
  });
}

/**
 * Compare two semantic versions
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
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

/**
 * Check if server version is outdated
 */
export async function checkForUpdates(currentVersion: string): Promise<void> {
  const versionInfo = await fetchLatestVersion();

  if (!versionInfo) {
    console.log("Unable to check for updates (network error or invalid response)");
    return;
  }

  const comparison = compareVersions(versionInfo.version, currentVersion);

  if (comparison > 0) {
    console.log("\n========================================");
    console.log("SERVER UPDATE AVAILABLE");
    console.log("========================================");
    console.log(`Current Version: ${currentVersion}`);
    console.log(`Latest Version:  ${versionInfo.version}`);
    console.log(`Release Date:    ${versionInfo.releaseDate}`);
    console.log("\nChangelog:");
    const latestChangelog = versionInfo.changelog[versionInfo.version];
    if (latestChangelog) {
      latestChangelog.forEach((change) => {
        console.log(`  - ${change}`);
      });
    }
    console.log("\nUpdate at: https://github.com/CatMan6112/RtVS_Roblox-To-Visual-Studio");
    console.log("========================================\n");
  } else if (comparison === 0) {
    console.log(`Server is up to date (v${currentVersion})`);
  } else {
    console.log(`Server version (v${currentVersion}) is ahead of latest release (v${versionInfo.version})`);
  }
}

/**
 * Start periodic version checking
 */
export function startVersionChecker(currentVersion: string): void {
  // Check immediately on startup
  checkForUpdates(currentVersion).catch((error) => {
    console.error("Version check failed:", error);
  });

  // Check periodically
  setInterval(() => {
    checkForUpdates(currentVersion).catch((error) => {
      console.error("Version check failed:", error);
    });
  }, VERSION_CHECK_INTERVAL_MS);
}

/**
 * Get the latest known version (cached)
 */
export function getLatestVersion(): string | null {
  return latestVersion;
}

/**
 * Check if a new version check is needed
 */
export function shouldCheckVersion(): boolean {
  const timeSinceLastCheck = Date.now() - lastCheckTime;
  return timeSinceLastCheck >= VERSION_CHECK_INTERVAL_MS;
}
