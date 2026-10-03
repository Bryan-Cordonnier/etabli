// Connexion à un serveur Établi (docs/17) : mémorisée dans le navigateur, lue avant que l'interface démarre
// (le choix du fond en dépend, voir fond/index.ts).
import { ClientApi, ErreurApi } from "./serveur/http";

export interface UtilisateurConnecte {
  id: string;
  nom: string;
  role: "admin" | "utilisateur";
}

export type Connexion =
  | { mode: "local" }
  | { mode: "serveur"; url: string; jeton: string; utilisateur: UtilisateurConnecte; urlPlugins?: string };

type Stockage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const CLE = "etabli.connexion";

function stockageNavigateur(): Stockage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Connexion mémorisée, ou `null` si l'utilisateur n'a encore rien choisi sur cet appareil. */
export function lireConnexion(stockage: Stockage | null = stockageNavigateur()): Connexion | null {
  try {
    const brut = stockage?.getItem(CLE);
    if (!brut) return null;
    const c = JSON.parse(brut) as Partial<Connexion> & Record<string, unknown>;
    if (c.mode === "local") return { mode: "local" };
    if (
      c.mode === "serveur" &&
      typeof c.url === "string" &&
      typeof c.jeton === "string" &&
      c.jeton &&
      typeof c.utilisateur === "object" &&
      c.utilisateur !== null &&
      typeof (c.utilisateur as UtilisateurConnecte).id === "string"
    ) {
      const urlPlugins = typeof c.urlPlugins === "string" && c.urlPlugins ? c.urlPlugins : undefined;
      return { mode: "serveur", url: c.url, jeton: c.jeton, utilisateur: c.utilisateur as UtilisateurConnecte, ...(urlPlugins ? { urlPlugins } : {}) };
    }
  } catch {
    // Contenu illisible : comme si rien n'était mémorisé.
  }
  return null;
}

const CLE_DERNIERE = "etabli.derniere-connexion";

/** Dernier serveur et dernier identifiant utilisés sur cet appareil (jamais le mot de passe ni le jeton), pour préremplir la connexion. */
export function lireDerniere(stockage: Stockage | null = stockageNavigateur()): { url: string; nom: string } | null {
  try {
    const d = JSON.parse(stockage?.getItem(CLE_DERNIERE) ?? "null") as { url?: unknown; nom?: unknown } | null;
    return d && typeof d.url === "string" && typeof d.nom === "string" ? { url: d.url, nom: d.nom } : null;
  } catch {
    return null;
  }
}

export function ecrireConnexion(connexion: Connexion | null, stockage: Stockage | null = stockageNavigateur()): void {
  try {
    if (connexion) stockage?.setItem(CLE, JSON.stringify(connexion));
    else stockage?.removeItem(CLE);
    if (connexion?.mode === "serveur") stockage?.setItem(CLE_DERNIERE, JSON.stringify({ url: connexion.url, nom: connexion.utilisateur.nom }));
  } catch {
    // Stockage indisponible : la connexion ne sera pas retenue d'une ouverture à l'autre.
  }
}

/** HTTP n'est accepté que là où le trafic ne traverse pas Internet ; ailleurs, HTTPS. */
const HOTES_SURS = /^(localhost|127(\.\d{1,3}){3}|\[::1\]|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])(\.\d{1,3}){2}|[^/]+\.(local|ts\.net|lan))$/i;

/**
 * Adresse d'un serveur nettoyée (« https://exemple.fr:4300 »), ou une phrase qui dit quoi corriger.
 * Une adresse vide désigne le serveur qui héberge la page.
 */
export function normaliserAdresse(texte: string): { url: string } | { erreur: string } {
  const brut = texte.trim();
  if (!brut) return { url: "" };
  let adresse: URL;
  try {
    adresse = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(brut) ? brut : `https://${brut}`);
  } catch {
    return { erreur: "Cette adresse n'est pas valide (exemple : https://etabli.exemple.fr)." };
  }
  if (adresse.protocol !== "https:" && adresse.protocol !== "http:") {
    return { erreur: "L'adresse doit commencer par https:// (ou http:// pour une machine de votre réseau)." };
  }
  if (adresse.protocol === "http:" && !HOTES_SURS.test(adresse.host.replace(/:\d+$/, ""))) {
    return { erreur: "Sur Internet, utilisez https:// : sinon votre mot de passe circulerait en clair." };
  }
  return { url: adresse.origin };
}

/** Le serveur est-il là, et est-il déjà installé ? `null` si rien ne répond comme un serveur Établi. */
export async function sonderServeur(
  url: string,
  fetchImpl?: typeof fetch,
): Promise<{ installe: boolean; version: string; urlPlugins?: string } | null> {
  try {
    const etat = await new ClientApi({ base: url, fetch: fetchImpl, delai: 5000 }).requete<{ serveur?: string; installe?: boolean; version?: string; urlPlugins?: string | null }>("GET", "/api/etat");
    if (etat?.serveur !== "etabli") return null;
    return { installe: !!etat.installe, version: etat.version ?? "", ...(typeof etat.urlPlugins === "string" && etat.urlPlugins ? { urlPlugins: etat.urlPlugins } : {}) };
  } catch {
    return null;
  }
}

interface ReponseSession {
  jeton: string;
  utilisateur: { id: string; nom: string; role: string };
}

function versConnexion(url: string, r: ReponseSession, urlPlugins?: string): Connexion {
  return {
    ...(urlPlugins ? { urlPlugins } : {}),
    mode: "serveur",
    url,
    jeton: r.jeton,
    utilisateur: { id: r.utilisateur.id, nom: r.utilisateur.nom, role: r.utilisateur.role === "admin" ? "admin" : "utilisateur" },
  };
}

export async function ouvrirSession(url: string, nom: string, motDePasse: string, fetchImpl?: typeof fetch): Promise<Connexion> {
  const r = await new ClientApi({ base: url, fetch: fetchImpl }).requete<ReponseSession>("POST", "/api/session", { nom, motDePasse });
  return versConnexion(url, r, (await sonderServeur(url, fetchImpl))?.urlPlugins);
}

export async function installerServeur(url: string, code: string, nom: string, motDePasse: string, fetchImpl?: typeof fetch): Promise<Connexion> {
  const r = await new ClientApi({ base: url, fetch: fetchImpl }).requete<ReponseSession>("POST", "/api/installation", { code, nom, motDePasse });
  return versConnexion(url, r, (await sonderServeur(url, fetchImpl))?.urlPlugins);
}

/** Phrase à montrer pour une erreur de connexion. */
export function phraseErreur(e: unknown): string {
  if (e instanceof ErreurApi) return e.message;
  return e instanceof Error ? e.message : String(e);
}
