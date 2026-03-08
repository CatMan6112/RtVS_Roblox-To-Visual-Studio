import {
  isScriptInstance,
  hasChildren,
  SERVICE_NAMES,
  SERVICE_NAMES_SET,
} from "../../src/types/roblox";

describe("isScriptInstance", () => {
  it("returns true for Script", () => {
    expect(isScriptInstance({ ClassName: "Script", Name: "S", Properties: {} })).toBe(true);
  });

  it("returns true for LocalScript", () => {
    expect(isScriptInstance({ ClassName: "LocalScript", Name: "S", Properties: {} })).toBe(true);
  });

  it("returns true for ModuleScript", () => {
    expect(isScriptInstance({ ClassName: "ModuleScript", Name: "S", Properties: {} })).toBe(true);
  });

  it("returns false for Folder", () => {
    expect(isScriptInstance({ ClassName: "Folder", Name: "F", Properties: {} })).toBe(false);
  });

  it("returns false for Part", () => {
    expect(isScriptInstance({ ClassName: "Part", Name: "P", Properties: {} })).toBe(false);
  });

  it("returns false for Workspace", () => {
    expect(isScriptInstance({ ClassName: "Workspace", Name: "W", Properties: {} })).toBe(false);
  });

  it("is case-sensitive (lowercase script is not a script)", () => {
    expect(isScriptInstance({ ClassName: "script", Name: "s", Properties: {} })).toBe(false);
  });
});

describe("hasChildren", () => {
  it("returns false when Children is undefined", () => {
    expect(hasChildren({ ClassName: "Folder", Name: "F", Properties: {} })).toBe(false);
  });

  it("returns false when Children is an empty array", () => {
    expect(hasChildren({ ClassName: "Folder", Name: "F", Properties: {}, Children: [] })).toBe(false);
  });

  it("returns true when Children has one entry", () => {
    const child = { ClassName: "Part", Name: "P", Properties: {} };
    expect(hasChildren({ ClassName: "Folder", Name: "F", Properties: {}, Children: [child] })).toBe(true);
  });

  it("returns true when Children has multiple entries", () => {
    const children = [
      { ClassName: "Part", Name: "P1", Properties: {} },
      { ClassName: "Part", Name: "P2", Properties: {} },
    ];
    expect(hasChildren({ ClassName: "Folder", Name: "F", Properties: {}, Children: children })).toBe(true);
  });
});

describe("SERVICE_NAMES_SET", () => {
  it("contains all entries from SERVICE_NAMES", () => {
    for (const name of SERVICE_NAMES) {
      expect(SERVICE_NAMES_SET.has(name)).toBe(true);
    }
  });

  it("does not contain non-service class names", () => {
    expect(SERVICE_NAMES_SET.has("Part")).toBe(false);
    expect(SERVICE_NAMES_SET.has("DataModel")).toBe(false);
    expect(SERVICE_NAMES_SET.has("Folder")).toBe(false);
  });

  it("has exactly the same size as SERVICE_NAMES (no duplicates)", () => {
    expect(SERVICE_NAMES_SET.size).toBe(SERVICE_NAMES.length);
  });

  it("contains known services", () => {
    expect(SERVICE_NAMES_SET.has("Workspace")).toBe(true);
    expect(SERVICE_NAMES_SET.has("ReplicatedStorage")).toBe(true);
    expect(SERVICE_NAMES_SET.has("ServerScriptService")).toBe(true);
    expect(SERVICE_NAMES_SET.has("StarterGui")).toBe(true);
  });
});
