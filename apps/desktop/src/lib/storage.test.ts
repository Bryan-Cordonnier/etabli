import { beforeEach, describe, expect, it, vi } from "vitest";

/** Stockage en mémoire posé à la place de localStorage avant d'importer les modules. */
function poserStockage(initial: Record<string, string> = {}) {
  const valeurs = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (c: string) => valeurs.get(c) ?? null,
    setItem: (c: string, v: string) => void valeurs.set(c, v),
  });
  return valeurs;
}

async function charger() {
  vi.resetModules();
  return import("./storage");
}

describe("réglages dans un navigateur (via le fond)", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("reprend les anciennes clés « etabli.settings » et « etabli.session » au premier lancement", async () => {
    poserStockage({
      "etabli.settings": JSON.stringify({ theme: "clair" }),
      "etabli.session": JSON.stringify({ actif: 2 }),
    });
    const { initStorage, load, wasUsedBefore } = await charger();
    await initStorage();
    expect(load("settings", {})).toEqual({ theme: "clair" });
    expect(load("session", null)).toEqual({ actif: 2 });
    expect(wasUsedBefore()).toBe(true);
  });

  it("premier lancement vide : valeurs par défaut", async () => {
    poserStockage();
    const { initStorage, load, wasUsedBefore } = await charger();
    await initStorage();
    expect(load("settings", { par: "défaut" })).toEqual({ par: "défaut" });
    expect(wasUsedBefore()).toBe(false);
  });

  it("enregistre 300 ms après la dernière modification, puis relit", async () => {
    vi.useFakeTimers();
    const valeurs = poserStockage();
    const { initStorage, load, save } = await charger();
    await initStorage();
    save("settings", { theme: "sombre" });
    save("settings", { theme: "sombre", taille: 110 });
    expect(valeurs.has("etabli.store")).toBe(false);
    await vi.advanceTimersByTimeAsync(299);
    expect(valeurs.has("etabli.store")).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(JSON.parse(valeurs.get("etabli.store") ?? "{}")).toEqual({ settings: { theme: "sombre", taille: 110 } });
    expect(load("settings", {})).toEqual({ theme: "sombre", taille: 110 });
    vi.useRealTimers();
  });
});
