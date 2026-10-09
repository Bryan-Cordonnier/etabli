import { describe, expect, it } from "vitest";
import { versionPlusRecente } from "./versions";

describe("versionPlusRecente", () => {
  it("compare chaque nombre, pas le texte", () => {
    expect(versionPlusRecente("0.1.13", "0.1.12")).toBe(true);
    expect(versionPlusRecente("0.1.10", "0.1.9")).toBe(true);
    expect(versionPlusRecente("0.2.0", "0.1.99")).toBe(true);
    expect(versionPlusRecente("v1.0.0", "0.9.9")).toBe(true);
  });
  it("même version ou plus ancienne : faux", () => {
    expect(versionPlusRecente("0.1.12", "0.1.12")).toBe(false);
    expect(versionPlusRecente("0.1.2", "0.1.12")).toBe(false);
    expect(versionPlusRecente("0.1", "0.1.0")).toBe(false);
  });
});