import path from "path";
import { sanitizeName, makeUniqueName, getInstancePath, pathArrayToAbsolute } from "../../src/file-system/path-generator";

describe("sanitizeName", () => {
  it("passes through normal names unchanged", () => {
    expect(sanitizeName("Part")).toBe("Part");
    expect(sanitizeName("MyScript")).toBe("MyScript");
    expect(sanitizeName("hello_world")).toBe("hello_world");
  });

  it("replaces invalid file system characters with underscores", () => {
    expect(sanitizeName("foo/bar")).toBe("foo_bar");
    expect(sanitizeName("foo:bar")).toBe("foo_bar");
    expect(sanitizeName('foo"bar')).toBe("foo_bar");
    expect(sanitizeName("a<b>c")).toBe("a_b_c");
    expect(sanitizeName("pipe|name")).toBe("pipe_name");
    expect(sanitizeName("q?mark")).toBe("q_mark");
    expect(sanitizeName("a*b")).toBe("a_b");
  });

  it("removes trailing dots and spaces", () => {
    expect(sanitizeName("foo.")).toBe("foo");
    expect(sanitizeName("foo  ")).toBe("foo");
    expect(sanitizeName("foo. .")).toBe("foo");
  });

  it("removes leading dots", () => {
    expect(sanitizeName(".hidden")).toBe("hidden");
    expect(sanitizeName("..dots")).toBe("dots");
  });

  it("prefixes Windows reserved names", () => {
    expect(sanitizeName("CON")).toBe("_CON");
    expect(sanitizeName("nul")).toBe("_nul");
    expect(sanitizeName("COM1")).toBe("_COM1");
    expect(sanitizeName("LPT9")).toBe("_LPT9");
    expect(sanitizeName("PRN")).toBe("_PRN");
    expect(sanitizeName("AUX")).toBe("_AUX");
  });

  it("does not prefix non-reserved names that start with reserved prefix", () => {
    expect(sanitizeName("CONS")).toBe("CONS");
    expect(sanitizeName("NULL")).toBe("NULL");
  });

  it("returns 'Unnamed' for empty string", () => {
    expect(sanitizeName("")).toBe("Unnamed");
  });

  it("returns 'Unnamed' for whitespace-only string", () => {
    expect(sanitizeName("   ")).toBe("Unnamed");
  });

  it("removes null bytes", () => {
    expect(sanitizeName("foo\x00bar")).toBe("foobar");
  });

  it("removes backslashes", () => {
    expect(sanitizeName("foo\\bar")).toBe("foo_bar");
  });
});

describe("makeUniqueName", () => {
  it("returns baseName when not in existingNames", () => {
    expect(makeUniqueName("Part", new Set())).toBe("Part");
    expect(makeUniqueName("Script", new Set(["Other"]))).toBe("Script");
  });

  it("appends _2 for first collision", () => {
    expect(makeUniqueName("Part", new Set(["Part"]))).toBe("Part_2");
  });

  it("increments counter until unique", () => {
    const existing = new Set(["Part", "Part_2", "Part_3"]);
    expect(makeUniqueName("Part", existing)).toBe("Part_4");
  });

  it("handles many collisions", () => {
    const existing = new Set(["X", "X_2", "X_3", "X_4", "X_5"]);
    expect(makeUniqueName("X", existing)).toBe("X_6");
  });
});

describe("getInstancePath", () => {
  it("returns [sanitizedName] with no parent", () => {
    const inst = { ClassName: "Folder", Name: "MyFolder", Properties: {} };
    expect(getInstancePath(inst)).toEqual(["MyFolder"]);
  });

  it("appends sanitized name to parentPath", () => {
    const inst = { ClassName: "Script", Name: "my/script", Properties: {} };
    expect(getInstancePath(inst, ["Workspace"])).toEqual(["Workspace", "my_script"]);
  });

  it("does not mutate the parentPath array", () => {
    const parent = ["Workspace"];
    const inst = { ClassName: "Part", Name: "Part", Properties: {} };
    getInstancePath(inst, parent);
    expect(parent).toEqual(["Workspace"]);
  });
});

describe("pathArrayToAbsolute", () => {
  it("joins basePath with array segments", () => {
    const result = pathArrayToAbsolute("/base", ["Workspace", "Part"]);
    expect(result).toBe(path.join("/base", "Workspace", "Part"));
  });

  it("handles empty array", () => {
    expect(pathArrayToAbsolute("/base", [])).toBe("/base");
  });

  it("handles single segment", () => {
    expect(pathArrayToAbsolute("/base", ["folder"])).toBe(path.join("/base", "folder"));
  });
});
