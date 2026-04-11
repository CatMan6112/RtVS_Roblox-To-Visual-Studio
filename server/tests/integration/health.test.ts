import request from "supertest";
import { app } from "../../src/app";
import { updateSyncStats, resetSyncStats } from "../../src/api/health";
import { getChangeTracker } from "../../src/api/changes";

afterAll(() => {
  getChangeTracker().destroy();
});

afterEach(() => {
  resetSyncStats();
});

describe("GET /ping", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/ping");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("includes the server version", async () => {
    const res = await request(app).get("/ping");
    expect(res.body.version).toBe("0.1.7");
  });

  it("responds with JSON content-type", async () => {
    const res = await request(app).get("/ping");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});

describe("GET /status", () => {
  it("returns 200 with connected: true", async () => {
    const res = await request(app).get("/status");
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
  });

  it("returns filesCount: 0 and lastSync: null when no sync has occurred", async () => {
    const res = await request(app).get("/status");
    expect(res.body.filesCount).toBe(0);
    expect(res.body.lastSync).toBeNull();
  });

  it("reflects filesCount and lastSync after updateSyncStats", async () => {
    updateSyncStats(42);
    const res = await request(app).get("/status");
    expect(res.body.filesCount).toBe(42);
    expect(res.body.lastSync).toBeTruthy();
  });

  it("includes the server version", async () => {
    const res = await request(app).get("/status");
    expect(res.body.version).toBe("0.1.7");
  });
});

describe("404 handler", () => {
  it("returns 404 for unknown GET routes", async () => {
    const res = await request(app).get("/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not Found");
  });

  it("returns 404 for unknown POST routes", async () => {
    const res = await request(app).post("/unknown-endpoint").send({});
    expect(res.status).toBe(404);
  });
});
