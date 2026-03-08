import {
  buildRootIndex,
  extractFlatMetadata,
  buildIndexFromFlatMetadata,
  extractIndexMetadata,
  buildRootIndexFromMetadata,
} from "../../src/file-system/index-builder";
import { GameData, RobloxInstance } from "../../src/types/roblox";

function makeInstance(name: string, className: string, children?: RobloxInstance[]): RobloxInstance {
  return { ClassName: className, Name: name, Properties: { Source: "-- code" }, Children: children };
}

function makeGameData(services: RobloxInstance[]): GameData {
  return { ClassName: "DataModel", Name: "Game", Services: services };
}

describe("extractFlatMetadata", () => {
  it("returns a single entry for a leaf node", () => {
    const result = extractFlatMetadata(makeInstance("Part", "Part"));
    expect(result.size).toBe(1);
    expect(result.get("Part")).toEqual({ name: "Part", className: "Part" });
  });

  it("returns entries for all nodes in a two-level tree", () => {
    const tree = makeInstance("Workspace", "Workspace", [makeInstance("Child", "Script")]);
    const result = extractFlatMetadata(tree);
    expect(result.get("Workspace")).toEqual({ name: "Workspace", className: "Workspace" });
    expect(result.get("Workspace/Child")).toEqual({ name: "Child", className: "Script" });
    expect(result.size).toBe(2);
  });

  it("handles deep nesting", () => {
    const deep = makeInstance("A", "Folder", [
      makeInstance("B", "Folder", [makeInstance("C", "Part")]),
    ]);
    const result = extractFlatMetadata(deep);
    expect(result.has("A")).toBe(true);
    expect(result.has("A/B")).toBe(true);
    expect(result.has("A/B/C")).toBe(true);
    expect(result.size).toBe(3);
  });

  it("applies prefix to all keys", () => {
    const inst = makeInstance("Leaf", "ModuleScript");
    const result = extractFlatMetadata(inst, "Root/Sub");
    expect(result.get("Root/Sub/Leaf")).toEqual({ name: "Leaf", className: "ModuleScript" });
  });
});

describe("buildIndexFromFlatMetadata", () => {
  it("reconstructs a root node from a flat map with one entry", () => {
    const flat = extractFlatMetadata(makeInstance("Workspace", "Workspace"));
    const result = buildIndexFromFlatMetadata(flat);
    expect(result.has("Workspace")).toBe(true);
    expect(result.get("Workspace")!.className).toBe("Workspace");
    expect(result.get("Workspace")!.children.size).toBe(0);
  });

  it("reconstructs a two-level tree correctly", () => {
    const tree = makeInstance("Workspace", "Workspace", [
      makeInstance("Part", "Part"),
      makeInstance("MyScript", "Script"),
    ]);
    const result = buildIndexFromFlatMetadata(extractFlatMetadata(tree));
    const ws = result.get("Workspace")!;
    expect(ws.children.size).toBe(2);
    expect(ws.children.get("Part")!.className).toBe("Part");
    expect(ws.children.get("MyScript")!.className).toBe("Script");
  });

  it("handles three-level nesting", () => {
    const tree = makeInstance("SS", "ServerScriptService", [
      makeInstance("Child", "Folder", [makeInstance("GC", "Folder")]),
    ]);
    const result = buildIndexFromFlatMetadata(extractFlatMetadata(tree));
    const gc = result.get("SS")!.children.get("Child")!.children.get("GC");
    expect(gc).toBeDefined();
    expect(gc!.className).toBe("Folder");
  });

  it("returns empty map for empty input", () => {
    expect(buildIndexFromFlatMetadata(new Map()).size).toBe(0);
  });
});

describe("buildRootIndex", () => {
  it("produces services array with correct names and paths", () => {
    const ws = makeInstance("Workspace", "Workspace", [makeInstance("Part", "Part")]);
    const index = buildRootIndex(makeGameData([ws]));
    expect(index.services).toHaveLength(1);
    expect(index.services[0].name).toBe("Workspace");
    expect(index.services[0].path).toBe("/Workspace");
  });

  it("counts total objects correctly", () => {
    const ws = makeInstance("Workspace", "Workspace", [
      makeInstance("A", "Part"),
      makeInstance("B", "Folder"),
    ]);
    const index = buildRootIndex(makeGameData([ws]));
    expect(index.totalObjects).toBe(3); // Workspace + A + B
  });

  it("includes children entries in the index", () => {
    const script = makeInstance("Init", "Script");
    const ws = makeInstance("Workspace", "Workspace", [script]);
    const index = buildRootIndex(makeGameData([ws]));
    expect(index.services[0].children).toHaveLength(1);
    expect(index.services[0].children![0].name).toBe("Init");
    expect(index.services[0].children![0].path).toBe("/Workspace/Init");
  });

  it("has a valid ISO timestamp", () => {
    const index = buildRootIndex(makeGameData([makeInstance("Workspace", "Workspace")]));
    expect(new Date(index.timestamp).getTime()).toBeGreaterThan(0);
  });

  it("handles multiple services", () => {
    const gameData = makeGameData([
      makeInstance("Workspace", "Workspace"),
      makeInstance("ReplicatedStorage", "ReplicatedStorage"),
    ]);
    const index = buildRootIndex(gameData);
    expect(index.services).toHaveLength(2);
    expect(index.totalObjects).toBe(2);
  });
});

describe("extractIndexMetadata", () => {
  it("preserves name and className", () => {
    const node = extractIndexMetadata(makeInstance("MyScript", "Script"));
    expect(node.name).toBe("MyScript");
    expect(node.className).toBe("Script");
  });

  it("strips Properties from the result", () => {
    const node = extractIndexMetadata(makeInstance("Part", "Part"));
    expect((node as any).Properties).toBeUndefined();
  });

  it("builds children map from children array", () => {
    const tree = makeInstance("Workspace", "Workspace", [makeInstance("Part", "Part")]);
    const node = extractIndexMetadata(tree);
    expect(node.children.has("Part")).toBe(true);
  });
});

describe("buildRootIndexFromMetadata", () => {
  it("produces equivalent structure to buildRootIndex for same data", () => {
    const ws = makeInstance("Workspace", "Workspace", [makeInstance("Part", "Part")]);
    const flat = extractFlatMetadata(ws);
    const tree = buildIndexFromFlatMetadata(flat);
    const index = buildRootIndexFromMetadata(tree);
    expect(index.services).toHaveLength(1);
    expect(index.services[0].name).toBe("Workspace");
    expect(index.totalObjects).toBe(2);
  });
});
