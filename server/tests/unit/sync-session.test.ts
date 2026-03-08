import {
  createSession,
  getSession,
  deleteSession,
  addServiceMetadata,
  addInstanceTreeMetadata,
  getIndexData,
  getSessionProgress,
  initWriteProgress,
  updateWriteProgress,
  getWriteProgress,
  clearWriteProgress,
} from "../../src/sync-session";
import { FileSystemWriter } from "../../src/file-system/writer";
import { RobloxInstance } from "../../src/types/roblox";

// Minimal stub — session only stores the writer reference, never calls its methods
const mockWriter = {} as FileSystemWriter;

function makeInstance(name: string, className: string, children?: RobloxInstance[]): RobloxInstance {
  return { ClassName: className, Name: name, Properties: {}, Children: children };
}

describe("createSession / getSession / deleteSession", () => {
  it("creates a session and retrieves it by id", () => {
    const session = createSession(mockWriter, false);
    expect(getSession(session.id)).toBe(session);
    deleteSession(session.id);
  });

  it("returns undefined for an unknown session id", () => {
    expect(getSession("no-such-id")).toBeUndefined();
  });

  it("deletes a session so it can no longer be retrieved", () => {
    const session = createSession(mockWriter, false);
    deleteSession(session.id);
    expect(getSession(session.id)).toBeUndefined();
  });

  it("populates initial session fields correctly", () => {
    const session = createSession(mockWriter, true);
    expect(session.writer).toBe(mockWriter);
    expect(session.watcherPaused).toBe(true);
    expect(session.flatIndex.size).toBe(0);
    expect(session.serviceCount).toBe(0);
    expect(session.deepChunkCount).toBe(0);
    deleteSession(session.id);
  });

  it("each session gets a unique id", () => {
    const s1 = createSession(mockWriter, false);
    const s2 = createSession(mockWriter, false);
    expect(s1.id).not.toBe(s2.id);
    deleteSession(s1.id);
    deleteSession(s2.id);
  });
});

describe("addServiceMetadata", () => {
  it("returns false for an unknown session", () => {
    expect(addServiceMetadata("bad-id", "Workspace", makeInstance("Workspace", "Workspace"))).toBe(false);
  });

  it("increments serviceCount", () => {
    const session = createSession(mockWriter, false);
    addServiceMetadata(session.id, "Workspace", makeInstance("Workspace", "Workspace"));
    expect(session.serviceCount).toBe(1);
    deleteSession(session.id);
  });

  it("populates flatIndex with service and its children", () => {
    const session = createSession(mockWriter, false);
    const serviceData = makeInstance("Workspace", "Workspace", [
      makeInstance("Part1", "Part"),
    ]);
    addServiceMetadata(session.id, "Workspace", serviceData);
    expect(session.flatIndex.has("Workspace")).toBe(true);
    expect(session.flatIndex.has("Workspace/Part1")).toBe(true);
    deleteSession(session.id);
  });
});

describe("addInstanceTreeMetadata", () => {
  it("returns false for an unknown session", () => {
    expect(addInstanceTreeMetadata("bad-id", "Workspace", makeInstance("F", "Folder"))).toBe(false);
  });

  it("increments deepChunkCount", () => {
    const session = createSession(mockWriter, false);
    addInstanceTreeMetadata(session.id, "Workspace", makeInstance("MyFolder", "Folder"));
    expect(session.deepChunkCount).toBe(1);
    deleteSession(session.id);
  });

  it("populates flatIndex with the prefixed path", () => {
    const session = createSession(mockWriter, false);
    addInstanceTreeMetadata(session.id, "Workspace", makeInstance("MyFolder", "Folder"));
    expect(session.flatIndex.has("Workspace/MyFolder")).toBe(true);
    deleteSession(session.id);
  });
});

describe("getIndexData", () => {
  it("returns null for an unknown session", () => {
    expect(getIndexData("bad-id")).toBeNull();
  });

  it("returns a reconstructed IndexNode tree", () => {
    const session = createSession(mockWriter, false);
    const serviceData = makeInstance("Workspace", "Workspace", [
      makeInstance("Init", "Script"),
    ]);
    addServiceMetadata(session.id, "Workspace", serviceData);
    const indexData = getIndexData(session.id);
    expect(indexData).not.toBeNull();
    expect(indexData!.has("Workspace")).toBe(true);
    expect(indexData!.get("Workspace")!.children.has("Init")).toBe(true);
    deleteSession(session.id);
  });
});

describe("getSessionProgress", () => {
  it("returns 'Session not found' for unknown id", () => {
    expect(getSessionProgress("nope")).toBe("Session not found");
  });

  it("shows service count of 0 initially", () => {
    const session = createSession(mockWriter, false);
    expect(getSessionProgress(session.id)).toContain("Services: 0");
    deleteSession(session.id);
  });

  it("reflects incremented service count", () => {
    const session = createSession(mockWriter, false);
    addServiceMetadata(session.id, "Workspace", makeInstance("Workspace", "Workspace"));
    expect(getSessionProgress(session.id)).toContain("Services: 1");
    deleteSession(session.id);
  });
});

describe("write progress", () => {
  let sessionId: string;

  beforeEach(() => {
    sessionId = createSession(mockWriter, false).id;
  });

  afterEach(() => {
    deleteSession(sessionId);
  });

  it("initializes to pending state with zeroed counters", () => {
    initWriteProgress(sessionId);
    expect(getWriteProgress(sessionId)).toEqual({ phase: "pending", filesWritten: 0, totalFiles: 0 });
  });

  it("updates progress fields with a partial update", () => {
    initWriteProgress(sessionId);
    updateWriteProgress(sessionId, { phase: "writing", filesWritten: 50, totalFiles: 200 });
    const progress = getWriteProgress(sessionId)!;
    expect(progress.phase).toBe("writing");
    expect(progress.filesWritten).toBe(50);
    expect(progress.totalFiles).toBe(200);
  });

  it("returns null for an unknown sessionId", () => {
    expect(getWriteProgress("no-id")).toBeNull();
  });

  it("clearWriteProgress schedules deletion after 60 seconds", () => {
    jest.useFakeTimers();
    initWriteProgress(sessionId);
    clearWriteProgress(sessionId);
    expect(getWriteProgress(sessionId)).not.toBeNull();
    jest.advanceTimersByTime(61000);
    expect(getWriteProgress(sessionId)).toBeNull();
    jest.useRealTimers();
  });
});

describe("session timeout", () => {
  it("auto-deletes an expired session after 10 minutes", () => {
    jest.useFakeTimers();
    const session = createSession(mockWriter, false);
    expect(getSession(session.id)).toBeDefined();
    jest.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(getSession(session.id)).toBeUndefined();
    jest.useRealTimers();
  });

  it("calls watcher resume callback on timeout when watcher was paused", () => {
    jest.useFakeTimers();
    const onResume = jest.fn();
    createSession(mockWriter, true, onResume);
    jest.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(onResume).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("does not call resume callback when watcher was not paused", () => {
    jest.useFakeTimers();
    const onResume = jest.fn();
    createSession(mockWriter, false, onResume);
    jest.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(onResume).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
