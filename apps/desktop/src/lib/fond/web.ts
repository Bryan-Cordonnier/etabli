// Fond local d'un navigateur (aperçu de développement, version web et mobile) : les calculs, les
// réglages et les données de plugin sont gardés dans IndexedDB, avec les mêmes règles que
// documents.rs, donnees.rs et store.rs. Pas de limite de 5 Mo comme localStorage.
import { modeleOrigines, pluginOrigines, type PluginOrigines } from "../mobile/origines";
import { originePlugin } from "../serveur/fond";
import { pluginsAccessiblesEnOpaque } from "./sondeCors";
import type { Capacites, DocumentFile, DocumentFilter, DocumentInput, DocumentMeta, Fond, PluginInfo } from "./types";

const BASE = "etabli";
const VERSION = 1;
/** Magasins : calculs (clé = id), données de plugin (clé = nom), réglages (une seule entrée) et marqueurs. */
const DOCUMENTS = "documents";
const DONNEES = "donnees";
const REGLAGES = "reglages";
const META = "meta";
const CLE_REGLAGES = "store";

/** Anciennes clés localStorage de l'aperçu navigateur (avant l'ajout d'IndexedDB), reprises une fois. */
const ANCIEN_DOCUMENTS = "etabli.preview-documents";
const ANCIEN_DONNEES = "etabli.preview-data.";
const ANCIEN_REGLAGES = "etabli.store";

/** Le sous-ensemble de `Storage` utile à la reprise ; permet de tester avec un stockage en mémoire. */
export type AncienStockage = Pick<Storage, "getItem" | "key" | "length">;

const attendre = <T>(requete: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error ?? new Error("Erreur IndexedDB"));
  });

const terminer = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Erreur IndexedDB"));
    tx.onabort = () => reject(tx.error ?? new Error("Transaction annulée"));
  });

function ouvrir(idb: IDBFactory, nom: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const requete = idb.open(nom, VERSION);
    requete.onupgradeneeded = () => {
      const db = requete.result;
      db.createObjectStore(DOCUMENTS, { keyPath: "id" });
      db.createObjectStore(DONNEES);
      db.createObjectStore(REGLAGES);
      db.createObjectStore(META);
    };
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error ?? new Error("IndexedDB est indisponible"));
    requete.onblocked = () => reject(new Error("IndexedDB est bloquée par un autre onglet"));
  });
}

export interface OptionsFondWeb {
  idb?: IDBFactory;
  /** Nom de la base (les tests en prennent un différent chacun). */
  nom?: string;
  /** Liste des plugins : par défaut `plugins/index.json` servi avec l'application. */
  plugins?: () => Promise<PluginInfo[]>;
  /** Les plugins sont-ils servis avec CORS (cadre opaque possible) ? Par défaut : sonde dans le navigateur. */
  sonde?: () => Promise<boolean>;
  /** Partie native d'Android (origine par plugin) ; par défaut le plugin Capacitor local, absent hors de l'application Android. */
  natif?: () => Promise<PluginOrigines | undefined>;
  /** Où reprendre les anciennes données de l'aperçu ; null pour ne rien reprendre. */
  ancien?: AncienStockage | null;
}

/** Liste des plugins livrés avec la version web (généré par scripts/construire-web.mjs). */
export async function pluginsDepuisIndex(base: string): Promise<PluginInfo[]> {
  const reponse = await fetch(`${base}/index.json`);
  if (!reponse.ok) throw new Error(`Liste des plugins illisible (${reponse.status})`);
  const liste = (await reponse.json()) as { manifest: unknown; official?: boolean }[];
  return liste.map((p) => ({ manifest: p.manifest, official: p.official ?? true }));
}

