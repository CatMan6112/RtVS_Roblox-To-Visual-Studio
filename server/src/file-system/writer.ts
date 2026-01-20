/**
 * Main file system writer - converts Roblox game data to files
 */

import fs from "fs/promises";
import path from "path";
import { GameData, RobloxInstance, isScriptInstance, hasChildren } from "../types/roblox";
import { sanitizeName, pathArrayToAbsolute } from "./path-generator";
import { serializeProperties, toJsonString } from "../serializers/property-writer";
import { buildRootIndex, indexToJsonString } from "./index-builder";

export class FileSystemWriter {
  private basePath: string;
  private filesWritten: number = 0;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Write the entire game data to the file system
   */
  async writeGameData(gameData: GameData): Promise<number> {
    this.filesWritten = 0;

    // Clear/create output directory
    await this.prepareOutputDirectory();

    // Write each service
    for (const service of gameData.Services) {
      await this.writeInstance(service, []);
    }

    // Write root index.json
    await this.writeRootIndex(gameData);

    return this.filesWritten;
  }

  /**
   * Prepare the output directory (create or clear it)
   */
  private async prepareOutputDirectory(): Promise<void> {
    try {
      // Check if directory exists
      await fs.access(this.basePath);

      // Directory exists, clear it
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(this.basePath, entry.name);

        if (entry.isDirectory()) {
          await fs.rm(fullPath, { recursive: true, force: true });
        } else {
          await fs.unlink(fullPath);
        }
      }
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // Directory doesn't exist, create it
        await fs.mkdir(this.basePath, { recursive: true });
      } else {
        throw error;
      }
    }
  }

  /**
   * Write an instance and its children to the file system
   */
  private async writeInstance(instance: RobloxInstance, parentPath: string[]): Promise<void> {
    const sanitized = sanitizeName(instance.Name);
    const currentPath = [...parentPath, sanitized];
    const isScript = isScriptInstance(instance);
    const hasKids = hasChildren(instance);

    if (isScript && !hasKids) {
      // Script with no children -> write as .lua file
      await this.writeScriptFile(instance, currentPath);
    } else if (isScript && hasKids) {
      // Script with children -> create folder with __main__.lua and __main__.json
      await this.writeScriptFolder(instance, currentPath);
    } else {
      // Non-script object -> create folder with __main__.json
      await this.writeObjectFolder(instance, currentPath);
    }

    // Recursively write children (if any)
    if (hasKids) {
      for (const child of instance.Children!) {
        await this.writeInstance(child, currentPath);
      }
    }
  }

  /**
   * Write a script as a standalone .lua file
   */
  private async writeScriptFile(instance: RobloxInstance, currentPath: string[]): Promise<void> {
    const dirPath = pathArrayToAbsolute(this.basePath, currentPath.slice(0, -1));
    const fileName = `${currentPath[currentPath.length - 1]}.lua`;
    const filePath = path.join(dirPath, fileName);

    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });

    // Get script source
    const source = instance.Properties?.Source || "";

    // Write .lua file
    await fs.writeFile(filePath, source, "utf-8");
    this.filesWritten++;
  }

  /**
   * Write a script with children as a folder with __main__.lua and __main__.json
   */
  private async writeScriptFolder(instance: RobloxInstance, currentPath: string[]): Promise<void> {
    const dirPath = pathArrayToAbsolute(this.basePath, currentPath);

    // Create directory
    await fs.mkdir(dirPath, { recursive: true });

    // Write __main__.lua with script source
    const source = instance.Properties?.Source || "";
    const luaPath = path.join(dirPath, "__main__.lua");
    await fs.writeFile(luaPath, source, "utf-8");
    this.filesWritten++;

    // Write __main__.json with properties
    const properties = serializeProperties(instance);
    const jsonPath = path.join(dirPath, "__main__.json");
    await fs.writeFile(jsonPath, toJsonString(properties), "utf-8");
    this.filesWritten++;
  }

  /**
   * Write a non-script object as a folder with __main__.json
   */
  private async writeObjectFolder(instance: RobloxInstance, currentPath: string[]): Promise<void> {
    const dirPath = pathArrayToAbsolute(this.basePath, currentPath);

    // Create directory
    await fs.mkdir(dirPath, { recursive: true });

    // Write __main__.json with properties
    const properties = serializeProperties(instance);
    const jsonPath = path.join(dirPath, "__main__.json");
    await fs.writeFile(jsonPath, toJsonString(properties), "utf-8");
    this.filesWritten++;
  }

  /**
   * Write the root index.json file
   */
  private async writeRootIndex(gameData: GameData): Promise<void> {
    const index = buildRootIndex(gameData);
    const indexPath = path.join(this.basePath, "index.json");
    await fs.writeFile(indexPath, indexToJsonString(index), "utf-8");
    this.filesWritten++;
  }

  /**
   * Get the number of files written
   */
  getFilesWritten(): number {
    return this.filesWritten;
  }
}
