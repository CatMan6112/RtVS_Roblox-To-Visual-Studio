/**
 * Utility for fetching files from GitHub raw URLs
 */

import https from "https";
import { GITHUB_RAW_BASE } from "./file-manifest";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const TIMEOUT_MS = 30000;

export interface FetchResult {
  success: boolean;
  content?: string;
  error?: string;
  statusCode?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchWithTimeout(
  url: string
): Promise<{ content: string; statusCode: number }> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        resolve({ content: data, statusCode: res.statusCode || 0 });
      });
    });

    request.on("error", reject);
    request.setTimeout(TIMEOUT_MS, () => {
      request.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

/**
 * Fetch a file from GitHub with retry logic
 */
export async function fetchFromGitHub(
  relativePath: string
): Promise<FetchResult> {
  const url = GITHUB_RAW_BASE + relativePath;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fetchWithTimeout(url);

      if (result.statusCode === 200) {
        return { success: true, content: result.content };
      } else if (result.statusCode === 404) {
        return {
          success: false,
          error: `File not found: ${relativePath}`,
          statusCode: 404,
        };
      } else {
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS * attempt);
          continue;
        }
        return {
          success: false,
          error: `HTTP ${result.statusCode}`,
          statusCode: result.statusCode,
        };
      }
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        console.log(`  Retry ${attempt}/${MAX_RETRIES} for ${relativePath}...`);
        await delay(RETRY_DELAY_MS * attempt);
        continue;
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { success: false, error: "Max retries exceeded" };
}
