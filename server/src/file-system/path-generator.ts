/**
 * Utilities for generating file system paths from Roblox instances
 */

import path from "path";
import { RobloxInstance } from "../types/roblox";

/**
 * Sanitize a file/folder name to be file system safe
 * Removes or replaces invalid characters
 */
export function sanitizeName(name: string): string {
  // Replace invalid file system characters
  let sanitized = name
    .replace(/[<>:"/\\|?*]/g, "_") // Replace invalid chars with underscore
    .replace(/\x00/g, "") // Remove null bytes
    .trim();

  // Handle reserved Windows names
  const reserved = [
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
  ];

  if (reserved.includes(sanitized.toUpperCase())) {
    sanitized = `_${sanitized}`;
  }

  // Ensure not empty
  if (sanitized.length === 0) {
    sanitized = "Unnamed";
  }

  return sanitized;
}

/**
 * Generate a unique file name if duplicates exist
 * E.g., "Part" -> "Part_2" -> "Part_3"
 */
export function makeUniqueName(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let counter = 2;
  let uniqueName = `${baseName}_${counter}`;

  while (existingNames.has(uniqueName)) {
    counter++;
    uniqueName = `${baseName}_${counter}`;
  }

  return uniqueName;
}

/**
 * Get the relative path for an instance within the synced-game directory
 * Returns an array of path segments
 */
export function getInstancePath(instance: RobloxInstance, parentPath: string[] = []): string[] {
  const sanitized = sanitizeName(instance.Name);
  return [...parentPath, sanitized];
}

/**
 * Convert a path array to an absolute file system path
 */
export function pathArrayToAbsolute(basePath: string, pathArray: string[]): string {
  return path.join(basePath, ...pathArray);
}

/**
 * Get the directory path for an instance
 * Scripts with no children are files, everything else is a directory
 */
export function getInstanceDirectory(
  _instance: RobloxInstance,
  basePath: string,
  currentPath: string[]
): string {
  return pathArrayToAbsolute(basePath, currentPath);
}
