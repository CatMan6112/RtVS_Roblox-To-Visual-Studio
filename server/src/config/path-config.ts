/**
 * Path configuration module - prompts user for storage path and manages it
 */

import readlineSync from "readline-sync";
import path from "path";
import fs from "fs/promises";
import os from "os";

export class PathConfig {
  private storagePath: string = "";
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
  private async loadLastUsedPath(): Promise<string | null> {
    try {
      const configData = await fs.readFile(this.configFilePath, "utf-8");
      const config = JSON.parse(configData);
      return config.lastUsedPath || null;
    } catch (error) {
      // Config file doesn't exist or is invalid - that's okay
      return null;
    }
  }

  /**
   * Save the current path as the last used path
   */
  private async saveLastUsedPath(pathToSave: string): Promise<void> {
    try {
      // Ensure config directory exists
      const configDir = path.dirname(this.configFilePath);
      await fs.mkdir(configDir, { recursive: true });

      // Write config file
      const config = { lastUsedPath: pathToSave };
      await fs.writeFile(this.configFilePath, JSON.stringify(config, null, 2), "utf-8");
    } catch (error) {
      console.warn("Could not save last used path:", error);
      // Non-critical error, continue anyway
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
    const lastUsedPath = await this.loadLastUsedPath();
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

    // Save this path as the last used path
    await this.saveLastUsedPath(this.storagePath);

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
   * Ensure the storage directory exists
   */
  async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.access(this.storagePath);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.log(`Creating storage directory: ${this.storagePath}`);
        await fs.mkdir(this.storagePath, { recursive: true });
        console.log("Directory created successfully\n");
      } else {
        throw error;
      }
    }
  }
}

// Singleton instance
export const pathConfig = new PathConfig();
