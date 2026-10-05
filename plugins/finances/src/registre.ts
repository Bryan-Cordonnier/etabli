// Le registre dans les réglages du plugin : lecture prudente et limite de taille. Le registre est la seule mémoire de Finances (un appel de
// service = un cadre neuf, rien n'est gardé en mémoire d'un appel à l'autre).
import { FUSEAU_PARIS } from "@etabli/ui/civil";
import { ErreurFinances, SCHEMA, SENS, TYPES_COMPTE, type Registre } from "./types";

/** Plafond du registre sérialisé. Le moteur refuse les messages de plus de 4 Mo et les réglages de plus de 5 Mo : on s'arrête avant, avec une erreur claire. */
export const LIMITE_OCTETS = 3_500_000;
/** À partir de là, l'interface prévient qu'il faut penser à exporter et à clôturer. */
export const ALERTE_OCTETS = 2_800_000;
export const MAX_COMPTES = 200;
export const MAX_CATEGORIES = 500;

export function registreVide(): Registre {
  return { schema: SCHEMA, fuseau: FUSEAU_PARIS, suivant: 1, comptes: [], categories: [], ecritures: [] };
}

const estObjet = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Lit les réglages enregistrés. `null` (rien d'enregistré) donne un registre vide ; tout le reste doit être un registre valide du
 * schéma 1, sinon ERREUR : on ne repart jamais d'un registre vide à la place de données illisibles, car l'écriture suivante les écraserait.
 */
export function lireRegistre(enregistre: unknown): Registre {
  if (enregistre === null || enregistre === undefined) return registreVide();
  const illisible = (detail: string) =>
    new ErreurFinances("erreur", `Le registre de Finances est illisible (${detail}). Rien n'a été modifié : restaurez une sauvegarde ou exportez les données avant de continuer.`);
  if (!estObjet(enregistre)) throw illisible("format inattendu");
  if (enregistre.schema !== SCHEMA) throw illisible(`schéma ${String(enregistre.schema)} au lieu de ${SCHEMA}`);
  const { fuseau, suivant, comptes, categories, ecritures } = enregistre;
  if (typeof fuseau !== "string" || !Number.isSafeInteger(suivant) || !Array.isArray(comptes) || !Array.isArray(categories) || !Array.isArray(ecritures)) {
    throw illisible("champs manquants");
  }
  for (const c of comptes) {
    if (!estObjet(c) || typeof c.id !== "string" || typeof c.nom !== "string" || !TYPES_COMPTE.includes(c.type as never) || !Number.isSafeInteger(c.soldeInitialCents) || typeof c.ouvertLe !== "string") {
      throw illisible("un compte est invalide");
    }
  }
  for (const c of categories) {
    if (!estObjet(c) || typeof c.id !== "string" || typeof c.nom !== "string" || !SENS.includes(c.sens as never)) throw illisible("une catégorie est invalide");
  }
  for (const e of ecritures) {
    if (
      !estObjet(e) || typeof e.id !== "string" || typeof e.compteId !== "string" || !Number.isSafeInteger(e.montantCents) ||
      !Number.isSafeInteger(e.quand) || typeof e.jour !== "string" || typeof e.libelle !== "string" || typeof e.source !== "string"
    ) {
      throw illisible("une écriture est invalide");
    }
  }
  return enregistre as unknown as Registre;
}

/** Taille du registre une fois enregistré (octets UTF-8 du JSON). */
export function tailleOctets(registre: Registre): number {
  return new TextEncoder().encode(JSON.stringify(registre)).length;
}

/** Refuse un registre trop gros AVANT de l'enregistrer : le moteur ne le recevrait pas, et la perte serait silencieuse. */
export function verifierTaille(registre: Registre): void {
  const octets = tailleOctets(registre);
  if (octets > LIMITE_OCTETS) {
    throw new ErreurFinances(
      "limite_atteinte",
      `Le registre de Finances est plein (${(octets / 1e6).toFixed(1)} Mo sur ${(LIMITE_OCTETS / 1e6).toFixed(1)} Mo permis). Rien n'a été enregistré : exportez puis clôturez les anciennes années.`,
    );
  }
}

/** Numéro d'un identifiant (« e12 » → 12), pour trier dans l'ordre de création. */
export const numero = (id: string): number => Number(id.slice(1));
