import fs from "fs/promises";
import os from "os";
import path from "path";
import { FileSystemWriter } from "../../src/file-system/writer";
import { GameData, RobloxInstance } from "../../src/types/roblox";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rtvs-writer-test-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeInstance(
  name: string,
  className: string,
  source?: string,
  children?: RobloxInstance[]
): RobloxInstance {
  return {
    ClassName: className,
    Name: name,
    Properties: source !== undefined ? { Source: source } : {},
    Children: children,
  };
}

function makeGameData(services: RobloxInstance[]): GameData {
  return { ClassName: "DataModel", Name: "Game", Services: services };
}

describe("FileSystemWriter", () => {
  it("writes a Script as a .lua file with correct content", async () => {
    const outDir = path.join(tmpDir, "test-script");
    const writer = new FileSystemWriter(outDir);
    const gameData = makeGameData([
      makeInstance("ServerScriptService", "ServerScriptService", undefined, [
        makeInstance("Init", "Script", "print('init')"),
      ]),
    ]);

    await writer.writeGameData(gameData);

    const luaContent = await fs.readFile(
      path.join(outDir, "ServerScriptService", "Init.lua"),
      "utf-8"
    );
    expect(luaContent).toBe("print('init')");
  });

  it("writes a LocalScript as .client.lua", async () => {
    const outDir = path.join(tmpDir, "test-localscript");
    const writer = new FileSystemWriter(outDir);
    const gameData = makeGameData([
      makeInstance("StarterGui", "StarterGui", undefined, [
        makeInstance("Loader", "LocalScript", "local x = 1"),
      ]),
    ]);

    await writer.writeGameData(gameData);

    const content = await fs.readFile(
      path.join(outDir, "StarterGui", "Loader.client.lua"),
      "utf-8"
    );
    expect(content).toBe("local x = 1");
  });

  it("writes a ModuleScript as .module.lua", async () => {
    const outDir = path.join(tmpDir, "test-modulescript");
    const writer = new FileSystemWriter(outDir);
    const gameData = makeGameData([
      makeInstance("ReplicatedStorage", "ReplicatedStorage", undefined, [
        makeInstance("Util", "ModuleScript", "return {}"),
      ]),
    ]);

    await writer.writeGameData(gameData);

    const content = await fs.readFile(
      path.join(outDir, "ReplicatedStorage", "Util.module.lua"),
      "utf-8"
    );
    expect(content).toBe("return {}");
  });

  it("writes a Folder as a __main__.json without Source", async () => {
    const outDir = path.join(tmpDir, "test-folder");
    const writer = new FileSystemWriter(outDir);
    const gameData = makeGameData([
      makeInstance("Workspace", "Workspace", undefined, [
        makeInstance("MyFolder", "Folder"),
      ]),
    ]);

    await writer.writeGameData(gameData);

    const jsonPath = path.join(outDir, "Workspace", "MyFolder", "__main__.json");
    const parsed = JSON.parse(await fs.readFile(jsonPath, "utf-8"));
    expect(parsed.ClassName).toBe("Folder");
    expect(parsed.Name).toBe("MyFolder");
    expect(parsed.Properties?.Source).toBeUndefined();
  });

  it("writes index.json at the root", async () => {
    const outDir = path.join(tmpDir, "test-index");
    const writer = new FileSystemWriter(outDir);
    const gameData = makeGameData([makeInstance("Workspace", "Workspace")]);

    await writer.writeGameData(gameData);

    const indexPath = path.join(outDir, "index.json");
    const index = JSON.parse(await fs.readFile(indexPath, "utf-8"));
    expect(index.services).toBeDefined();
    expect(index.services[0].name).toBe("Workspace");
    expect(index.services[0].path).toBe("/Workspace");
  });

  it("returns the correct filesWritten count", async () => {
    const outDir = path.join(tmpDir, "test-count");
    const writer = new FileSystemWriter(outDir);
    // Files: SS/__main__.json + Script1.lua + Folder1/__main__.json + index.json = 4
    const gameData = makeGameData([
      makeInstance("ServerScriptService", "ServerScriptService", undefined, [
        makeInstance("Script1", "Script", ""),
        makeInstance("Folder1", "Folder"),
      ]),
    ]);

    const count = await writer.writeGameData(gameData);
    expect(count).toBe(4);
  });

  it("sanitizes names with invalid characters", async () => {
    const outDir = path.join(tmpDir, "test-sanitize");
    const writer = new FileSystemWriter(outDir);
    const gameData = makeGameData([
      makeInstance("Workspace", "Workspace", undefined, [
        makeInstance("Part:1", "Part"),
      ]),
    ]);

    await writer.writeGameData(gameData);

    // "Part:1" should become "Part_1"
    const jsonPath = path.join(outDir, "Workspace", "Part_1", "__main__.json");
    const parsed = JSON.parse(await fs.readFile(jsonPath, "utf-8"));
    expect(parsed.Name).toBe("Part:1"); // Name in JSON is original
  });

  it("handles script with children (writes __main__.lua + __main__.json)", async () => {
    const outDir = path.join(tmpDir, "test-script-folder");
    const writer = new FileSystemWriter(outDir);
    const gameData = makeGameData([
      makeInstance("ServerScriptService", "ServerScriptService", undefined, [
        makeInstance("Main", "Script", "print('main')", [
          makeInstance("Helper", "ModuleScript", "return {}"),
        ]),
      ]),
    ]);

    await writer.writeGameData(gameData);

    const mainLua = await fs.readFile(
      path.join(outDir, "ServerScriptService", "Main", "__main__.lua"),
      "utf-8"
    );
    expect(mainLua).toBe("print('main')");

    const helperLua = await fs.readFile(
      path.join(outDir, "ServerScriptService", "Main", "Helper.module.lua"),
      "utf-8"
    );
    expect(helperLua).toBe("return {}");
  });

  it("getFilesWritten returns the written count after writeGameData", async () => {
    const outDir = path.join(tmpDir, "test-get-count");
    const writer = new FileSystemWriter(outDir);
    const gameData = makeGameData([makeInstance("Workspace", "Workspace")]);
    const count = await writer.writeGameData(gameData);
    expect(writer.getFilesWritten()).toBe(count);
  });
});
