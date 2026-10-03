// Cache hors ligne et file d'écritures autour d'un fond serveur (docs/16, §3.3).
//
// * Lectures : le serveur d'abord ; s'il est injoignable, la dernière copie connue (IndexedDB).
// * Écritures : envoyées au serveur ; s'il est injoignable, gardées dans une file et appliquées tout de
//   suite à la copie locale, puis rejouées dans l'ordre à la reconnexion. Tant que la file n'est pas vide,
//   toute nouvelle écriture y passe aussi : l'ordre est toujours respecté.
// * Conflit (409) : le serveur garde sa version ; la version écrite hors ligne est enregistrée comme un
//   NOUVEAU calcul « (copie hors ligne) ». Rien n'est jamais écrasé ni perdu en silence.
// * Le serveur est la source de vérité ; ce cache n'est qu'une copie de secours.
import type { DocumentFile, DocumentFilter, DocumentInput, DocumentMeta, Fond } from "../fond/types";
import { ErreurApi, estHorsLigne } from "./http";

const VERSION_BASE = 1;
const METAS = "metas";
const DOCS = "docs";
const KV = "kv";
const SORTIE = "sortie";

/** Ce que le cache signale à l'interface (voir state/synchro.svelte.ts). */
export interface Rapport {
  etat(etat: "en-ligne" | "hors-ligne" | "synchronisation"): void;
  enAttente(nombre: number): void;
  /** Phrase à montrer à l'utilisateur (conflit résolu, écriture refusée…). */
  message(texte: string): void;
  sessionExpiree(): void;
}

/** `ordre` : place dans la file (gardée quand une écriture en remplace une autre) ; `rev` : change à chaque remplacement. */
type Operation =
  | { cle: string; ordre: number; rev: string; type: "doc"; entree: DocumentInput }
  | { cle: string; ordre: number; rev: string; type: "suppr"; id: string }
  | { cle: string; ordre: number; rev: string; type: "donnees"; nom: string; valeur: unknown }
  | { cle: string; ordre: number; rev: string; type: "reglages"; valeur: Record<string, unknown> };
type NouvelleOperation = Operation extends infer O ? (O extends Operation ? Omit<O, "ordre" | "rev"> : never) : never;

type MetaCache = DocumentMeta & { version?: number };
type DocCache = DocumentFile & { version?: number };

export interface OptionsCache {
  idb?: IDBFactory;
  /** Nom de la base : propre à un serveur et à un utilisateur, pour ne jamais mélanger deux comptes. */
  nom: string;
  rapport?: Partial<Rapport>;
  /** Délai entre deux essais de reconnexion tant que la file n'est pas vide (ms). */
  intervalle?: number;
  maintenant?: () => number;
  nouvelId?: () => string;
}

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
    const requete = idb.open(nom, VERSION_BASE);
    requete.onupgradeneeded = () => {
      const db = requete.result;
      db.createObjectStore(METAS, { keyPath: "id" });
      db.createObjectStore(DOCS, { keyPath: "id" });
      db.createObjectStore(KV);
      db.createObjectStore(SORTIE, { keyPath: "cle" });
    };
    requete.onsuccess = () => resolve(requete.result);
    requete.onerror = () => reject(requete.error ?? new Error("IndexedDB est indisponible"));
  });
}

export interface FondAvecCache extends Fond {
  /** Nom de la base IndexedDB du cache (supprimée à la déconnexion). */
  readonly nomCache: string;
  /** Rejoue la file maintenant (bouton « Synchroniser », retour du réseau). */
  synchroniser(): Promise<void>;
  /** Nombre d'écritures en attente. */
  enAttente(): Promise<number>;
  /** Arrête les minuteurs (tests). */
  arreter(): void;
}

