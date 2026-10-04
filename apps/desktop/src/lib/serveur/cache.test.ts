import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import type { DocumentFile, DocumentInput, DocumentMeta, Fond, PluginInfo } from "../fond/types";
import { avecCache, type Rapport } from "./cache";
import { ErreurApi, ErreurReseau } from "./http";

/** Faux serveur en mémoire : mêmes règles que le vrai (versions, conflit 409, noms), plus un interrupteur « hors ligne ». */
class FauxServeur {
  enLigne = true;
  /** Refus programmés : la prochaine écriture dont le titre correspond échoue avec ce statut. */
  refus = new Map<string, number>();
  expiree = false;
  porte: Promise<void> | null = null;
  docs = new Map<string, DocumentFile & { version: number }>();
  donnees = new Map<string, unknown>();
  reglages: Record<string, unknown> = {};
  plugins: PluginInfo[] = [{ manifest: { id: "maths" }, official: true }];
  journal: string[] = [];
  suivant = 0;

  private async acces(): Promise<void> {
    if (this.porte) await this.porte;
    if (!this.enLigne) throw new ErreurReseau();
    if (this.expiree) throw new ErreurApi(401, "Connexion requise ou session expirée.");
  }

  fond(): Fond {
    const s = this;
    return {
      id: "serveur",
      capacites: { catalogue: false, miseAJour: false, fenetresNatives: false, isolationComplete: true, journal: false },
      urlPlugins: "/plugins",
      async pluginsList() {
        await s.acces();
        return s.plugins;
      },
      catalogueRead: () => Promise.reject(new Error("non")),
      pluginInstall: () => Promise.reject(new Error("non")),
      pluginInstallFile: () => Promise.reject(new Error("non")),
      pluginUninstall: () => Promise.reject(new Error("non")),
      pluginRevert: () => Promise.reject(new Error("non")),
      onPluginsChanged: () => Promise.resolve(() => {}),
      onInstallProgress: () => Promise.resolve(() => {}),
      async documentsList(f = {}) {
        await s.acces();
        return [...s.docs.values()]
          .filter((d) => (!f.pluginId || d.pluginId === f.pluginId) && (!f.appId || d.appId === f.appId))
          .sort((a, b) => b.modified - a.modified)
          .map((d) => ({ id: d.id, pluginId: d.pluginId, appId: d.appId, title: d.title, summary: d.summary, created: d.created, modified: d.modified, version: d.version }) as DocumentMeta);
      },
      async documentRead(id) {
        await s.acces();
        const d = s.docs.get(id);
        if (!d) throw new ErreurApi(404, "Introuvable.");
        return d;
      },
      async documentSave(e: DocumentInput) {
        await s.acces();
        const refus = s.refus.get(e.title);
        if (refus) {
          s.refus.delete(e.title);
          throw new ErreurApi(refus, `refus ${refus}`);
        }
        const id = e.id ?? `serveur${++s.suivant}`.padEnd(8, "0");
        const existant = s.docs.get(id);
        if (existant && e.versionAttendue !== undefined && e.versionAttendue !== existant.version) {
          throw new ErreurApi(409, "Ce calcul a été modifié ailleurs.", existant.version);
        }
        const t = 1000 + ++s.suivant;
        const doc = {
          format: 1, id, pluginId: e.pluginId, appId: e.appId, dataVersion: e.dataVersion, title: e.title, summary: e.summary,
          created: existant?.created ?? t, modified: t, appVersion: "t", data: e.data, version: (existant?.version ?? 0) + 1,
        };
        s.docs.set(id, doc);
        s.journal.push(`save ${e.title}`);
        return { id, pluginId: doc.pluginId, appId: doc.appId, title: doc.title, summary: doc.summary, created: doc.created, modified: doc.modified, version: doc.version } as DocumentMeta;
      },
      async documentDelete(id) {
        await s.acces();
        if (!s.docs.delete(id)) throw new ErreurApi(404, "Introuvable.");
        s.journal.push(`delete ${id}`);
      },
      async storeLoad() {
        await s.acces();
        return s.reglages;
      },
      async storeSave(v) {
        await s.acces();
        s.reglages = v;
        s.journal.push("reglages");
      },
      saveFile: () => Promise.resolve(null),
      async dataRead(nom) {
        await s.acces();
        return s.donnees.get(nom) ?? null;
      },
      async dataWrite(nom, v) {
        await s.acces();
        s.donnees.set(nom, v);
        s.journal.push(`donnees ${nom}`);
      },
    };
  }
}

