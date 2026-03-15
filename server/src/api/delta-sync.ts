import { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import {
  loadManifest,
  saveManifest,
  computeDelta,
  updateManifestEntries,
} from "../file-system/manifest";
import { getChangeTracker, getWatcher } from "./changes";
import { pathConfig } from "../config/path-config";
import { simpleHash } from "../change-tracker";
import { logger } from "../utils/logger";
import { RobloxInstance } from "../types/roblox";

const VERSION = "0.1.5";

export async function handleGetManifest(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const basePath = await pathConfig.getStoragePath();
    const manifest = await loadManifest(basePath);

    if (!manifest) {
      res.json({ exists: false });
      return;
    }

    // Check version compatibility
    if (manifest.rtvsVersion !== VERSION) {
      res.json({
        exists: false,
        reason: "version_mismatch",
        manifestVersion: manifest.rtvsVersion,
        serverVersion: VERSION,
      });
      return;
    }

    res.json({ exists: true, manifest });
  } catch (error: any) {
    logger.error("Error loading manifest:", error);
    res.status(500).json({ exists: false, error: error.message });
  }
}

export async function handleDeltaPlan(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { hashes, pluginVersion } = req.body as {
      hashes: Record<string, { hash: string; fingerprint?: string }>;
      pluginVersion: string;
    };

    if (!hashes || typeof hashes !== "object") {
      res.status(400).json({
        success: false,
        error: "Missing 'hashes' in request body",
      });
      return;
    }

    const basePath = await pathConfig.getStoragePath();
    const manifest = await loadManifest(basePath);

    if (!manifest) {
      res.json({
        success: false,
        fallbackToFullSync: true,
        reason: "no_manifest",
      });
      return;
    }

    // Version check
    if (pluginVersion && pluginVersion !== manifest.rtvsVersion) {
      res.json({
        success: false,
        fallbackToFullSync: true,
        reason: "version_mismatch",
      });
      return;
    }

    const delta = computeDelta(manifest, hashes);

    logger.info(
      `Delta plan: ${delta.changed.length} changed, ` +
      `${delta.added.length} added, ` +
      `${delta.deleted.length} deleted, ` +
      `${delta.unchanged.length} unchanged` +
      (delta.suggestFullSync ? " (suggesting full sync)" : "")
    );

    res.json({ success: true, delta });
  } catch (error: any) {
    logger.error("Error computing delta plan:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function handleDeltaApply(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { instances, deleted } = req.body as {
      instances: Array<{ path: string; data: RobloxInstance }>;
      deleted: string[];
    };

    const basePath = await pathConfig.getStoragePath();
    const changeTracker = getChangeTracker();

    changeTracker.beginBulkWrite();
    const watcher = getWatcher();
    if (watcher) {
      watcher.clearQueue();
    }

    const writtenPaths: string[] = [];
    const deletedPaths: string[] = [];

    try {
      if (deleted && deleted.length > 0) {
        for (const relativePath of deleted) {
          const fullPath = path.join(basePath, relativePath);
          try {
            await fs.unlink(fullPath);
            logger.info(`Delta delete: ${relativePath}`);
            deletedPaths.push(relativePath);

            let dirToRemove = path.dirname(fullPath);
            while (dirToRemove !== basePath && dirToRemove.startsWith(basePath)) {
              try {
                await fs.rmdir(dirToRemove);
                dirToRemove = path.dirname(dirToRemove);
              } catch {
                break;
              }
            }
          } catch (error: any) {
            if (error.code !== "ENOENT") {
              logger.warn(`Failed to delete: ${relativePath}: ${error.message}`);
            }
          }
        }
      }

      if (instances && instances.length > 0) {
        for (const { path: relativePath, data } of instances) {
          try {
            const fullPath = path.join(basePath, relativePath);
            const parentDir = path.dirname(fullPath);
            await fs.mkdir(parentDir, { recursive: true });

            if (relativePath.endsWith(".lua")) {
              const source = data.Properties?.Source || "";
              await fs.writeFile(fullPath, source, "utf-8");
              logger.info(`Delta write script: ${relativePath}`);
            } else if (relativePath.endsWith(".json")) {
              const { serializeProperties, toJsonString } = await import(
                "../serializers/property-writer"
              );
              const props = serializeProperties(data);
              await fs.writeFile(fullPath, toJsonString(props), "utf-8");
              logger.info(`Delta write properties: ${relativePath}`);
            }

            writtenPaths.push(relativePath);

            const content = await fs.readFile(fullPath, "utf-8");
            changeTracker.markStudioOrigin(relativePath, simpleHash(content));
          } catch (error: any) {
            logger.warn(`Failed to write delta: ${relativePath}: ${error.message}`);
          }
        }
      }

      const manifest = await loadManifest(basePath);
      if (manifest) {
        const updatedManifest = await updateManifestEntries(
          manifest,
          basePath,
          writtenPaths,
          deletedPaths
        );
        await saveManifest(basePath, updatedManifest);
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      changeTracker.endBulkWrite();
    }

    res.json({
      success: true,
      filesWritten: writtenPaths.length,
      filesDeleted: deletedPaths.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("Error applying delta sync:", error);

    try {
      getChangeTracker().endBulkWrite();
    } catch { }

    res.status(500).json({ success: false, error: error.message });
  }
}
