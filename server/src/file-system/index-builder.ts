/**
 * Builds the root index.json file mapping the entire game hierarchy
 */

import { GameData, RobloxInstance } from "../types/roblox";

// Lightweight metadata node for incremental index building (no Properties/Source)
export interface IndexNode {
  name: string;
  className: string;
  children: Map<string, IndexNode>;
}

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
 * Build a RootIndex from lightweight IndexNode metadata
 * (used by the write-on-arrival chunked sync path)
 */
export function buildRootIndexFromMetadata(
  serviceIndex: Map<string, IndexNode>
): RootIndex {
  let totalObjects = 0;

  const services: IndexEntry[] = [];
  for (const [serviceName, node] of serviceIndex) {
    const entry = indexNodeToEntry(node, `/${serviceName}`);
    totalObjects += countIndexNodes(node);
    services.push(entry);
  }

  return {
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    services,
    totalObjects,
  };
}

function indexNodeToEntry(node: IndexNode, currentPath: string): IndexEntry {
  const entry: IndexEntry = {
    name: node.name,
    className: node.className,
    path: currentPath,
  };

  if (node.children.size > 0) {
    entry.children = [];
    for (const [, child] of node.children) {
      entry.children.push(indexNodeToEntry(child, `${currentPath}/${child.name}`));
    }
  }

  return entry;
}

function countIndexNodes(node: IndexNode): number {
  let count = 1;
  for (const [, child] of node.children) {
    count += countIndexNodes(child);
  }
  return count;
}

/**
 * Extract lightweight IndexNode metadata from a full RobloxInstance tree.
 * Discards Properties and Source — only keeps name, className, and children structure.
 */
export function extractIndexMetadata(instance: RobloxInstance): IndexNode {
  const node: IndexNode = {
    name: instance.Name,
    className: instance.ClassName,
    children: new Map(),
  };

  if (instance.Children) {
    for (const child of instance.Children) {
      // Use name as key; duplicates with same name get overwritten in index
      // (the filesystem handles uniqueness via _2, _3 suffixes)
      node.children.set(child.Name, extractIndexMetadata(child));
    }
  }

  return node;
}

// Flat metadata entry — no nested Maps, just plain object
export interface FlatMetaEntry {
  name: string;
  className: string;
}

/**
 * Extract flat metadata from a RobloxInstance tree.
 * Instead of building a recursive tree of Maps (expensive for large games),
 * returns a flat Map keyed by relative path (e.g. "Child1", "Child1/GrandChild").
 * Memory-efficient: one Map with plain-object values instead of thousands of nested Maps.
 */
export function extractFlatMetadata(
  instance: RobloxInstance,
  prefix: string = ""
): Map<string, FlatMetaEntry> {
  const result = new Map<string, FlatMetaEntry>();
  const key = prefix ? `${prefix}/${instance.Name}` : instance.Name;

  result.set(key, { name: instance.Name, className: instance.ClassName });

  if (instance.Children) {
    for (const child of instance.Children) {
      const childEntries = extractFlatMetadata(child, key);
      for (const [k, v] of childEntries) {
        result.set(k, v);
      }
    }
  }

  return result;
}

/**
 * Reconstruct an IndexNode tree from a flat metadata map.
 * Called once at sync completion to build the index.json.
 */
export function buildIndexFromFlatMetadata(
  flatIndex: Map<string, FlatMetaEntry>
): Map<string, IndexNode> {
  const roots = new Map<string, IndexNode>();

  for (const [fullPath, entry] of flatIndex) {
    const parts = fullPath.split("/");
    const rootName = parts[0];

    // Ensure root node exists
    if (!roots.has(rootName)) {
      const rootEntry = flatIndex.get(rootName);
      roots.set(rootName, {
        name: rootName,
        className: rootEntry?.className ?? rootName,
        children: new Map(),
      });
    }

    if (parts.length === 1) continue; // root node itself, already created

    // Navigate/create path to parent, then insert this node
    let current = roots.get(rootName)!;
    for (let i = 1; i < parts.length - 1; i++) {
      let child = current.children.get(parts[i]);
      if (!child) {
        const intermediatePath = parts.slice(0, i + 1).join("/");
        const intermediateEntry = flatIndex.get(intermediatePath);
        child = {
          name: parts[i],
          className: intermediateEntry?.className ?? "Folder",
          children: new Map(),
        };
        current.children.set(parts[i], child);
      }
      current = child;
    }

    // Insert the leaf node
    const leafName = parts[parts.length - 1];
    let existing = current.children.get(leafName);
    if (existing) {
      // Node already exists (created as intermediate), update className
      existing.className = entry.className;
    } else {
      current.children.set(leafName, {
        name: entry.name,
        className: entry.className,
        children: new Map(),
      });
    }
  }

  return roots;
}

/**
 * Convert index to JSON string
 */
export function indexToJsonString(index: RootIndex): string {
  return JSON.stringify(index, null, 2);
}
