import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { simpleHash } from "../change-tracker";
import { SERVICE_NAMES_SET } from "../types/roblox";
import { logger } from "../utils/logger";

export interface ManifestEntry {
  hash: string;
  type: "script" | "properties";
  /** Structural fingerprint for properties files: "ClassName|Name|childCount" */
  fingerprint?: string;
}

export interface SyncManifest {
  version: "1.0.0";
  syncTime: string;
  rtvsVersion: string;
  totalObjects: number;
  files: Record<string, ManifestEntry>;
}

export interface DeltaPlan {
  changed: string[];
  added: string[];
  deleted: string[];
  unchanged: string[];
  suggestFullSync: boolean;
}

const MANIFEST_FILENAME = "sync-manifest.json";

function getManifestPath(basePath: string): string {
  return path.join(basePath, ".rtvs", MANIFEST_FILENAME);
}

export async function generateManifest(
  basePath: string,
  rtvsVersion: string
): Promise<SyncManifest> {
  const files: Record<string, ManifestEntry> = {};
  let totalObjects = 0;

  // Walk each service directory
  const entries = await fs.readdir(basePath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!SERVICE_NAMES_SET.has(entry.name)) continue;

    await walkDirectory(basePath, entry.name, files);
  }

  totalObjects = Object.keys(files).length;

  const manifest: SyncManifest = {
    version: "1.0.0",
    syncTime: new Date().toISOString(),
    rtvsVersion,
    totalObjects,
    files,
  };

  return manifest;
}

async function walkDirectory(
  basePath: string,
  relativePath: string,
  files: Record<string, ManifestEntry>
): Promise<void> {
  const fullPath = path.join(basePath, relativePath);

  let entries;
  try {
    entries = await fs.readdir(fullPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryRelativePath = relativePath + "/" + entry.name;

    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      await walkDirectory(basePath, entryRelativePath, files);
    } else if (entry.isFile()) {
      const entryFullPath = path.join(basePath, entryRelativePath);

      try {
        const content = await fs.readFile(entryFullPath, "utf-8");
        const hash = simpleHash(content);

        if (entry.name.endsWith(".lua")) {
          files[entryRelativePath] = { hash, type: "script" };
        } else if (entry.name.endsWith(".json")) {
          const fingerprint = extractFingerprint(entryFullPath, content, basePath, entryRelativePath);
          files[entryRelativePath] = { hash, type: "properties", fingerprint };
        }
      } catch {
      }
    }
  }
}

function extractFingerprint(
  _fullPath: string,
  content: string,
  basePath: string,
  relativePath: string
): string | undefined {
  try {
    const parsed = JSON.parse(content);
    const className = parsed.ClassName || "Unknown";
    const name = parsed._fsName || path.basename(path.dirname(
      path.join(basePath, relativePath)
    ));

    const parentDir = path.dirname(path.join(basePath, relativePath));
    let childCount = 0;
    try {
      const siblings = fsSync.readdirSync(parentDir, { withFileTypes: true });
      for (const s of siblings) {
        if (s.isDirectory()) {
          childCount++;
        } else if (s.isFile()) {
          if (s.name.endsWith(".lua") && s.name !== "__main__.lua") {
            childCount++;
          }
        }
      }
    } catch {
    }

    return `${className}|${name}|${childCount}`;
  } catch {
    return undefined;
  }
}

export async function loadManifest(basePath: string): Promise<SyncManifest | null> {
  const manifestPath = getManifestPath(basePath);

  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    return JSON.parse(content) as SyncManifest;
  } catch {
    return null;
  }
}

export async function saveManifest(
  basePath: string,
  manifest: SyncManifest
): Promise<void> {
  const rtvsDir = path.join(basePath, ".rtvs");
  await fs.mkdir(rtvsDir, { recursive: true });

  const manifestPath = getManifestPath(basePath);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  logger.info(`Saved sync manifest: ${Object.keys(manifest.files).length} entries`);
}

export function computeDelta(
  manifest: SyncManifest,
  pluginHashes: Record<string, { hash: string; fingerprint?: string }>
): DeltaPlan {
  const changed: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  const unchanged: string[] = [];

  const manifestPaths = new Set(Object.keys(manifest.files));
  const pluginPaths = new Set(Object.keys(pluginHashes));

  for (const pluginPath of pluginPaths) {
    if (!manifestPaths.has(pluginPath)) {
      added.push(pluginPath);
    } else {
      const manifestEntry = manifest.files[pluginPath];
      const pluginEntry = pluginHashes[pluginPath];

      if (manifestEntry.type === "script") {
        if (manifestEntry.hash !== pluginEntry.hash) {
          changed.push(pluginPath);
        } else {
          unchanged.push(pluginPath);
        }
      } else {
        if (manifestEntry.fingerprint && pluginEntry.fingerprint) {
          if (manifestEntry.fingerprint !== pluginEntry.fingerprint) {
            changed.push(pluginPath);
          } else {
            unchanged.push(pluginPath);
          }
        } else {
          unchanged.push(pluginPath);
        }
      }
    }
  }

  for (const manifestPath of manifestPaths) {
    if (!pluginPaths.has(manifestPath)) {
      deleted.push(manifestPath);
    }
  }

  const totalPaths = manifestPaths.size + added.length;
  const changedCount = changed.length + added.length + deleted.length;
  const suggestFullSync = totalPaths > 0 && changedCount / totalPaths > 0.5;

  return { changed, added, deleted, unchanged, suggestFullSync };
}

export async function updateManifestEntries(
  manifest: SyncManifest,
  basePath: string,
  changedPaths: string[],
  deletedPaths: string[]
): Promise<SyncManifest> {
  for (const deletedPath of deletedPaths) {
    delete manifest.files[deletedPath];
  }

  for (const changedPath of changedPaths) {
    const fullPath = path.join(basePath, changedPath);

    try {
      const content = await fs.readFile(fullPath, "utf-8");
      const hash = simpleHash(content);

      if (changedPath.endsWith(".lua")) {
        manifest.files[changedPath] = { hash, type: "script" };
      } else if (changedPath.endsWith(".json")) {
        const fingerprint = extractFingerprint(fullPath, content, basePath, changedPath);
        manifest.files[changedPath] = { hash, type: "properties", fingerprint };
      }
    } catch {
      delete manifest.files[changedPath];
    }
  }

  manifest.syncTime = new Date().toISOString();
  manifest.totalObjects = Object.keys(manifest.files).length;

  return manifest;
}
