import { simpleHash, ChangeTracker } from "../../src/change-tracker";

describe("simpleHash", () => {
  it("returns a hex string", () => {
    expect(simpleHash("hello")).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic", () => {
    expect(simpleHash("test")).toBe(simpleHash("test"));
  });

  it("produces different hashes for different content", () => {
    expect(simpleHash("foo")).not.toBe(simpleHash("bar"));
  });

  it("handles empty string without throwing", () => {
    expect(simpleHash("")).toMatch(/^[0-9a-f]+$/);
  });

  it("handles long strings", () => {
    const long = "a".repeat(10000);
    expect(simpleHash(long)).toMatch(/^[0-9a-f]+$/);
  });
});

describe("ChangeTracker", () => {
  let tracker: ChangeTracker;

  beforeEach(() => {
    jest.useFakeTimers();
    tracker = new ChangeTracker();
  });

  afterEach(() => {
    tracker.destroy();
    jest.useRealTimers();
  });

  describe("shouldForwardToPlugin", () => {
    it("returns true when path has no record", () => {
      expect(tracker.shouldForwardToPlugin("/foo", "abc")).toBe(true);
    });

    it("suppresses echo when same path and hash were marked studio origin", () => {
      tracker.markStudioOrigin("/foo", "abc");
      expect(tracker.shouldForwardToPlugin("/foo", "abc")).toBe(false);
    });

    it("forwards when hash differs (genuine FS change after Studio write)", () => {
      tracker.markStudioOrigin("/foo", "abc");
      expect(tracker.shouldForwardToPlugin("/foo", "xyz")).toBe(true);
    });

    it("removes entry after suppressing (echo consumed once)", () => {
      tracker.markStudioOrigin("/foo", "abc");
      tracker.shouldForwardToPlugin("/foo", "abc"); // consume
      expect(tracker.shouldForwardToPlugin("/foo", "abc")).toBe(true); // no longer suppressed
    });

    it("forwards after TTL expires", () => {
      tracker.markStudioOrigin("/foo", "abc");
      jest.advanceTimersByTime(6000); // past 5s TTL
      expect(tracker.shouldForwardToPlugin("/foo", "abc")).toBe(true);
    });

    it("suppresses all forwarding when bulkWrite is active", () => {
      tracker.beginBulkWrite();
      expect(tracker.shouldForwardToPlugin("/anything", "hash")).toBe(false);
    });

    it("resumes forwarding after endBulkWrite", () => {
      tracker.beginBulkWrite();
      tracker.endBulkWrite();
      expect(tracker.shouldForwardToPlugin("/anything", "hash")).toBe(true);
    });
  });

  describe("shouldWriteToFs", () => {
    it("returns true when path has no record", () => {
      expect(tracker.shouldWriteToFs("/bar", "abc")).toBe(true);
    });

    it("suppresses echo when same path and hash were marked FS origin", () => {
      tracker.markFsOrigin("/bar", "abc");
      expect(tracker.shouldWriteToFs("/bar", "abc")).toBe(false);
    });

    it("forwards when hash differs", () => {
      tracker.markFsOrigin("/bar", "abc");
      expect(tracker.shouldWriteToFs("/bar", "xyz")).toBe(true);
    });

    it("removes entry after suppressing", () => {
      tracker.markFsOrigin("/bar", "abc");
      tracker.shouldWriteToFs("/bar", "abc"); // consume
      expect(tracker.shouldWriteToFs("/bar", "abc")).toBe(true);
    });

    it("forwards after TTL expires", () => {
      tracker.markFsOrigin("/bar", "abc");
      jest.advanceTimersByTime(6000);
      expect(tracker.shouldWriteToFs("/bar", "abc")).toBe(true);
    });
  });

  describe("beginBulkWrite / endBulkWrite", () => {
    it("endBulkWrite clears all tracked entries", () => {
      tracker.markStudioOrigin("/a", "1");
      tracker.markFsOrigin("/b", "2");
      tracker.beginBulkWrite();
      tracker.endBulkWrite();
      expect(tracker.shouldForwardToPlugin("/a", "1")).toBe(true);
      expect(tracker.shouldWriteToFs("/b", "2")).toBe(true);
    });
  });

  describe("destroy", () => {
    it("does not throw when called multiple times", () => {
      expect(() => {
        tracker.destroy();
        tracker.destroy();
      }).not.toThrow();
    });
  });
});
