// Réglages et onglets ouverts. Dans l'application : fichier settings.json du dossier de
// configuration (cahier des charges, section 7.3). Dans un navigateur : localStorage (même chemin, via le fond).
import { api } from "./api";

const PREFIX = "etabli.";
const SAVE_DELAY = 300;

let cache: Record<string, unknown> = {};
let timer: ReturnType<typeof setTimeout> | undefined;
/**
 * Faux tant que settings.json n'a pas été lu : on n'écrit alors jamais dessus, pour ne pas
 * remplacer les réglages de l'utilisateur par ceux par défaut après une lecture ratée.
 */
let readable = false;

/** À appeler une fois avant de créer l'interface : les réglages sont lus de façon synchrone ensuite. */
export async function initStorage(): Promise<void> {
  try {
    cache = await api.storeLoad();
    readable = true;
  } catch (err) {
    console.error("Réglages illisibles, rien ne sera enregistré :", err);
    cache = {};
  }
  // Premier lancement avec settings.json (ou avec le fond navigateur) : on reprend ce que la version précédente
  // avait mémorisé dans localStorage, clé par clé.
  if (Object.keys(cache).length === 0) {
    for (const key of ["settings", "session"]) {
      const legacy = readLocal(key);
      if (legacy !== undefined) cache[key] = legacy;
    }
  }
  usedBefore = "settings" in cache;
}

let usedBefore = false;

/** Vrai si Établi avait déjà été utilisé sur ce poste avant ce lancement (réglages existants). */
export const wasUsedBefore = (): boolean => usedBefore;

/** Relit settings.json : une autre fenêtre (la principale) a pu le modifier. */
export async function reloadStorage(): Promise<void> {
  try {
    cache = await api.storeLoad();
    readable = true;
  } catch {
    // On garde ce qui était déjà chargé.
  }
}

export function load<T>(key: string, fallback: T): T {
  return key in cache ? (cache[key] as T) : fallback;
}

export function save(key: string, value: unknown): void {
  cache[key] = value;
  if (!readable) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    api.storeSave(cache).catch((err) => console.error("Réglages non enregistrés :", err));
  }, SAVE_DELAY);
}

function readLocal(key: string): unknown {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}
