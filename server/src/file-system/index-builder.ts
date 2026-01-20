/**
 * Builds the root index.json file mapping the entire game hierarchy
 */

import { GameData, RobloxInstance } from "../types/roblox";

interface IndexEntry {
  name: string;
  className: string;
  path: string;
  children?: IndexEntry[];
}

interface RootIndex {
  version: string;
  timestamp: string;
  services: IndexEntry[];
  totalObjects: number;
}

/**
 * Build an index entry for an instance and its children
 */
function buildIndexEntry(instance: RobloxInstance, currentPath: string): IndexEntry {
  const entry: IndexEntry = {
    name: instance.Name,
    className: instance.ClassName,
    path: currentPath,
  };

  if (instance.Children && instance.Children.length > 0) {
    entry.children = instance.Children.map((child) => {
      const childPath = `${currentPath}/${child.Name}`;
      return buildIndexEntry(child, childPath);
    });
  }

  return entry;
}

/**
 * Count total objects in the tree
 */
function countObjects(instance: RobloxInstance): number {
  let count = 1; // Count self

  if (instance.Children) {
    for (const child of instance.Children) {
      count += countObjects(child);
    }
  }

  return count;
}

/**
 * Build the complete root index.json structure
 */
export function buildRootIndex(gameData: GameData): RootIndex {
  const services: IndexEntry[] = gameData.Services.map((service) => {
    return buildIndexEntry(service, `/${service.Name}`);
  });

  const totalObjects = gameData.Services.reduce(
    (sum, service) => sum + countObjects(service),
    0
  );

  return {
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    services,
    totalObjects,
  };
}

/**
 * Convert index to JSON string
 */
export function indexToJsonString(index: RootIndex): string {
  return JSON.stringify(index, null, 2);
}
