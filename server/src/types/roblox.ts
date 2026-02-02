/**
 * TypeScript type definitions for Roblox data structures
 * Matches the JSON output from the Roblox Studio plugin
 */

// Roblox primitive types
export interface Vector3 {
  X: number;
  Y: number;
  Z: number;
}

export interface Vector2 {
  X: number;
  Y: number;
}

export interface Color3 {
  R: number;
  G: number;
  B: number;
}

export interface CFrame {
  Position: Vector3;
  Components: number[]; // 12 component matrix representation
}

// Instance representation
export interface RobloxInstance {
  ClassName: string;
  Name: string;
  Properties: Record<string, any>;
  Attributes?: Record<string, any>;
  Children?: RobloxInstance[];
}

// Root game data structure
export interface GameData {
  ClassName: "DataModel";
  Name: "Game";
  Services: RobloxInstance[];
}

// Script class names that should be exported as .lua files
export const SCRIPT_CLASSES = [
  "Script",
  "LocalScript",
  "ModuleScript"
] as const;

export type ScriptClassName = typeof SCRIPT_CLASSES[number];

// Roblox services that RtVS syncs. Order is significant: it is the
// canonical write order used when assembling GameData.
export const SERVICE_NAMES = [
  "Workspace",
  "ReplicatedStorage",
  "ReplicatedFirst",
  "ServerScriptService",
  "ServerStorage",
  "StarterGui",
  "StarterPack",
  "StarterPlayer",
  "Lighting",
  "SoundService",
  "Chat",
  "LocalizationService",
  "TestService",
] as const;

export type ServiceName = typeof SERVICE_NAMES[number];

// O(1) lookup set, derived from the array so it can never drift out of sync.
export const SERVICE_NAMES_SET: ReadonlySet<string> = new Set(SERVICE_NAMES);

// Helper type guards
export function isScriptInstance(instance: RobloxInstance): boolean {
  return SCRIPT_CLASSES.includes(instance.ClassName as ScriptClassName);
}

export function hasChildren(instance: RobloxInstance): boolean {
  return instance.Children !== undefined && instance.Children.length > 0;
}
