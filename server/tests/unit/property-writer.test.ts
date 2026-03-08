import { serializeProperties, toJsonString } from "../../src/serializers/property-writer";
import { RobloxInstance } from "../../src/types/roblox";

function makeInstance(overrides: Partial<RobloxInstance>): RobloxInstance {
  return {
    ClassName: "Part",
    Name: "Part",
    Properties: {},
    ...overrides,
  };
}

describe("serializeProperties", () => {
  it("includes ClassName and Name", () => {
    const result = serializeProperties(makeInstance({ ClassName: "Script", Name: "MyScript" })) as any;
    expect(result.ClassName).toBe("Script");
    expect(result.Name).toBe("MyScript");
  });

  it("strips the Source property from Properties", () => {
    const inst = makeInstance({
      Properties: { Source: "print('hi')", Disabled: false },
    });
    const result = serializeProperties(inst) as any;
    expect(result.Properties.Source).toBeUndefined();
    expect(result.Properties.Disabled).toBe(false);
  });

  it("omits Properties key entirely when only Source remains", () => {
    const inst = makeInstance({ Properties: { Source: "local x = 1" } });
    const result = serializeProperties(inst) as any;
    expect(result.Properties).toBeUndefined();
  });

  it("omits Properties key when Properties is empty", () => {
    const inst = makeInstance({ Properties: {} });
    const result = serializeProperties(inst) as any;
    expect(result.Properties).toBeUndefined();
  });

  it("includes non-empty Attributes", () => {
    const inst = makeInstance({
      Properties: {},
      Attributes: { _rtvs_fsName: "My_Part" },
    });
    const result = serializeProperties(inst) as any;
    expect(result.Attributes).toEqual({ _rtvs_fsName: "My_Part" });
  });

  it("omits Attributes when empty", () => {
    const inst = makeInstance({ Properties: {}, Attributes: {} });
    const result = serializeProperties(inst) as any;
    expect(result.Attributes).toBeUndefined();
  });

  it("omits Attributes when not present", () => {
    const inst = makeInstance({ Properties: {} });
    const result = serializeProperties(inst) as any;
    expect(result.Attributes).toBeUndefined();
  });

  it("preserves non-Source properties alongside Source", () => {
    const inst = makeInstance({
      Properties: { Source: "code", Disabled: true, RunContext: "Server" },
    });
    const result = serializeProperties(inst) as any;
    expect(result.Properties.Disabled).toBe(true);
    expect(result.Properties.RunContext).toBe("Server");
    expect(result.Properties.Source).toBeUndefined();
  });
});

describe("toJsonString", () => {
  it("produces pretty-printed JSON with 2-space indentation", () => {
    const obj = { a: 1, b: "hello" };
    expect(toJsonString(obj)).toBe(JSON.stringify(obj, null, 2));
  });

  it("output is valid parseable JSON", () => {
    const obj = { ClassName: "Script", Name: "Test", Properties: { Disabled: false } };
    expect(() => JSON.parse(toJsonString(obj))).not.toThrow();
  });

  it("round-trips the object correctly", () => {
    const obj = { ClassName: "Folder", Name: "F", Attributes: { key: "value" } };
    const parsed = JSON.parse(toJsonString(obj));
    expect(parsed).toEqual(obj);
  });
});
