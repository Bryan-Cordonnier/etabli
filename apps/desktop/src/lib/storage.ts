// Réglages et onglets ouverts. Dans l'application : fichier settings.json du dossier de
// configuration (cahier des charges, section 7.3). Dans un navigateur : localStorage.
import { api, inTauri } from "./api";

const PREFIX = "etabli.";
const SAVE_DELAY = 300;

let cache: Record<string, unknown> = {};
let timer: ReturnType<typeof setTimeout> | undefined;

/** À appeler une fois avant de créer l'interface : les réglages sont lus de façon synchrone ensuite. */
export async function initStorage(): Promise<void> {
  if (!inTauri) return;
  try {
    cache = await api.storeLoad();
  } catch {
    cache = {};
  }
  // Premier lancement avec settings.json : on reprend ce que la version précédente avait mémorisé.
  if (Object.keys(cache).length === 0) {
    for (const key of ["settings", "session"]) {
      const legacy = readLocal(key);
      if (legacy !== undefined) cache[key] = legacy;
    }
  }
}

/** Relit settings.json : une autre fenêtre (la principale) a pu le modifier. */
export async function reloadStorage(): Promise<void> {
  if (!inTauri) return;
  try {
    cache = await api.storeLoad();
  } catch {
    // On garde ce qui était déjà chargé.
  }
}

export function load<T>(key: string, fallback: T): T {
  if (!inTauri) return (readLocal(key) as T | undefined) ?? fallback;
  return key in cache ? (cache[key] as T) : fallback;
}

export function save(key: string, value: unknown): void {
  if (!inTauri) {
    writeLocal(key, value);
    return;
  }
  cache[key] = value;
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

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Stockage indisponible : l'application continue sans mémoriser.
  }
}
