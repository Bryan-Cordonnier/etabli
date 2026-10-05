import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { creerFondWeb, type AncienStockage } from "./web";
import type { DocumentInput, Fond } from "./types";

/** Un fond neuf sur une base vide, sans reprise de l'ancien stockage ni plugins. */
const neuf = (extra: Parameters<typeof creerFondWeb>[0] = {}): Fond =>
  creerFondWeb({ idb: new IDBFactory(), ancien: null, plugins: async () => [], sonde: async () => false, ...extra });

/** Ancien localStorage en mémoire. */
function ancienStockage(valeurs: Record<string, string>): AncienStockage {
  const cles = Object.keys(valeurs);
  return { getItem: (c) => valeurs[c] ?? null, key: (i) => cles[i] ?? null, length: cles.length };
}

const entree = (extra: Partial<DocumentInput> = {}): DocumentInput => ({
  pluginId: "tolerie",
  appId: "vé",
  dataVersion: 1,
  title: "  Équerre 50 × 50  ",
  summary: "développé 96,52",
  data: { epaisseur: "3" },
  ...extra,
});
const pause = () => new Promise((r) => setTimeout(r, 5));

describe("fond web : documents", () => {
  it("enregistre, relit et nettoie le titre", async () => {
    const fond = neuf();
    const meta = await fond.documentSave(entree());
    expect(meta.title).toBe("Équerre 50 × 50");
    expect(meta.id).toMatch(/^[0-9a-f]{32}$/);
    const lu = await fond.documentRead(meta.id);
    expect(lu.data).toEqual({ epaisseur: "3" });
    expect(lu.format).toBe(1);
  });

  it("garde la date de création et met à jour la modification", async () => {
    const fond = neuf();
    const a = await fond.documentSave(entree());
    await pause();
    const b = await fond.documentSave(entree({ id: a.id, title: "Renommé" }));
    expect(b.id).toBe(a.id);
    expect(b.created).toBe(a.created);
    expect(b.modified).toBeGreaterThan(a.modified);
    expect(await fond.documentsList()).toHaveLength(1);
  });

  it("liste du plus récent au plus ancien, avec filtre et limite", async () => {
    const fond = neuf();
    const premier = await fond.documentSave(entree({ title: "A" }));
    await pause();
    await fond.documentSave(entree({ title: "B", pluginId: "maths", appId: "pythagore" }));
    await pause();
    const dernier = await fond.documentSave(entree({ title: "C" }));
    expect((await fond.documentsList()).map((d) => d.title)).toEqual(["C", "B", "A"]);
    expect((await fond.documentsList({ pluginId: "tolerie" })).map((d) => d.id)).toEqual([dernier.id, premier.id]);
    expect(await fond.documentsList({ limit: 1 })).toHaveLength(1);
    expect(await fond.documentsList({ appId: "inconnue" })).toEqual([]);
  });

  it("la liste ne contient pas les données du calcul", async () => {
    const fond = neuf();
    await fond.documentSave(entree());
    expect((await fond.documentsList())[0]).not.toHaveProperty("data");
  });

  it("supprime un document ; relire un document absent échoue", async () => {
    const fond = neuf();
    const { id } = await fond.documentSave(entree());
    await fond.documentDelete(id);
    expect(await fond.documentsList()).toEqual([]);
    await expect(fond.documentRead(id)).rejects.toThrow("Document introuvable");
  });

  it("les données survivent à la réouverture de la base", async () => {
    const idb = new IDBFactory();
    const { id } = await neuf({ idb }).documentSave(entree());
    expect((await neuf({ idb }).documentRead(id)).title).toBe("Équerre 50 × 50");
  });

  it("deux bases de noms différents sont indépendantes", async () => {
    const idb = new IDBFactory();
    await neuf({ idb, nom: "a" }).documentSave(entree());
    expect(await neuf({ idb, nom: "b" }).documentsList()).toEqual([]);
  });
});