export function creerFondWeb(options: OptionsFondWeb = {}): Fond {
  const idb = options.idb ?? indexedDB;
  const nom = options.nom ?? BASE;
  const plugins = options.plugins ?? (() => pluginsDepuisIndex(pluginsBase()));
  const sonde = options.sonde ?? (() => pluginsAccessiblesEnOpaque(pluginsBase()));
  const natif = options.natif ?? pluginOrigines;
  /** Modèle d'adresse des plugins quand la partie native d'Android sert une origine par plugin (voir pluginsList). */
  let modeleNatif: string | undefined;
  const ancien = options.ancien === undefined ? localStorageOuNull() : options.ancien;

  /** Ouverture unique, avec la reprise des anciennes données au tout premier accès. */
  const base: Promise<IDBDatabase> = ouvrir(idb, nom).then(async (db) => {
    await reprendreAncien(db, ancien);
    return db;
  });
  // Évite un « unhandled rejection » si personne n'attend l'ouverture ; les appels, eux, voient l'erreur.
  base.catch(() => {});

  async function lire<T>(magasin: string, cle: IDBValidKey): Promise<T | undefined> {
    const db = await base;
    return attendre<T | undefined>(db.transaction(magasin).objectStore(magasin).get(cle));
  }
  async function ecrire(magasin: string, valeur: unknown, cle?: IDBValidKey): Promise<void> {
    const db = await base;
    const tx = db.transaction(magasin, "readwrite");
    tx.objectStore(magasin).put(valeur, cle);
    await terminer(tx);
  }
  const indisponible = (quoi: string) => (): Promise<never> =>
    Promise.reject(new Error(`${quoi} n'est disponible que dans l'application.`));

  const capacites: Capacites = { catalogue: false, miseAJour: false, fenetresNatives: false, isolationComplete: false, journal: false };

  return {
    id: "web",
    // Isolation complète si la partie native d'Android sert une origine par plugin, ou (origine opaque) si l'hébergement
    // envoie le CORS sous plugins/ ; le choix est fait par pluginsList(), appelée avant tout cadre. Sinon les mini-apps
    // gardent l'origine de l'application (docs/19, §4).
    capacites,
    urlPlugins: pluginsBase(),
    originePlugin: (id: string) => (modeleNatif ? originePlugin(modeleNatif, id) : undefined),

    async exporterTout() {
      const db = await base;
      const lireTout = <T>(magasin: string) => attendre<T[]>(db.transaction(magasin).objectStore(magasin).getAll());
      const cles = await attendre<IDBValidKey[]>(db.transaction(DONNEES).objectStore(DONNEES).getAllKeys());
      const valeurs = await lireTout<unknown>(DONNEES);
      return {
        documents: await lireTout<DocumentFile>(DOCUMENTS),
        donnees: Object.fromEntries(cles.map((cle, i) => [String(cle), valeurs[i]])),
        reglages: (await lire<Record<string, unknown>>(REGLAGES, CLE_REGLAGES)) ?? {},
      };
    },

    async pluginsList() {
      // Android : une origine par plugin, servie par la partie native. Ailleurs (ou si elle ne répond pas) : sonde du CORS.
      modeleNatif = await natif()
        .then((p) => modeleOrigines(p))
        .catch(() => undefined);
      const [liste, opaque] = await Promise.all([plugins(), modeleNatif ? Promise.resolve(true) : sonde().catch(() => false)]);
      capacites.isolationComplete = opaque;
      return liste;
    },
    catalogueRead: indisponible("Le catalogue"),
    pluginInstall: indisponible("L'installation de plugins"),
    pluginInstallFile: indisponible("L'installation de plugins"),
    pluginUninstall: indisponible("La désinstallation de plugins"),
    pluginRevert: indisponible("Le retour à une version précédente"),
    onPluginsChanged: () => Promise.resolve(() => {}),
    onInstallProgress: () => Promise.resolve(() => {}),

    async documentsList({ pluginId, appId, limit }: DocumentFilter = {}): Promise<DocumentMeta[]> {
      const db = await base;
      const tous = await attendre<DocumentFile[]>(db.transaction(DOCUMENTS).objectStore(DOCUMENTS).getAll());
      const metas = tous
        .filter((d) => (!pluginId || d.pluginId === pluginId) && (!appId || d.appId === appId))
        .sort((a, b) => b.modified - a.modified)
        .map(({ id, pluginId, appId, title, summary, created, modified }) => ({
          id,
          pluginId,
          appId,
          title,
          summary,
          created,
          modified,
        }));
      return limit ? metas.slice(0, limit) : metas;
    },

    async documentRead(id: string): Promise<DocumentFile> {
      const doc = await lire<DocumentFile>(DOCUMENTS, id);
      if (!doc) throw new Error("Document introuvable");
      return doc;
    },

    async documentSave(input: DocumentInput): Promise<DocumentMeta> {
      const existant = input.id ? await lire<DocumentFile>(DOCUMENTS, input.id) : undefined;
      const maintenant = Date.now();
      const doc: DocumentFile = {
        ...input,
        id: input.id ?? crypto.randomUUID().replaceAll("-", ""),
        title: input.title.trim(),
        format: 1,
        appVersion: "web",
        created: existant?.created ?? maintenant,
        modified: maintenant,
      };
      await ecrire(DOCUMENTS, doc);
      return doc;
    },

    async documentDelete(id: string): Promise<void> {
      const db = await base;
      const tx = db.transaction(DOCUMENTS, "readwrite");
      tx.objectStore(DOCUMENTS).delete(id);
      await terminer(tx);
    },

    storeLoad: async () => (await lire<Record<string, unknown>>(REGLAGES, CLE_REGLAGES)) ?? {},
    storeSave: (value) => ecrire(REGLAGES, value, CLE_REGLAGES),

    saveFile(file): Promise<string | null> {
      const url = URL.createObjectURL(new Blob([file.content], { type: "application/octet-stream" }));
      const lien = Object.assign(document.createElement("a"), { href: url, download: file.name });
      lien.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return Promise.resolve(file.name);
    },

    dataRead: async (nomDonnee) => (await lire<unknown>(DONNEES, nomDonnee)) ?? null,
    dataWrite: (nomDonnee, valeur) => ecrire(DONNEES, valeur, nomDonnee),
  };
}

