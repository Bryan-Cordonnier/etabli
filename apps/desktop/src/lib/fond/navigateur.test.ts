import { describe, expect, it } from "vitest";
import { creerFondNavigateur, type Stockage } from "./navigateur";
import type { DocumentInput } from "./types";

/** Stockage en mémoire, avec une option pour simuler un navigateur qui refuse d'écrire. */
function memoire(refuserEcriture = false): Stockage & { valeurs: Map<string, string> } {
  const valeurs = new Map<string, string>();
  return {
    valeurs,
    getItem: (cle) => valeurs.get(cle) ?? null,
    setItem: (cle, valeur) => {
      if (refuserEcriture) throw new Error("quota dépassé");
      valeurs.set(cle, valeur);
    },
  };
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

describe("fond navigateur : documents", () => {
  it("enregistre, relit et nettoie le titre", async () => {
    const fond = creerFondNavigateur(memoire(), () => []);
    const meta = await fond.documentSave(entree());
    expect(meta.title).toBe("Équerre 50 × 50");
    expect(meta.id).toMatch(/^[0-9a-f]{32}$/);
    const lu = await fond.documentRead(meta.id);
    expect(lu.data).toEqual({ epaisseur: "3" });
    expect(lu.format).toBe(1);
  });

  it("garde la date de création et met à jour la modification", async () => {
    const fond = creerFondNavigateur(memoire(), () => []);
    const a = await fond.documentSave(entree());
    await new Promise((r) => setTimeout(r, 5));
    const b = await fond.documentSave(entree({ id: a.id, title: "Renommé" }));
    expect(b.id).toBe(a.id);
    expect(b.created).toBe(a.created);
    expect(b.modified).toBeGreaterThan(a.modified);
    expect(await fond.documentsList()).toHaveLength(1);
  });

  it("liste du plus récent au plus ancien, avec filtre et limite", async () => {
    const fond = creerFondNavigateur(memoire(), () => []);
    const premier = await fond.documentSave(entree({ title: "A" }));
    await new Promise((r) => setTimeout(r, 5));
    await fond.documentSave(entree({ title: "B", pluginId: "maths", appId: "pythagore" }));
    await new Promise((r) => setTimeout(r, 5));
    const dernier = await fond.documentSave(entree({ title: "C" }));
    expect((await fond.documentsList()).map((d) => d.title)).toEqual(["C", "B", "A"]);
    expect((await fond.documentsList({ pluginId: "tolerie" })).map((d) => d.id)).toEqual([dernier.id, premier.id]);
    expect(await fond.documentsList({ limit: 1 })).toHaveLength(1);
    expect(await fond.documentsList({ appId: "inconnue" })).toEqual([]);
  });

  it("la liste ne contient pas les données du calcul", async () => {
    const fond = creerFondNavigateur(memoire(), () => []);
    await fond.documentSave(entree());
    const [meta] = await fond.documentsList();
    expect(meta).not.toHaveProperty("data");
  });

  it("supprime un document ; relire un document absent échoue", async () => {
    const fond = creerFondNavigateur(memoire(), () => []);
    const { id } = await fond.documentSave(entree());
    await fond.documentDelete(id);
    expect(await fond.documentsList()).toEqual([]);
    await expect(fond.documentRead(id)).rejects.toThrow("Document introuvable");
  });
});

describe("fond navigateur : données, réglages, plugins", () => {
  it("données absentes = null, puis relues telles quelles", async () => {
    const fond = creerFondNavigateur(memoire(), () => []);
    expect(await fond.dataRead("plugin.economie")).toBeNull();
    await fond.dataWrite("plugin.economie", { barre: 6000 });
    expect(await fond.dataRead("plugin.economie")).toEqual({ barre: 6000 });
  });

  it("les réglages (settings, session) font l'aller-retour", async () => {
    const fond = creerFondNavigateur(memoire(), () => []);
    expect(await fond.storeLoad()).toEqual({});
    await fond.storeSave({ settings: { theme: "sombre" }, session: { onglets: [] } });
    expect(await fond.storeLoad()).toEqual({ settings: { theme: "sombre" }, session: { onglets: [] } });
  });

  it("les clés historiques d'aperçu restent lisibles (compatibilité)", async () => {
    const stockage = memoire();
    stockage.setItem("etabli.preview-data.fournisseurs", JSON.stringify({ ok: true }));
    const fond = creerFondNavigateur(stockage, () => []);
    expect(await fond.dataRead("fournisseurs")).toEqual({ ok: true });
  });

  it("un stockage qui refuse d'écrire ne fait pas planter", async () => {
    const fond = creerFondNavigateur(memoire(true), () => []);
    await expect(fond.dataWrite("x", 1)).resolves.toBeUndefined();
    await expect(fond.storeSave({ a: 1 })).resolves.toBeUndefined();
    await fond.documentSave(entree());
    expect(await fond.documentsList()).toEqual([]);
  });

  it("un JSON corrompu est ignoré", async () => {
    const stockage = memoire();
    stockage.setItem("etabli.preview-documents", "{pas du json");
    stockage.setItem("etabli.store", "oups");
    const fond = creerFondNavigateur(stockage, () => []);
    expect(await fond.documentsList()).toEqual([]);
    expect(await fond.storeLoad()).toEqual({});
  });

  it("liste les plugins fournis et refuse le catalogue et l'installation", async () => {
    const fond = creerFondNavigateur(memoire(), () => [{ manifest: { id: "maths" }, official: true }]);
    expect(await fond.pluginsList()).toEqual([{ manifest: { id: "maths" }, official: true }]);
    await expect(fond.catalogueRead()).rejects.toThrow("application");
    await expect(fond.pluginInstall("x", "http://x")).rejects.toThrow("application");
    await expect(fond.pluginInstallFile()).rejects.toThrow("application");
    await expect(fond.pluginUninstall("x")).rejects.toThrow("application");
  });

  it("les capacités du navigateur sont toutes fausses", () => {
    const fond = creerFondNavigateur(memoire(), () => []);
    expect(fond.id).toBe("navigateur");
    expect(Object.values(fond.capacites)).toEqual([false, false, false, false, false]);
  });
});
