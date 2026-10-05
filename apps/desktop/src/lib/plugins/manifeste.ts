// Lecture défensive des champs « appels entre plugins » d'un manifeste (docs/24, A.1.2). Fonctions pures, sans Svelte : le
// manifeste vient d'un plugin, donc de quelqu'un qui n'est pas de confiance.
import { NOM_FONCTION } from "./garde";

/** Service → fonction → niveau d'accès. */
export type FonctionsOffertes = Record<string, Record<string, "lecture" | "ecriture">>;

/** Chemin relatif sûr (« service/index.html »), ou null : jamais absolu, jamais de « .. ». */
export function cheminRelatif(value: unknown): string | null {
  if (typeof value !== "string" || value === "" || value.length > 200) return null;
  if (value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => part === ".." || part === "")) return null;
  return value;
}

/**
 * Fonctions offertes, ne gardant que celles d'un service déclaré dans `provides`, à nom valide et à accès connu.
 * Objets sans prototype : un nom comme « constructor » ne retombe jamais sur `Object.prototype`.
 */
export function fonctionsDe(value: unknown, provides: Record<string, string>): FonctionsOffertes {
  const sortie: FonctionsOffertes = Object.create(null);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return sortie;
  for (const [service, fonctions] of Object.entries(value)) {
    if (!Object.hasOwn(provides, service) || typeof fonctions !== "object" || fonctions === null || Array.isArray(fonctions)) continue;
    const liste: Record<string, "lecture" | "ecriture"> = Object.create(null);
    for (const [nom, def] of Object.entries(fonctions)) {
      const acces = (def as { acces?: unknown } | null)?.acces;
      if (NOM_FONCTION.test(nom) && (acces === "lecture" || acces === "ecriture")) liste[nom] = acces;
    }
    sortie[service] = liste;
  }
  return sortie;
}
