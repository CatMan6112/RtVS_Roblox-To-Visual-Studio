/**
 * Path configuration module - prompts user for storage path and manages it
 */

import readlineSync from "readline-sync";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { logger } from "../utils/logger";

const DEFAULT_IGNORE_PATHS = ["ServerStorage/MoonAnimator2Saves", ".rtvs"];

export class PathConfig {
  private storagePath: string = "";
  private ignorePaths: string[] = DEFAULT_IGNORE_PATHS;
  private commitMode: boolean = false;
  private configFilePath: string;

  constructor() {
    // Determine config file location based on OS
    const configDir = this.getConfigDirectory();
    this.configFilePath = path.join(configDir, "rtvs-config.json");
  }

  /**
   * Get the appropriate config directory for the current OS
   */
  private getConfigDirectory(): string {
    const platform = os.platform();

    if (platform === "win32") {
      // Windows: Use %APPDATA%\RtVS
      return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "RtVS");
    } else if (platform === "darwin") {
      // macOS: Use ~/Library/Application Support/RtVS
      return path.join(os.homedir(), "Library", "Application Support", "RtVS");
    } else {
      // Linux: Use ~/.config/rtvs
      return path.join(os.homedir(), ".config", "rtvs");
    }
  }

  /**
   * Load the last used path from config file
   */
  private async loadConfig(): Promise<{ lastUsedPath: string | null; ignorePaths: string[]; commitMode: boolean }> {
    try {
      const configData = await fs.readFile(this.configFilePath, "utf-8");
      const config = JSON.parse(configData);
      return {
        lastUsedPath: config.lastUsedPath || null,
        ignorePaths: Array.isArray(config.ignorePaths) ? config.ignorePaths : DEFAULT_IGNORE_PATHS,
        commitMode: config.commitMode === true,
      };
    } catch {
      // Config file doesn't exist or is invalid - that's okay
      return { lastUsedPath: null, ignorePaths: DEFAULT_IGNORE_PATHS, commitMode: false };
    }
  }

  private async saveConfig(lastUsedPath: string, ignorePaths: string[]): Promise<void> {
    try {
      const configDir = path.dirname(this.configFilePath);
      await fs.mkdir(configDir, { recursive: true });
      const config = { lastUsedPath, ignorePaths };
      await fs.writeFile(this.configFilePath, JSON.stringify(config, null, 2), "utf-8");
    } catch (error) {
      logger.warn(`Could not save config: ${String(error)}`);
    }
  }

  /**
   * Prompt the user for the storage path
   */
  async promptForPath(): Promise<string> {
    console.log("\nConfigure Storage Path");
    console.log("─".repeat(50));
    console.log("Where would you like to store synced game files?");

    // Try to load the last used path
    const { lastUsedPath, ignorePaths, commitMode } = await this.loadConfig();
    this.ignorePaths = ignorePaths;
    this.commitMode = commitMode;
    const defaultPath = lastUsedPath || path.join(process.cwd(), "..", "synced-game");

    if (lastUsedPath) {
      console.log(`(Press Enter for last used: ${lastUsedPath})`);
    } else {
      console.log(`(Press Enter for default: ${defaultPath})`);
    }
    console.log("");

    const userInput = readlineSync.question("Storage path: ", {
      defaultInput: defaultPath,
    });

    // Normalize and resolve the path
    let resolvedPath = path.resolve(userInput.trim());

    // If the path is relative, resolve it from the current working directory
    if (!path.isAbsolute(userInput)) {
      resolvedPath = path.resolve(process.cwd(), userInput);
    }

    this.storagePath = resolvedPath;

    // Save config
    await this.saveConfig(this.storagePath, this.ignorePaths);

    console.log(`Storage path set to: ${this.storagePath}\n`);
    console.log("─".repeat(50));

    return this.storagePath;
  }

  /**
   * Get the configured storage path (prompts if not set)
   */
  async getStoragePath(): Promise<string> {
    if (!this.storagePath) {
      return await this.promptForPath();
    }
    return this.storagePath;
  }

  /**
   * Set the storage path directly (used in tests to bypass interactive prompt)
   */
  setStoragePath(newPath: string): void {
    this.storagePath = newPath;
  }

  getIgnorePaths(): string[] {
    return this.ignorePaths;
  }

  getCommitMode(): boolean {
    return this.commitMode;
  }

  getRtvsDir(): string {
    return path.join(this.storagePath, ".rtvs");
  }

  /**
   * Ensure the storage directory exists
   */
  async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.access(this.storagePath);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        logger.info(`Creating storage directory: ${this.storagePath}`);
        await fs.mkdir(this.storagePath, { recursive: true });
        logger.info("Directory created successfully");
      } else {
        throw error;
      }
    }
  }
}

// Singleton instance
export const pathConfig = new PathConfig();