describe("fond web : données, réglages, plugins", () => {
  it("données absentes = null, puis relues telles quelles", async () => {
    const fond = neuf();
    expect(await fond.dataRead("plugin.economie")).toBeNull();
    await fond.dataWrite("plugin.economie", { barre: 6000 });
    expect(await fond.dataRead("plugin.economie")).toEqual({ barre: 6000 });
    await fond.dataWrite("plugin.economie", { barre: 3000 });
    expect(await fond.dataRead("plugin.economie")).toEqual({ barre: 3000 });
  });

  it("les réglages (settings, session) font l'aller-retour", async () => {
    const fond = neuf();
    expect(await fond.storeLoad()).toEqual({});
    await fond.storeSave({ settings: { theme: "sombre" }, session: { onglets: [] } });
    expect(await fond.storeLoad()).toEqual({ settings: { theme: "sombre" }, session: { onglets: [] } });
  });

  it("liste les plugins fournis et refuse le catalogue et l'installation", async () => {
    const fond = neuf({ plugins: async () => [{ manifest: { id: "maths" }, official: true }] });
    expect(await fond.pluginsList()).toEqual([{ manifest: { id: "maths" }, official: true }]);
    await expect(fond.catalogueRead()).rejects.toThrow("application");
    await expect(fond.pluginInstall("x", "http://x")).rejects.toThrow("application");
    await expect(fond.pluginInstallFile()).rejects.toThrow("application");
    await expect(fond.pluginUninstall("x")).rejects.toThrow("application");
  });

  it("capacités : aucune ; identifiant « web »", () => {
    const fond = neuf();
    expect(fond.id).toBe("web");
    expect(Object.values(fond.capacites)).toEqual([false, false, false, false, false]);
  });
});

describe("fond web : isolation des mini-apps", () => {
  it("origine opaque seulement quand la sonde confirme le CORS, décidée par pluginsList()", async () => {
    const opaque = neuf({ sonde: async () => true });
    expect(opaque.capacites.isolationComplete).toBe(false);
    await opaque.pluginsList();
    expect(opaque.capacites.isolationComplete).toBe(true);
    const repli = neuf({ sonde: async () => false });
    await repli.pluginsList();
    expect(repli.capacites.isolationComplete).toBe(false);
  });

  it("une sonde qui échoue ne casse pas la liste et laisse le repli", async () => {
    const fond = neuf({ sonde: () => Promise.reject(new Error("x")), plugins: async () => [{ manifest: { id: "a" }, official: true }] });
    expect(await fond.pluginsList()).toHaveLength(1);
    expect(fond.capacites.isolationComplete).toBe(false);
  });
});

describe("fond web : reprise de l'ancien aperçu (localStorage)", () => {
  const ancien = () =>
    ancienStockage({
      "etabli.preview-documents": JSON.stringify([
        { id: "ab12", pluginId: "maths", appId: "pythagore", title: "Ancien", summary: "", created: 1, modified: 2, format: 1, dataVersion: 1, appVersion: "aperçu", data: { a: "3" } },
      ]),
      "etabli.preview-data.plugin.economie": JSON.stringify({ barre: 6000 }),
      "etabli.store": JSON.stringify({ settings: { theme: "clair" } }),
    });

  it("reprend documents, données de plugin et réglages", async () => {
    const fond = neuf({ ancien: ancien() });
    expect((await fond.documentRead("ab12")).data).toEqual({ a: "3" });
    expect(await fond.dataRead("plugin.economie")).toEqual({ barre: 6000 });
    expect(await fond.storeLoad()).toEqual({ settings: { theme: "clair" } });
  });

  it("ne reprend qu'une fois : un calcul supprimé ne revient pas", async () => {
    const idb = new IDBFactory();
    const premier = neuf({ idb, ancien: ancien() });
    await premier.documentDelete("ab12");
    const second = neuf({ idb, ancien: ancien() });
    expect(await second.documentsList()).toEqual([]);
  });

  it("ignore un contenu corrompu", async () => {
    const fond = neuf({ ancien: ancienStockage({ "etabli.preview-documents": "{pas du json", "etabli.store": "oups" }) });
    expect(await fond.documentsList()).toEqual([]);
    expect(await fond.storeLoad()).toEqual({});
  });
});
