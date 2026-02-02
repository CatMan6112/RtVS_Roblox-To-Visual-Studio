/**
 * Session management for chunked sync operations
 * Handles storing and assembling chunks from the plugin
 */

import { RobloxInstance, GameData, SERVICE_NAMES } from "./types/roblox";
import { randomUUID } from "crypto";

// Deep chunk with path information
interface DeepChunk {
  parentPath: string;
  instanceData: RobloxInstance;
}

export interface SyncSession {
  id: string;
  startedAt: Date;
  expectedServices: number;
  services: Map<string, RobloxInstance>;
  workspaceChunks: RobloxInstance[][]; // Legacy: flat workspace chunks
  totalWorkspaceChunks: number;
  receivedWorkspaceChunks: number;
  deepChunks: DeepChunk[]; // New: path-based deep chunks
}

// Write progress tracking
export interface WriteProgressInfo {
  phase: "pending" | "preparing" | "writing" | "complete" | "error";
  filesWritten: number;
  totalFiles: number;
  currentService?: string;
  error?: string;
}

// Active sessions storage
const sessions = new Map<string, SyncSession>();

// Write progress storage (separate from sessions for status polling)
const writeProgress = new Map<string, WriteProgressInfo>();

// Session timeout (10 minutes for large games)
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Create a new sync session
 */
export function createSession(expectedServices: number): SyncSession {
  const session: SyncSession = {
    id: randomUUID(),
    startedAt: new Date(),
    expectedServices,
    services: new Map(),
    workspaceChunks: [],
    totalWorkspaceChunks: 0,
    receivedWorkspaceChunks: 0,
    deepChunks: [],
  };

  sessions.set(session.id, session);

  // Schedule cleanup after timeout
  setTimeout(() => {
    if (sessions.has(session.id)) {
      console.log(`Session ${session.id} expired and was cleaned up`);
      sessions.delete(session.id);
    }
  }, SESSION_TIMEOUT_MS);

  return session;
}

/**
 * Get an existing session
 */
export function getSession(sessionId: string): SyncSession | undefined {
  return sessions.get(sessionId);
}

/**
 * Add a service to the session
 */
export function addServiceToSession(
  sessionId: string,
  serviceName: string,
  serviceData: RobloxInstance
): boolean {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  session.services.set(serviceName, serviceData);
  return true;
}

/**
 * Add a Workspace chunk to the session (legacy flat chunking)
 */
export function addWorkspaceChunk(
  sessionId: string,
  chunkIndex: number,
  totalChunks: number,
  children: RobloxInstance[]
): boolean {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  // Initialize total chunks on first chunk
  if (session.totalWorkspaceChunks === 0) {
    session.totalWorkspaceChunks = totalChunks;
    session.workspaceChunks = new Array(totalChunks).fill(null);
  }

  // Store chunk at correct index
  session.workspaceChunks[chunkIndex] = children;
  session.receivedWorkspaceChunks++;

  return true;
}

/**
 * Add a deep chunk with path information
 */
export function addDeepChunk(
  sessionId: string,
  parentPath: string,
  instanceData: RobloxInstance
): boolean {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  session.deepChunks.push({ parentPath, instanceData });
  return true;
}

/**
 * Check if session is complete (all services and workspace chunks received)
 */
export function isSessionComplete(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  // Check if we have all non-Workspace services
  // Workspace may be sent as chunks instead of a single service
  const hasWorkspace = session.services.has("Workspace");
  const hasAllWorkspaceChunks =
    session.totalWorkspaceChunks > 0 &&
    session.receivedWorkspaceChunks === session.totalWorkspaceChunks;

  // Either Workspace was sent as a single service, or all chunks were received
  const workspaceComplete = hasWorkspace || hasAllWorkspaceChunks;

  return workspaceComplete;
}

/**
 * Find or create an instance at the given path within a tree
 */
function findOrCreateAtPath(
  root: RobloxInstance,
  pathParts: string[]
): RobloxInstance | null {
  let current = root;

  for (const part of pathParts) {
    if (!current.Children) {
      current.Children = [];
    }

    let child = current.Children.find((c) => c.Name === part);
    if (!child) {
      // Create placeholder - will be replaced by actual data
      child = {
        ClassName: "Folder", // Placeholder class
        Name: part,
        Properties: {},
        Children: [],
      };
      current.Children.push(child);
    }
    current = child;
  }

  return current;
}

/**
 * Insert an instance at the given path, merging with existing if present
 */
