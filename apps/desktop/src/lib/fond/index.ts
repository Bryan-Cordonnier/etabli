// Choix du fond au démarrage : fichiers via Rust dans l'application, IndexedDB dans un navigateur, ou le
// serveur Établi (avec cache hors ligne) quand l'utilisateur s'y est connecté (docs/16 et 17).
import { isTauri } from "@tauri-apps/api/core";
import { lireConnexion } from "../connexion";
import { synchro } from "../state/synchro.svelte";
import { avecCache, type FondAvecCache } from "../serveur/cache";
import { creerFondServeur } from "../serveur/fond";
import { ClientApi } from "../serveur/http";
import { fondTauri } from "./tauri";
import type { Fond } from "./types";
import { creerFondWeb } from "./web";

/** Empreinte courte d'un texte, pour nommer la base du cache d'un serveur et d'un compte. */
function empreinte(texte: string): string {
  let h = 5381;
  for (const c of texte) h = (Math.imul(h, 33) ^ c.charCodeAt(0)) >>> 0;
  return h.toString(16);
}

function choisir(): { fond: Fond; client: ClientApi | null } {
  const connexion = lireConnexion();
  if (isTauri()) {
    if (connexion?.mode !== "serveur") return { fond: fondTauri, client: null };
    // Application native reliée au serveur : calculs et données de plugins viennent du serveur (avec copie hors ligne) ;
    // plugins, réglages de l'appareil (clé IA, raccourcis…), fenêtres et fichiers restent locaux.
    const client = new ClientApi({ base: connexion.url, jeton: connexion.jeton });
    const distant = avecCache(creerFondServeur(client), {
      nom: `etabli-cache-${empreinte(`${connexion.url}|${connexion.utilisateur.id}`)}`,
      rapport: synchro.rapport,
    });
    const fond: FondAvecCache = {
      ...fondTauri,
      documentsList: distant.documentsList,
      documentRead: distant.documentRead,
      documentSave: distant.documentSave,
      documentDelete: distant.documentDelete,
      dataRead: distant.dataRead,
      dataWrite: distant.dataWrite,
      synchroniser: distant.synchroniser,
      nomCache: distant.nomCache,
      enAttente: distant.enAttente,
      arreter: distant.arreter,
    };
    return { fond, client };
  }  if (connexion?.mode === "serveur") {
    const client = new ClientApi({ base: connexion.url, jeton: connexion.jeton });
    const fond = avecCache(creerFondServeur(client, connexion.urlPlugins), {
      nom: `etabli-cache-${empreinte(`${connexion.url}|${connexion.utilisateur.id}`)}`,
      rapport: synchro.rapport,
    });
    return { fond, client };
  }
  return { fond: creerFondWeb(), client: null };
}

const choix = choisir();
export const fond: Fond = choix.fond;
/** Client authentifié du serveur (administration, mot de passe, export) ; `null` hors mode serveur. */
export const clientServeur: ClientApi | null = choix.client;
/** Le fond avec son cache, quand on est en mode serveur (bouton « Synchroniser »). */
export const fondServeur: FondAvecCache | null = choix.client ? (choix.fond as FondAvecCache) : null;

export * from "./types";