function monter(serveur = new FauxServeur(), idb = new IDBFactory(), nom = "cache-test") {
  const messages: string[] = [];
  const etats: string[] = [];
  const attente: number[] = [];
  let expiree = 0;
  const rapport: Partial<Rapport> = {
    etat: (e) => etats.push(e),
    enAttente: (n) => attente.push(n),
    message: (m) => messages.push(m),
    sessionExpiree: () => void expiree++,
  };
  let n = 0;
  const fond = avecCache(serveur.fond(), { idb, nom, rapport, intervalle: 0, nouvelId: () => `local${String(++n).padStart(3, "0")}`.padEnd(8, "0") });
  return { serveur, fond, messages, etats, attente, expiree: () => expiree, idb };
}

const entree = (titre: string, extra: Partial<DocumentInput> = {}): DocumentInput => ({
  pluginId: "tolerie", appId: "ve", dataVersion: 1, title: titre, summary: "", data: { t: titre }, ...extra,
});

describe("cache : lectures hors ligne", () => {
  it("la dernière copie connue sert quand le serveur est injoignable", async () => {
    const t = monter();
    const { id } = await t.fond.documentSave(entree("Équerre"));
    await t.fond.dataWrite("plugin.economie", { barre: 6000 });
    await t.fond.storeSave({ settings: { theme: "sombre" } });
    await t.fond.pluginsList();
    await t.fond.documentsList();

    t.serveur.enLigne = false;
    expect((await t.fond.documentsList()).map((d) => d.title)).toEqual(["Équerre"]);
    expect((await t.fond.documentRead(id)).data).toEqual({ t: "Équerre" });
    expect(await t.fond.dataRead("plugin.economie")).toEqual({ barre: 6000 });
    expect(await t.fond.storeLoad()).toEqual({ settings: { theme: "sombre" } });
    expect(await t.fond.pluginsList()).toEqual(t.serveur.plugins);
    expect(t.etats.at(-1)).toBe("hors-ligne");
  });

  it("un calcul jamais ouvert n'est pas disponible hors ligne, et une donnée absente vaut null", async () => {
    const t = monter();
    t.serveur.enLigne = false;
    await expect(t.fond.documentRead("inconnu00")).rejects.toThrow("hors ligne");
    expect(await t.fond.dataRead("plugin.rien")).toBeNull();
    expect(await t.fond.storeLoad()).toEqual({});
    expect(await t.fond.pluginsList()).toEqual([]);
  });

  it("une suppression faite ailleurs disparaît de la copie locale à la prochaine liste en ligne", async () => {
    const t = monter();
    const a = await t.fond.documentSave(entree("A"));
    await t.fond.documentSave(entree("B"));
    t.serveur.docs.delete(a.id);
    expect((await t.fond.documentsList()).map((d) => d.title)).toEqual(["B"]);
    t.serveur.enLigne = false;
    expect((await t.fond.documentsList()).map((d) => d.title)).toEqual(["B"]);
  });

  it("deux comptes ne partagent jamais leur copie locale", async () => {
    const idb = new IDBFactory();
    const alice = monter(new FauxServeur(), idb, "cache-alice");
    await alice.fond.documentSave(entree("Secret d'Alice"));
    const bob = monter(new FauxServeur(), idb, "cache-bob");
    bob.serveur.enLigne = false;
    expect(await bob.fond.documentsList()).toEqual([]);
  });
});

