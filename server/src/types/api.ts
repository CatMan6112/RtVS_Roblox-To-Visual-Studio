/**
 * API request and response type definitions
 */

// Sync endpoint response
export interface SyncResponse {
  success: boolean;
  filesWritten?: number;
  error?: string;
  timestamp?: string;
}

// Status endpoint response
export interface StatusResponse {
  connected: boolean;
  lastSync: string | null;
  filesCount: number;
  version: string;
}

// Ping endpoint response
export interface PingResponse {
  status: "ok";
  version: string;
}

// File change notification (for Phase 3)
export interface FileChange {
  type: "create" | "update" | "delete";
  path: string;
  timestamp: string;
}

// File change with content (for sending to plugin)
export interface FileChangeWithContent extends FileChange {
  content?: string; // File content for creates/updates
}

export interface ChangesResponse {
  changes: FileChangeWithContent[];
  error?: string;
}
