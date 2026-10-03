import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Anciennes clés localStorage de l'aperçu navigateur, reprises par le fond web au premier accès. */
function poserStockage(initial: Record<string, string> = {}) {
  const valeurs = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (c: string) => valeurs.get(c) ?? null,
    setItem: (c: string, v: string) => void valeurs.set(c, v),
    key: (i: number) => [...valeurs.keys()][i] ?? null,
    get length() {
      return valeurs.size;
    },
  });
  return valeurs;
}

async function charger() {
  vi.resetModules();
  // Une base IndexedDB neuve à chaque test.
  vi.stubGlobal("indexedDB", new IDBFactory());
  return import("./storage");
}

describe("réglages dans un navigateur (via le fond web)", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("reprend les réglages de l'ancien aperçu (etabli.store) au premier lancement", async () => {
    poserStockage({ "etabli.store": JSON.stringify({ settings: { theme: "clair" }, session: { actif: 2 } }) });
    const { initStorage, load, wasUsedBefore } = await charger();
    await initStorage();
    expect(load("settings", {})).toEqual({ theme: "clair" });
    expect(load("session", null)).toEqual({ actif: 2 });
    expect(wasUsedBefore()).toBe(true);
  });

  it("reprend aussi les très anciennes clés « etabli.settings » et « etabli.session »", async () => {
    poserStockage({
      "etabli.settings": JSON.stringify({ theme: "clair" }),
      "etabli.session": JSON.stringify({ actif: 2 }),
    });
    const { initStorage, load } = await charger();
    await initStorage();
    expect(load("settings", {})).toEqual({ theme: "clair" });
    expect(load("session", null)).toEqual({ actif: 2 });
  });

  it("premier lancement vide : valeurs par défaut", async () => {
    poserStockage();
    const { initStorage, load, wasUsedBefore } = await charger();
    await initStorage();
    expect(load("settings", { par: "défaut" })).toEqual({ par: "défaut" });
    expect(wasUsedBefore()).toBe(false);
  });

  it("enregistre 300 ms après la dernière modification, puis relit", async () => {
    poserStockage();
    const { initStorage, load, save } = await charger();
    await initStorage();
    const { api } = await import("./api");
    save("settings", { theme: "sombre" });
    save("settings", { theme: "sombre", taille: 110 });
    expect(await api.storeLoad()).toEqual({});
    await new Promise((r) => setTimeout(r, 450));
    expect(await api.storeLoad()).toEqual({ settings: { theme: "sombre", taille: 110 } });
    expect(load("settings", {})).toEqual({ theme: "sombre", taille: 110 });
  });
});