describe("cache : écritures hors ligne", () => {
  it("un calcul créé hors ligne est visible tout de suite, puis envoyé au retour du serveur", async () => {
    const t = monter();
    t.serveur.enLigne = false;
    const meta = await t.fond.documentSave(entree("Créé dans le train"));
    expect(meta.id).toMatch(/^local/);
    expect((await t.fond.documentsList()).map((d) => d.title)).toEqual(["Créé dans le train"]);
    expect((await t.fond.documentRead(meta.id)).data).toEqual({ t: "Créé dans le train" });
    expect(await t.fond.enAttente()).toBe(1);
    expect(t.serveur.docs.size).toBe(0);

    t.serveur.enLigne = true;
    await t.fond.synchroniser();
    expect(await t.fond.enAttente()).toBe(0);
    expect(t.serveur.docs.get(meta.id)?.title).toBe("Créé dans le train");
    expect(t.attente.at(-1)).toBe(0);
    expect(t.etats.at(-1)).toBe("en-ligne");
  });

  it("plusieurs enregistrements du même calcul = une seule écriture envoyée, la dernière", async () => {
    const t = monter();
    const { id } = await t.fond.documentSave(entree("V1"));
    t.serveur.enLigne = false;
    await t.fond.documentSave(entree("V2", { id }));
    await t.fond.documentSave(entree("V3", { id }));
    await t.fond.documentSave(entree("V4", { id }));
    await t.fond.synchroniser(); // hors ligne : l'essai échoue, la file reste
    expect(await t.fond.enAttente()).toBe(1);
    t.serveur.enLigne = true;
    t.serveur.journal.length = 0;
    await t.fond.synchroniser();
    expect(t.serveur.journal).toEqual(["save V4"]);
    expect(t.serveur.docs.get(id)?.version).toBe(2);
    expect(t.serveur.docs.get(id)?.data).toEqual({ t: "V4" });
  });

  it("l'ordre des écritures est respecté, même celles faites quand le serveur est revenu", async () => {
    const t = monter();
    t.serveur.enLigne = false;
    await t.fond.documentSave(entree("A"));
    await t.fond.dataWrite("plugin.x", 1);
    await t.fond.storeSave({ a: 1 });
    t.serveur.enLigne = true;
    // Le serveur est revenu mais la file n'est pas encore vidée : la nouvelle écriture passe derrière les autres.
    await t.fond.documentSave(entree("B"));
    await t.fond.synchroniser();
    expect(t.serveur.journal).toEqual(["save A", "donnees plugin.x", "reglages", "save B"]);
    expect(await t.fond.enAttente()).toBe(0);
  });

  it("les données et réglages en attente sont relus tels quels, sans passer par le serveur", async () => {
    const t = monter();
    t.serveur.enLigne = false;
    await t.fond.dataWrite("plugin.x", { v: 2 });
    await t.fond.storeSave({ settings: { taille: 110 } });
    t.serveur.enLigne = true;
    t.serveur.donnees.set("plugin.x", { v: 1 });
    expect(await t.fond.dataRead("plugin.x")).toEqual({ v: 2 });
    expect(await t.fond.storeLoad()).toEqual({ settings: { taille: 110 } });
  });

  it("suppression hors ligne : le calcul disparaît de la liste, puis du serveur", async () => {
    const t = monter();
    const a = await t.fond.documentSave(entree("A"));
    await t.fond.documentSave(entree("B"));
    t.serveur.enLigne = false;
    await t.fond.documentDelete(a.id);
    expect((await t.fond.documentsList()).map((d) => d.title)).toEqual(["B"]);
    t.serveur.enLigne = true;
    await t.fond.synchroniser();
    expect(t.serveur.docs.has(a.id)).toBe(false);
    expect(await t.fond.enAttente()).toBe(0);
  });

  it("supprimer un calcul déjà supprimé ailleurs n'est pas une erreur", async () => {
    const t = monter();
    const a = await t.fond.documentSave(entree("A"));
    t.serveur.enLigne = false;
    await t.fond.documentDelete(a.id);
    t.serveur.docs.delete(a.id);
    t.serveur.enLigne = true;
    await t.fond.synchroniser();
    expect(await t.fond.enAttente()).toBe(0);
    expect(t.messages).toEqual([]);
  });

  it("les écritures en attente survivent à la fermeture et sont rejouées au démarrage suivant", async () => {
    const idb = new IDBFactory();
    const premier = monter(new FauxServeur(), idb);
    premier.serveur.enLigne = false;
    await premier.fond.documentSave(entree("Oublié dans l'onglet"));
    premier.fond.arreter();

    const serveur = premier.serveur;
    serveur.enLigne = true;
    const second = monter(serveur, idb);
    await new Promise((r) => setTimeout(r, 50));
    await second.fond.synchroniser();
    expect([...serveur.docs.values()].map((d) => d.title)).toEqual(["Oublié dans l'onglet"]);
  });
});

