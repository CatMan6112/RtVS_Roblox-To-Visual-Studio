/**
 * Message cache utility - Stores the last used exit message to avoid repetition
 */

import fs from "fs/promises";
import path from "path";
import os from "os";

interface MessageCache {
  lastMessage: string;
}

// Cache file path in AppData
const CACHE_DIR = path.join(os.homedir(), "AppData", "Local", "RtVS");
const CACHE_FILE = path.join(CACHE_DIR, "last-message.json");

/**
 * Ensure the cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    // Silently fail if we can't create the directory
  }
}

/**
 * Read the last used message from cache
 * Returns null if cache doesn't exist or can't be read
 */
export async function getLastMessage(): Promise<string | null> {
  try {
    const data = await fs.readFile(CACHE_FILE, "utf-8");
    const cache: MessageCache = JSON.parse(data);
    return cache.lastMessage || null;
  } catch (error) {
    // Cache doesn't exist or is invalid
    return null;
  }
}

/**
 * Save the current message to cache
 */
export async function saveLastMessage(message: string): Promise<void> {
  try {
    await ensureCacheDir();
    const cache: MessageCache = { lastMessage: message };
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch (error) {
    // Silently fail if we can't write the cache
  }
}
