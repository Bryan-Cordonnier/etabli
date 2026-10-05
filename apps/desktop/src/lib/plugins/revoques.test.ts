import { describe, expect, it } from "vitest";
import { majRevoques, revoques } from "./revoques.svelte";

describe("plugins révoqués", () => {
  it("remplace la liste à chaque chargement", () => {
    majRevoques([{ id: "tracage", raison: "faille corrigée en 1.2.0" }]);
    expect(revoques).toEqual({ tracage: "faille corrigée en 1.2.0" });
    expect("tracage" in revoques).toBe(true);

    majRevoques([{ id: "machines", raison: "données corrompues" }]);
    expect("tracage" in revoques).toBe(false);
    expect(revoques.machines).toBe("données corrompues");

    majRevoques([]);
    expect(Object.keys(revoques)).toHaveLength(0);
  });
});
