/**
 * Manifest of files to update from GitHub
 * This file is intentionally NOT updated by the update script
 */

export interface FileEntry {
  path: string;
  required: boolean;
}

export const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/CatMan6112/RtVS_Roblox-To-Visual-Studio/refs/heads/main/";

export const FILES_TO_UPDATE: FileEntry[] = [
  // Plugin files
  { path: "plugin/main.lua", required: true },
  { path: "plugin/deserializer.lua", required: true },
  { path: "plugin/studio-watcher.lua", required: true },
  { path: "plugin/README.md", required: false },

  // Server config files
  { path: "server/package.json", required: true },
  { path: "server/tsconfig.json", required: true },

  // Server source files - API
  { path: "server/src/api/changes.ts", required: true },
  { path: "server/src/api/health.ts", required: true },
  { path: "server/src/api/studio-change.ts", required: true },
  { path: "server/src/api/sync.ts", required: true },
  { path: "server/src/api/sync-chunked.ts", required: false },

  // Server source files - Config
  { path: "server/src/config/path-config.ts", required: true },

  // Server source files - File System
  { path: "server/src/file-system/index-builder.ts", required: true },
  { path: "server/src/file-system/path-generator.ts", required: true },
  { path: "server/src/file-system/watcher.ts", required: true },
  { path: "server/src/file-system/writer.ts", required: true },

  // Server source files - Plugin Builder
  { path: "server/src/plugin-builder/deploy.ts", required: true },
  { path: "server/src/plugin-builder/rbxm-builder.ts", required: true },
  { path: "server/src/plugin-builder/rbxm-writer.ts", required: true },
  { path: "server/src/plugin-builder/rbxmx-writer.ts", required: true },

  // Server source files - Serializers
  { path: "server/src/serializers/property-writer.ts", required: true },

  // Server source files - Types
  { path: "server/src/types/api.ts", required: true },
  { path: "server/src/types/roblox.ts", required: true },

  // Server source files - Utils
  { path: "server/src/utils/exit-message.ts", required: true },
  { path: "server/src/utils/message-cache.ts", required: true },
  { path: "server/src/utils/version-checker.ts", required: true },

  // Server source files - Root
  { path: "server/src/server.ts", required: true },
  { path: "server/src/sync-session.ts", required: false },

  // Version file
  { path: "version.json", required: true },
];
