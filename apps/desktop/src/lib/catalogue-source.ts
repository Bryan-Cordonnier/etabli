// Source du catalogue de plugins (docs/20, section 3.2 et 3.3) : la source officielle par défaut, ou le registre d'un atelier
// avec sa clé publique. Les mêmes règles sont refaites côté Rust (`crates/noyau/src/source.rs`), qui fait foi : ici, seulement
// un retour immédiat dans les Paramètres.

/** Catalogue officiel (valeur par défaut, affichée en indication : le moteur la connaît déjà). */
export const OFFICIAL_CATALOGUE_URL = "https://github.com/Bryan-Cordonnier/etabli/releases/download/catalogue/catalogue.json";

/** Canaux (docs/20 §3.3). Seul « stable » est publié ; « beta » est réservé, le moteur le refuse encore. */
export const CHANNELS = ["stable", "beta"] as const;
export type Channel = (typeof CHANNELS)[number];
export const DEFAULT_CHANNEL: Channel = "stable";

/** Source personnalisée : adresse du catalogue et clé publique (contenu du fichier .pub). Adresse vide : source officielle. */
export interface CatalogueSource {
  url: string;
  key: string;
}

export const OFFICIAL_SOURCE: CatalogueSource = { url: "", key: "" };

/** Même contenu que `pubkey` de tauri.conf.json : le base64 de « untrusted comment: … » puis la clé sur deux lignes. */
function looksLikePublicKey(key: string): boolean {
  try {
    const text = atob(key.trim());
    return text.startsWith("untrusted comment:") && text.trim().split("\n").length === 2;
  } catch {
    return false;
  }
}

/** Message à afficher si la source est inutilisable, `null` si elle est correcte (ou si c'est la source officielle). */
export function sourceError(source: CatalogueSource): string | null {
  const url = source.url.trim();
  if (!url) return null;
  if (url.length > 2048 || !url.startsWith("https://") || /[\s?#]/.test(url) || /[\u0000-\u001f]/.test(url)) {
    return "L'adresse doit commencer par https:// et ne contenir ni espace, ni ? ni #.";
  }
  const path = url.slice("https://".length);
  const slash = path.indexOf("/");
  if (slash <= 0 || path.slice(0, slash).includes("@")) return "Adresse invalide : nom d'hôte ou chemin manquant.";
  const file = path.slice(slash + 1);
  if (!file.endsWith(".json") || file.split("/").includes("..")) return "L'adresse doit désigner un fichier .json.";
  if (!looksLikePublicKey(source.key)) return "Clé publique illisible : collez tout le contenu du fichier .pub de la source.";
  return null;
}

/** Ce qu'on envoie au moteur : `null` pour la source officielle. Une source incorrecte retombe sur l'officielle, jamais sur autre chose. */
export function activeSource(source: CatalogueSource): CatalogueSource | null {
  if (!source.url.trim() || sourceError(source)) return null;
  return { url: source.url.trim(), key: source.key.trim() };
}

/** Normalise ce qui a été lu des réglages enregistrés (ancienne version : champ absent). */
export function readSource(raw: unknown): CatalogueSource {
  const o = (raw ?? {}) as Partial<CatalogueSource>;
  return { url: typeof o.url === "string" ? o.url : "", key: typeof o.key === "string" ? o.key : "" };
}

export function readChannel(raw: unknown): Channel {
  return CHANNELS.find((c) => c === raw) ?? DEFAULT_CHANNEL;
}