function insertAtPath(
  services: Map<string, RobloxInstance>,
  parentPath: string,
  instanceData: RobloxInstance
): void {
  const pathParts = parentPath.split("/").filter((p) => p.length > 0);

  if (pathParts.length === 0) {
    // This shouldn't happen, but handle it
    return;
  }

  // First part is the service name
  const serviceName = pathParts[0];
  const service = services.get(serviceName);

  if (!service) {
    // Service doesn't exist yet - shouldn't happen if services are sent first
    console.warn(`Service ${serviceName} not found for deep chunk`);
    return;
  }

  if (pathParts.length === 1) {
    // Direct child of service
    if (!service.Children) {
      service.Children = [];
    }

    // Don't merge by name - duplicates are valid in Roblox
    // The file system writer will handle unique naming (Part, Part_2, Part_3, etc.)
    service.Children.push(instanceData);
  } else {
    // Nested path - find/create the parent
    const parentParts = pathParts.slice(1); // Skip service name
    const parent = findOrCreateAtPath(service, parentParts);

    if (parent) {
      if (!parent.Children) {
        parent.Children = [];
      }

      // Don't merge by name - duplicates are valid in Roblox
      // The file system writer will handle unique naming (Part, Part_2, Part_3, etc.)
      parent.Children.push(instanceData);
    }
  }
}

/**
 * Assemble the complete GameData from session chunks.
 * NOTE: This modifies the session data in place for memory efficiency.
 * The session should be deleted after calling this function.
 */
export function assembleGameData(sessionId: string): GameData | null {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  // Use services directly (no cloning) - session will be deleted after this
  const assembledServices = session.services;

  // Handle legacy workspace chunks if present
  if (session.workspaceChunks.length > 0) {
    const workspace = assembledServices.get("Workspace");
    if (workspace) {
      const allChunkChildren = session.workspaceChunks.flat().filter(Boolean);
      workspace.Children = [...(workspace.Children || []), ...allChunkChildren];
    }
    // Clear workspace chunks to free memory
    session.workspaceChunks = [];
  }

  // Process deep chunks in order (they should already be in correct order)
  console.log(`Assembling ${session.deepChunks.length} deep chunks...`);

  // Process chunks in batches to allow GC between batches
  const CHUNK_BATCH_SIZE = 500;
  for (let i = 0; i < session.deepChunks.length; i += CHUNK_BATCH_SIZE) {
    const batch = session.deepChunks.slice(i, i + CHUNK_BATCH_SIZE);
    for (const chunk of batch) {
      insertAtPath(assembledServices, chunk.parentPath, chunk.instanceData);
    }
  }

  // Clear deep chunks array to free memory immediately
  session.deepChunks = [];

  // Convert to array maintaining typical service order
  const serviceOrder = SERVICE_NAMES;

  const services: RobloxInstance[] = [];
  for (const name of serviceOrder) {
    const service = assembledServices.get(name);
    if (service) {
      services.push(service);
      assembledServices.delete(name);
    }
  }

  // Add any remaining services not in the standard order
  for (const service of assembledServices.values()) {
    services.push(service);
  }

  return {
    ClassName: "DataModel",
    Name: "Game",
    Services: services,
  };
}

/**
 * Delete a session (cleanup)
 */
export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Get session progress for logging
 */
export function getSessionProgress(sessionId: string): string {
  const session = sessions.get(sessionId);
  if (!session) {
    return "Session not found";
  }

  const serviceCount = session.services.size;
  const deepChunkCount = session.deepChunks.length;
  const workspaceProgress =
    session.totalWorkspaceChunks > 0
      ? ` | Workspace chunks: ${session.receivedWorkspaceChunks}/${session.totalWorkspaceChunks}`
      : "";
  const deepProgress = deepChunkCount > 0 ? ` | Deep chunks: ${deepChunkCount}` : "";

  return `Services: ${serviceCount}${workspaceProgress}${deepProgress}`;
}

/**
 * Initialize write progress for a session
 */
export function initWriteProgress(sessionId: string): void {
  writeProgress.set(sessionId, {
    phase: "pending",
    filesWritten: 0,
    totalFiles: 0,
  });
}

/**
 * Update write progress for a session
 */
export function updateWriteProgress(
  sessionId: string,
  progress: Partial<WriteProgressInfo>
): void {
  const current = writeProgress.get(sessionId) || {
    phase: "pending" as const,
    filesWritten: 0,
    totalFiles: 0,
  };
  writeProgress.set(sessionId, { ...current, ...progress });
}

/**
 * Get write progress for a session
 */
export function getWriteProgress(sessionId: string): WriteProgressInfo | null {
  return writeProgress.get(sessionId) || null;
}

/**
 * Clear write progress for a session
 */
export function clearWriteProgress(sessionId: string): void {
  // Keep progress around for a bit so the client can see the final state
  setTimeout(() => {
    writeProgress.delete(sessionId);
  }, 60000); // Clean up after 1 minute
}