describe("cache : conflits et refus", () => {
  it("modifié ailleurs pendant qu'on était hors ligne : le serveur garde sa version, la nôtre devient une copie", async () => {
    const t = monter();
    const { id } = await t.fond.documentSave(entree("Plan"));
    t.serveur.enLigne = false;
    await t.fond.documentSave(entree("Plan modifié ici", { id }));
    // Pendant ce temps, un autre appareil enregistre une nouvelle version.
    t.serveur.enLigne = true;
    await t.serveur.fond().documentSave(entree("Plan modifié là-bas", { id }));
    await t.fond.synchroniser();

    expect(t.serveur.docs.get(id)?.title).toBe("Plan modifié là-bas");
    const titres = [...t.serveur.docs.values()].map((d) => d.title).sort();
    expect(titres).toEqual(["Plan modifié ici (copie hors ligne)", "Plan modifié là-bas"]);
    expect(t.messages.join(" ")).toContain("gardée à part");
    expect(await t.fond.enAttente()).toBe(0);
    // La copie locale du calcul d'origine reflète désormais le serveur.
    t.serveur.enLigne = false;
    expect((await t.fond.documentRead(id)).title).toBe("Plan modifié là-bas");
    expect((await t.fond.documentsList()).map((d) => d.title).sort()).toEqual(["Plan modifié ici (copie hors ligne)", "Plan modifié là-bas"]);
  });

  it("conflit en ligne (autre appareil plus récent) : même règle, rien n'est perdu", async () => {
    const t = monter();
    const { id } = await t.fond.documentSave(entree("Plan"));
    await t.serveur.fond().documentSave(entree("Version de l'autre appareil", { id }));
    const meta = await t.fond.documentSave(entree("Ma version", { id }));
    expect(meta.title).toBe("Ma version (copie hors ligne)");
    expect(t.serveur.docs.get(id)?.title).toBe("Version de l'autre appareil");
    expect(t.serveur.docs.get(meta.id)?.data).toEqual({ t: "Ma version" });
    expect(t.messages).toHaveLength(1);
  });

  it("un refus du serveur (4xx) écarte l'écriture sans bloquer les suivantes", async () => {
    const t = monter();
    t.serveur.enLigne = false;
    await t.fond.documentSave(entree("Trop gros"));
    await t.fond.documentSave(entree("Correct"));
    t.serveur.refus.set("Trop gros", 400);
    t.serveur.enLigne = true;
    await t.fond.synchroniser();
    expect([...t.serveur.docs.values()].map((d) => d.title)).toEqual(["Correct"]);
    expect(await t.fond.enAttente()).toBe(0);
    expect(t.messages[0]).toContain("refusée par le serveur");
  });

  it("session expirée : la file est gardée intacte et l'interface est prévenue", async () => {
    const t = monter();
    t.serveur.enLigne = false;
    await t.fond.documentSave(entree("A"));
    await t.fond.documentSave(entree("B"));
    t.serveur.enLigne = true;
    t.serveur.expiree = true;
    await t.fond.synchroniser();
    expect(t.expiree()).toBeGreaterThan(0);
    expect(await t.fond.enAttente()).toBe(2);
    // Reconnexion : tout part.
    t.serveur.expiree = false;
    await t.fond.synchroniser();
    expect(await t.fond.enAttente()).toBe(0);
    expect(t.serveur.docs.size).toBe(2);
  });

  it("session expirée pendant une écriture en ligne : l'erreur remonte, rien n'est perdu en silence", async () => {
    const t = monter();
    t.serveur.expiree = true;
    await expect(t.fond.documentSave(entree("A"))).rejects.toMatchObject({ statut: 401 });
    expect(t.expiree()).toBe(1);
  });
});

describe("cache : écriture remplacée pendant l'envoi", () => {
  it("la modification faite pendant l'envoi n'est pas perdue et ne provoque pas de faux conflit", async () => {
    const t = monter();
    const { id } = await t.fond.documentSave(entree("V1"));
    t.serveur.enLigne = false;
    await t.fond.documentSave(entree("V2", { id }));
    expect(await t.fond.enAttente()).toBe(1);

    // Le serveur revient, mais l'envoi de V2 est retenu à la porte…
    t.serveur.enLigne = true;
    let ouvrir!: () => void;
    t.serveur.porte = new Promise<void>((r) => (ouvrir = r));
    const envoi = t.fond.synchroniser();
    await new Promise((r) => setTimeout(r, 20));
    // …l'utilisateur modifie encore : V3 remplace V2 dans la file pendant l'envoi.
    const pendant = t.fond.documentSave(entree("V3", { id }));
    await new Promise((r) => setTimeout(r, 20));
    t.serveur.porte = null;
    ouvrir();
    await Promise.all([envoi, pendant]);
    await t.fond.synchroniser();

    expect(t.serveur.docs.get(id)?.title).toBe("V3");
    expect([...t.serveur.docs.values()].map((d) => d.title)).toEqual(["V3"]);
    expect(t.messages).toEqual([]);
    expect(await t.fond.enAttente()).toBe(0);
  });
});