export function avecCache(brut: Fond, options: OptionsCache): FondAvecCache {
  const idb = options.idb ?? indexedDB;
  const rapport = options.rapport ?? {};
  const maintenant = options.maintenant ?? Date.now;
  const nouvelId = options.nouvelId ?? (() => crypto.randomUUID().replaceAll("-", ""));
  const intervalle = options.intervalle ?? 30_000;
  const base = ouvrir(idb, options.nom);
  base.catch(() => {});

  let dernierOrdre = 0;
  let compteurRev = 0;
  let vidage: Promise<void> | null = null;
  let relancer = false;
  let minuteur: ReturnType<typeof setInterval> | undefined;

  const lire = async <T>(magasin: string, cle: IDBValidKey): Promise<T | undefined> =>
    attendre<T | undefined>((await base).transaction(magasin).objectStore(magasin).get(cle));
  const toutLire = async <T>(magasin: string): Promise<T[]> =>
    attendre<T[]>((await base).transaction(magasin).objectStore(magasin).getAll());
  const ecrire = async (magasin: string, valeur: unknown, cle?: IDBValidKey): Promise<void> => {
    const tx = (await base).transaction(magasin, "readwrite");
    tx.objectStore(magasin).put(valeur, cle);
    await terminer(tx);
  };
  const supprimer = async (magasin: string, cle: IDBValidKey): Promise<void> => {
    const tx = (await base).transaction(magasin, "readwrite");
    tx.objectStore(magasin).delete(cle);
    await terminer(tx);
  };
  const file = async (): Promise<Operation[]> => (await toutLire<Operation>(SORTIE)).sort((a, b) => a.ordre - b.ordre);

  const signalerAttente = async () => rapport.enAttente?.((await file()).length);

  /** Met une écriture dans la file ; une écriture plus récente sur la même cible remplace l'ancienne. */
  async function mettreEnFile(op: NouvelleOperation): Promise<void> {
    const existante = await lire<Operation>(SORTIE, op.cle);
    // Le numéro d'ordre de la première écriture est gardé : remplacer ne fait pas passer devant les autres.
    dernierOrdre = Math.max(dernierOrdre, ...(await file()).map((o) => o.ordre)) + (existante ? 0 : 1);
    await ecrire(SORTIE, { ...op, ordre: existante?.ordre ?? dernierOrdre, rev: `${maintenant()}-${++compteurRev}` } as Operation);
    await signalerAttente();
    demarrerMinuteur();
  }

  function demarrerMinuteur(): void {
    if (minuteur || intervalle <= 0) return;
    minuteur = setInterval(() => void synchroniser(), intervalle);
  }
  function arreterMinuteur(): void {
    if (minuteur) clearInterval(minuteur);
    minuteur = undefined;
  }

  const metaDe = (d: DocumentFile): MetaCache => ({
    id: d.id,
    pluginId: d.pluginId,
    appId: d.appId,
    title: d.title,
    summary: d.summary,
    created: d.created,
    modified: d.modified,
  });

  /** Copie locale d'un calcul écrit hors ligne : même forme que celle du serveur. */
  async function appliquerLocalement(entree: DocumentInput): Promise<DocumentMeta> {
    const id = entree.id ?? nouvelId();
    const ancien = await lire<DocCache>(DOCS, id);
    const t = maintenant();
    const doc: DocCache = {
      format: 1,
      id,
      pluginId: entree.pluginId,
      appId: entree.appId,
      dataVersion: entree.dataVersion,
      title: entree.title.trim(),
      summary: entree.summary,
      created: ancien?.created ?? t,
      modified: t,
      appVersion: "hors ligne",
      data: entree.data,
      version: ancien?.version,
    };
    await ecrire(DOCS, doc);
    await ecrire(METAS, { ...metaDe(doc), version: doc.version });
    return metaDe(doc);
  }

  // ——— Réseau ———

  function enLigne(): void {
    rapport.etat?.("en-ligne");
  }
  function horsLigne(): void {
    rapport.etat?.("hors-ligne");
  }

  /** Essaie une opération sur le serveur ; `undefined` si le serveur est injoignable. */
  async function essai<T>(travail: () => Promise<T>): Promise<{ valeur: T } | undefined> {
    try {
      const valeur = await travail();
      enLigne();
      return { valeur };
    } catch (e) {
      if (estHorsLigne(e)) {
        horsLigne();
        return undefined;
      }
      if (e instanceof ErreurApi && e.statut === 401) rapport.sessionExpiree?.();
      throw e;
    }
  }

  /**
   * Conflit (409) : le calcul a changé ailleurs. Le serveur garde sa version ; la nôtre est enregistrée comme
   * un nouveau calcul « (copie hors ligne) » et la copie locale du calcul d'origine est rafraîchie.
   */
  async function resoudreConflit(entree: DocumentInput): Promise<DocumentMeta> {
    const copie = (await brut.documentSave({
      ...entree,
      id: nouvelId(),
      versionAttendue: undefined,
      title: `${entree.title} (copie hors ligne)`.slice(0, 200),
    })) as MetaCache;
    rapport.message?.(
      `« ${entree.title} » a été modifié ailleurs : votre version est gardée à part sous « ${copie.title} ».`,
    );
    const id = entree.id ?? "";
    const serveur = (await brut.documentRead(id).catch(() => null)) as DocCache | null;
    if (serveur) {
      await ecrire(DOCS, serveur);
      await ecrire(METAS, { ...metaDe(serveur), version: serveur.version });
    } else {
      await supprimer(DOCS, id);
      await supprimer(METAS, id);
    }
    await ecrire(METAS, copie);
    return copie;
  }

  async function rejouer(op: Operation): Promise<{ versionDoc?: number }> {
    switch (op.type) {
      case "doc": {
        try {
          const meta = (await brut.documentSave(op.entree)) as MetaCache;
          // Le serveur a répondu : on retient la version qu'il vient d'attribuer.
          const doc = await lire<DocCache>(DOCS, meta.id);
          if (doc) {
            doc.version = meta.version;
            await ecrire(DOCS, doc);
          }
          await ecrire(METAS, meta);
          return { versionDoc: meta.version };
        } catch (e) {
          if (e instanceof ErreurApi && e.statut === 409) await resoudreConflit(op.entree);
          else throw e;
        }
        break;
      }
      case "suppr":
        try {
          await brut.documentDelete(op.id);
        } catch (e) {
          if (!(e instanceof ErreurApi && e.statut === 404)) throw e; // déjà supprimé ailleurs : c'est le but
        }
        break;
      case "donnees":
        await brut.dataWrite(op.nom, op.valeur);
        break;
      case "reglages":
        await brut.storeSave(op.valeur);
        break;
    }
    return {};
  }

  /**
   * Retire l'écriture de la file une fois envoyée — sauf si une écriture plus récente l'a remplacée pendant
   * l'envoi : celle-là reste, et elle part de la version que nous venons d'écrire (pas de faux conflit).
   */
  async function retirerSiInchangee(op: Operation, versionDoc?: number): Promise<void> {
    const actuelle = await lire<Operation>(SORTIE, op.cle);
    if (!actuelle || actuelle.rev === op.rev) {
      await supprimer(SORTIE, op.cle);
    } else if (actuelle.type === "doc" && versionDoc !== undefined) {
      await ecrire(SORTIE, { ...actuelle, entree: { ...actuelle.entree, versionAttendue: versionDoc } });
    }
  }

  /** Rejoue la file dans l'ordre. S'arrête au premier « injoignable » ; écarte une écriture refusée (4xx). */
  async function vider(): Promise<void> {
    for (const op of await file()) {
      try {
        const { versionDoc } = await rejouer(op);
        await retirerSiInchangee(op, versionDoc);
        enLigne();
      } catch (e) {
        if (estHorsLigne(e)) {
          horsLigne();
          break;
        }
        if (e instanceof ErreurApi && e.statut === 401) {
          rapport.sessionExpiree?.();
          break;
        }
        // Refus du serveur (données invalides, trop volumineux, droits) : rejouer ne changerait rien, et une
        // écriture bloquée empêcherait toutes les suivantes. On l'écarte en le disant.
        const raison = e instanceof Error ? e.message : String(e);
        rapport.message?.(`Une modification faite hors ligne a été refusée par le serveur : ${raison}`);
        await retirerSiInchangee(op);
      }
    }
    await signalerAttente();
    if ((await file()).length === 0) arreterMinuteur();
  }

  /**
   * Rejoue la file. Si un envoi est déjà en cours, on demande un passage de plus à sa fin : une écriture ajoutée
   * après qu'il a lu la file (ou un serveur revenu entre-temps) ne doit pas attendre le prochain déclencheur.
   */
  function synchroniser(): Promise<void> {
    if (vidage) {
      relancer = true;
      return vidage;
    }
    rapport.etat?.("synchronisation");
    vidage = (async () => {
      try {
        do {
          relancer = false;
          await vider();
        } while (relancer);
      } catch {
        /* chaque opération gère ses erreurs ; ce qui reste dans la file sera repris au prochain passage */
      } finally {
        vidage = null;
      }
    })();
    return vidage;
  }

  /** Écrit au serveur si la file est vide ; sinon, ou s'il est injoignable, passe par la file. */
  async function ecrireOuMettreEnFile<T>(
    envoyer: () => Promise<T>,
    op: NouvelleOperation,
    localement: () => Promise<T>,
  ): Promise<T> {
    if ((await file()).length === 0) {
      const reponse = await essai(envoyer);
      if (reponse) return reponse.valeur;
    }
    await mettreEnFile(op);
    const resultat = await localement();
    void synchroniser();
    return resultat;
  }

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void synchroniser());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void synchroniser();
    });
  }
  // Au démarrage : s'il reste des écritures d'une session précédente, on les rejoue.
  void (async () => {
    try {
      await signalerAttente();
      if ((await file()).length > 0) {
        demarrerMinuteur();
        void synchroniser();
      }
    } catch {
      /* base du cache indisponible : le fond fonctionne sans cache */
    }
  })();

  return {
    ...brut,
    id: "serveur",
    nomCache: options.nom,
    synchroniser,
    enAttente: async () => (await file()).length,
    arreter: arreterMinuteur,

    async pluginsList() {
      const r = await essai(() => brut.pluginsList());
      if (r) {
        await ecrire(KV, r.valeur, "plugins");
        return r.valeur;
      }
      return (await lire<Awaited<ReturnType<Fond["pluginsList"]>>>(KV, "plugins")) ?? [];
    },

    async documentsList(filtre: DocumentFilter = {}) {
      const r = await essai(() => brut.documentsList(filtre));
      const filtres = (m: MetaCache) => (!filtre.pluginId || m.pluginId === filtre.pluginId) && (!filtre.appId || m.appId === filtre.appId);
      const enFile = await file();
      const enAttente = new Set(enFile.filter((o) => o.type === "doc" || o.type === "suppr").map((o) => (o.type === "doc" ? o.entree.id : o.id)));
      if (r) {
        const recus = r.valeur as MetaCache[];
        // Réponse complète (sans limite) : ce qui n'y figure plus a été supprimé ailleurs.
        if (!filtre.limit) {
          for (const m of await toutLire<MetaCache>(METAS)) {
            if (filtres(m) && !recus.some((x) => x.id === m.id) && !enAttente.has(m.id)) await supprimer(METAS, m.id);
          }
        }
        for (const m of recus) if (!enAttente.has(m.id)) await ecrire(METAS, m);
        if (enAttente.size === 0) return recus;
      }
      // Hors ligne, ou écritures encore en file : liste locale, qui contient les écritures en attente.
      const supprimes = new Set(enFile.filter((o) => o.type === "suppr").map((o) => (o as { id: string }).id));
      const locaux = (await toutLire<MetaCache>(METAS))
        .filter((m) => filtres(m) && !supprimes.has(m.id))
        .sort((a, b) => b.modified - a.modified);
      return filtre.limit ? locaux.slice(0, filtre.limit) : locaux;
    },

    async documentRead(id) {
      const r = await essai(() => brut.documentRead(id));
      if (r) {
        await ecrire(DOCS, r.valeur);
        return r.valeur;
      }
      const doc = await lire<DocCache>(DOCS, id);
      if (!doc) throw new Error("Ce calcul n'est pas disponible hors ligne.");
      return doc;
    },

    async documentSave(saisie) {
      // L'identifiant est choisi ici : un calcul créé hors ligne a déjà sa place dans la file et dans la liste.
      const entree: DocumentInput = { ...saisie, id: saisie.id ?? nouvelId() };
      // Version lue la dernière fois : le serveur refusera (409) si le calcul a changé ailleurs depuis.
      const connu = await lire<DocCache>(DOCS, entree.id ?? "");
      const avecVersion: DocumentInput = { ...entree, versionAttendue: entree.versionAttendue ?? connu?.version };
      return ecrireOuMettreEnFile<DocumentMeta>(
        async () => {
          try {
            const m = (await brut.documentSave(avecVersion)) as MetaCache;
            await ecrire(DOCS, await construireLocal(m, entree));
            await ecrire(METAS, m);
            return m;
          } catch (e) {
            if (e instanceof ErreurApi && e.statut === 409) return resoudreConflit(avecVersion);
            throw e;
          }
        },
        { cle: `doc:${entree.id}`, type: "doc", entree: avecVersion },
        () => appliquerLocalement(avecVersion),
      );
    },

    async documentDelete(id) {
      await ecrireOuMettreEnFile<void>(
        async () => {
          await brut.documentDelete(id);
          await supprimer(DOCS, id);
          await supprimer(METAS, id);
        },
        { cle: `doc:${id}`, type: "suppr", id },
        async () => {
          await supprimer(DOCS, id);
          await supprimer(METAS, id);
        },
      );
    },

    async storeLoad() {
      const enFile = (await file()).find((o) => o.type === "reglages");
      if (enFile && enFile.type === "reglages") return enFile.valeur;
      const r = await essai(() => brut.storeLoad());
      if (r) {
        await ecrire(KV, r.valeur, "reglages");
        return r.valeur;
      }
      return (await lire<Record<string, unknown>>(KV, "reglages")) ?? {};
    },

    async storeSave(valeur) {
      await ecrireOuMettreEnFile<void>(
        async () => {
          await brut.storeSave(valeur);
          await ecrire(KV, valeur, "reglages");
        },
        { cle: "reglages", type: "reglages", valeur },
        async () => ecrire(KV, valeur, "reglages"),
      );
    },

    async dataRead(nom) {
      const enFile = (await file()).find((o) => o.type === "donnees" && o.nom === nom);
      if (enFile && enFile.type === "donnees") return enFile.valeur;
      const r = await essai(() => brut.dataRead(nom));
      if (r) {
        await ecrire(KV, r.valeur, `donnees:${nom}`);
        return r.valeur;
      }
      return (await lire<unknown>(KV, `donnees:${nom}`)) ?? null;
    },

    async dataWrite(nom, valeur) {
      await ecrireOuMettreEnFile<void>(
        async () => {
          await brut.dataWrite(nom, valeur);
          await ecrire(KV, valeur, `donnees:${nom}`);
        },
        { cle: `donnees:${nom}`, type: "donnees", nom, valeur },
        async () => ecrire(KV, valeur, `donnees:${nom}`),
      );
    },
  };

  /** Après une écriture réussie : le calcul tel que le serveur le connaît (ses dates, sa version). */
  async function construireLocal(meta: MetaCache, entree: DocumentInput): Promise<DocCache> {
    return {
      format: 1,
      id: meta.id,
      pluginId: entree.pluginId,
      appId: entree.appId,
      dataVersion: entree.dataVersion,
      title: meta.title,
      summary: meta.summary,
      created: meta.created,
      modified: meta.modified,
      appVersion: "serveur",
      data: entree.data,
      version: meta.version,
    };
  }
}
