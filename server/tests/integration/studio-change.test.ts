jest.mock("fs/promises");

import request from "supertest";
import fs from "fs/promises";
import { app } from "../../src/app";
import { pathConfig } from "../../src/config/path-config";
import { getChangeTracker } from "../../src/api/changes";
import { simpleHash } from "../../src/change-tracker";

const mockFs = fs as jest.Mocked<typeof fs>;

beforeAll(() => {
  pathConfig.setStoragePath("/fake/storage");
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFs.mkdir.mockResolvedValue(undefined);
  mockFs.writeFile.mockResolvedValue(undefined);
  mockFs.unlink.mockResolvedValue(undefined);
});

afterAll(() => {
  getChangeTracker().destroy();
});

describe("POST /studio-change — input validation", () => {
  it("returns 400 when path is missing", async () => {
    const res = await request(app)
      .post("/studio-change")
      .send({ content: "x", type: "create" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when type is missing", async () => {
    const res = await request(app)
      .post("/studio-change")
      .send({ path: "Workspace/Part/__main__.json", content: "{}" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when type is an invalid value", async () => {
    const res = await request(app)
      .post("/studio-change")
      .send({ path: "foo.lua", content: "x", type: "modify" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /studio-change — create / update", () => {
  it("calls fs.mkdir and fs.writeFile for a create operation", async () => {
    const res = await request(app)
      .post("/studio-change")
      .send({ path: "Workspace/Part/__main__.json", content: '{"ClassName":"Part"}', type: "create" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockFs.mkdir).toHaveBeenCalled();
    expect(mockFs.writeFile).toHaveBeenCalled();
  });

  it("calls fs.writeFile for an update operation", async () => {
    const res = await request(app)
      .post("/studio-change")
      .send({ path: "ServerScriptService/Init.lua", content: "print(2)", type: "update" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockFs.writeFile).toHaveBeenCalled();
  });

  it("accepts empty string content for create", async () => {
    const res = await request(app)
      .post("/studio-change")
      .send({ path: "SS/EmptyScript.lua", content: "", type: "create" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("response includes path and type", async () => {
    const res = await request(app)
      .post("/studio-change")
      .send({ path: "SS/x.lua", content: "local x", type: "update" });
    expect(res.body.path).toBe("SS/x.lua");
    expect(res.body.type).toBe("update");
  });
});

describe("POST /studio-change — delete", () => {
  it("calls fs.unlink for a delete operation", async () => {
    const res = await request(app)
      .post("/studio-change")
      .send({ path: "Workspace/OldPart/__main__.json", type: "delete" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockFs.unlink).toHaveBeenCalled();
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("succeeds even when the file does not exist (ENOENT swallowed)", async () => {
    const enoentError = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
    mockFs.unlink.mockRejectedValueOnce(enoentError);
    const res = await request(app)
      .post("/studio-change")
      .send({ path: "Workspace/Gone/__main__.json", type: "delete" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("POST /studio-change — echo suppression", () => {
  it("suppresses write and returns suppressed:true when change is an FS-origin echo", async () => {
    const tracker = getChangeTracker();
    const content = "-- this was sent from FS to Studio";
    const hash = simpleHash(content);
    tracker.markFsOrigin("Echo/file.lua", hash);

    const res = await request(app)
      .post("/studio-change")
      .send({ path: "Echo/file.lua", content, type: "update" });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBe(true);
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("does not suppress when content hash differs (genuine Studio edit)", async () => {
    const tracker = getChangeTracker();
    tracker.markFsOrigin("Genuine/file.lua", simpleHash("original content"));

    const res = await request(app)
      .post("/studio-change")
      .send({ path: "Genuine/file.lua", content: "edited content", type: "update" });

    expect(res.status).toBe(200);
    expect(res.body.suppressed).toBeUndefined();
    expect(mockFs.writeFile).toHaveBeenCalled();
  });
});
