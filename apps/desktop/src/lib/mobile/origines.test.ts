import { describe, expect, it } from "vitest";
import { MODELE_ANDROID, modeleOrigines, VERSION_ORIGINES, type PluginOrigines } from "./origines";

const bon = { version: VERSION_ORIGINES, origines: true, modele: MODELE_ANDROID, pont: "isole" };
const plugin = (etat: unknown): PluginOrigines => ({ etat: async () => etat as never });
const PAGE = "https://localhost";

describe("origine par plugin sur Android", () => {
  it("renvoie le modèle quand la partie native le confirme", async () => {
    expect(await modeleOrigines(plugin(bon), PAGE)).toBe("https://{id}.plugins.localhost");
  });

  it("n'a rien à faire hors de l'application Android", async () => {
    expect(await modeleOrigines(undefined, PAGE)).toBeUndefined();
  });

  it("retombe sur le repli si la partie native refuse ou diffère", async () => {
    for (const etat of [
      { ...bon, origines: false },
      { ...bon, origines: "oui" },
      { ...bon, pont: "expose" },
      { ...bon, pont: undefined },
      { ...bon, version: 2 },
      { ...bon, version: undefined },
      { ...bon, modele: "https://{id}.evil.test" },
      { ...bon, modele: undefined },
      null,
      undefined,
      "ok",
    ]) {
      expect(await modeleOrigines(plugin(etat), PAGE), JSON.stringify(etat)).toBeUndefined();
    }
  });

  it("retombe sur le repli si l'appel échoue ou ne répond jamais", async () => {
    const echec: PluginOrigines = { etat: () => Promise.reject(new Error("pas de pont")) };
    expect(await modeleOrigines(echec, PAGE)).toBeUndefined();
    const muet: PluginOrigines = { etat: () => new Promise(() => {}) };
    expect(await modeleOrigines(muet, PAGE, 20)).toBeUndefined();
  });

  it("refuse un modèle qui fabriquerait l'origine de l'application", async () => {
    expect(await modeleOrigines(plugin(bon), "https://a.plugins.localhost")).toBeUndefined();
  });
});
