import { compareVersions } from "../../src/utils/version-checker";

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("0.1.3", "0.1.3")).toBe(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("2.5.11", "2.5.11")).toBe(0);
  });

  it("returns 1 when v1 is greater at the patch level", () => {
    expect(compareVersions("0.1.3", "0.1.2")).toBe(1);
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
  });

  it("returns -1 when v1 is smaller at the patch level", () => {
    expect(compareVersions("0.1.2", "0.1.3")).toBe(-1);
    expect(compareVersions("0.0.1", "0.0.2")).toBe(-1);
  });

  it("returns 1 when v1 is greater at the minor level", () => {
    expect(compareVersions("0.2.0", "0.1.9")).toBe(1);
    expect(compareVersions("1.3.0", "1.2.99")).toBe(1);
  });

  it("returns -1 when v1 is smaller at the minor level", () => {
    expect(compareVersions("0.1.5", "0.2.0")).toBe(-1);
  });

  it("returns 1 when v1 is greater at the major level", () => {
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
  });

  it("returns -1 when v1 is smaller at the major level", () => {
    expect(compareVersions("0.9.9", "1.0.0")).toBe(-1);
  });

  it("handles missing patch segment (treats as 0)", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0", "1.0")).toBe(0);
  });

  it("handles missing minor and patch segments", () => {
    expect(compareVersions("1", "1.0.0")).toBe(0);
    expect(compareVersions("2", "1.9.9")).toBe(1);
  });
});