function localStorageOuNull(): AncienStockage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Dossier d'où l'application web sert les plugins : le serveur Vite en développement, `plugins/` une fois construite. */
export function pluginsBase(): string {
  return import.meta.env.DEV ? "/__plugins" : `${import.meta.env.BASE_URL}plugins`.replace(/\/{2,}/g, "/");
}

/** Reprend une seule fois les données de l'ancien aperçu (localStorage) ; les anciennes clés ne sont pas effacées. */
async function reprendreAncien(db: IDBDatabase, ancien: AncienStockage | null): Promise<void> {
  if (!ancien) return;
  if (await attendre(db.transaction(META).objectStore(META).get("reprise"))) return;

  const lireJson = (cle: string): unknown => {
    try {
      const brut = ancien.getItem(cle);
      return brut === null ? undefined : JSON.parse(brut);
    } catch {
      return undefined;
    }
  };

  const tx = db.transaction([DOCUMENTS, DONNEES, REGLAGES, META], "readwrite");
  const documents = lireJson(ANCIEN_DOCUMENTS);
  if (Array.isArray(documents)) {
    for (const doc of documents as DocumentFile[]) if (doc && typeof doc.id === "string") tx.objectStore(DOCUMENTS).put(doc);
  }
  for (let i = 0; i < ancien.length; i++) {
    const cle = ancien.key(i);
    if (!cle?.startsWith(ANCIEN_DONNEES)) continue;
    const valeur = lireJson(cle);
    if (valeur !== undefined) tx.objectStore(DONNEES).put(valeur, cle.slice(ANCIEN_DONNEES.length));
  }
  const reglages = lireJson(ANCIEN_REGLAGES);
  if (reglages && typeof reglages === "object") tx.objectStore(REGLAGES).put(reglages, CLE_REGLAGES);
  tx.objectStore(META).put(Date.now(), "reprise");
  await terminer(tx);
}
