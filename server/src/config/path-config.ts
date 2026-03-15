import readlineSync from "readline-sync";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { logger } from "../utils/logger";

const DEFAULT_IGNORE_PATHS = [
  "ServerStorage/MoonAnimator2Saves",
  ".rtvs",
  "**/AnimSaves/**",
  "**/AnimSave/**",
];

export class PathConfig {
  private storagePath: string = "";
  private ignorePaths: string[] = DEFAULT_IGNORE_PATHS;
  private commitMode: boolean = false;
  private configFilePath: string;

  constructor() {
    const configDir = this.getConfigDirectory();
    this.configFilePath = path.join(configDir, "rtvs-config.json");
  }

  private getConfigDirectory(): string {
    const platform = os.platform();
    if (platform === "win32") {
      return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "RtVS");
    } else if (platform === "darwin") {
      return path.join(os.homedir(), "Library", "Application Support", "RtVS");
    } else {
      return path.join(os.homedir(), ".config", "rtvs");
    }
  }

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

  async promptForPath(): Promise<string> {
    console.log("\nConfigure Storage Path");
    console.log("─".repeat(50));
    console.log("Where would you like to store synced game files?");

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

    let resolvedPath = path.resolve(userInput.trim());
    if (!path.isAbsolute(userInput)) {
      resolvedPath = path.resolve(process.cwd(), userInput);
    }

    this.storagePath = resolvedPath;
    await this.saveConfig(this.storagePath, this.ignorePaths);

    console.log(`Storage path set to: ${this.storagePath}\n`);
    console.log("─".repeat(50));

    return this.storagePath;
  }

  async getStoragePath(): Promise<string> {
    if (!this.storagePath) {
      return await this.promptForPath();
    }
    return this.storagePath;
  }

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

  async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.access(this.storagePath);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        logger.info(`Creating storage directory: ${this.storagePath}`);
        await fs.mkdir(this.storagePath, { recursive: true });
      } else {
        throw error;
      }
    }
  }
}

export const pathConfig = new PathConfig();
