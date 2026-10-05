// Ce que Budget lit et écrit dans Finances (service `finances@1`). Fonctions pures : l'appelant (`appeler`) est injecté, donc testé sans
// moteur. Budget ne calcule jamais lui-même le solde : il le demande, pour qu'il n'y ait qu'une seule vérité sur l'argent réel.
import { dernierDuMois, jourDeInstant, localVersInstant, premierDuMois, type Jour } from "@etabli/ui/civil";
import type { Prevision } from "./types";

export type Reponse<T = unknown> = { ok: true; valeur: T } | { ok: false; code: string; message: string };
export type Appeler = (fonction: string, args?: unknown) => Promise<Reponse>;

export interface CompteFinances {
  id: string;
  nom: string;
  archive: boolean;
}
export interface CategorieFinances {
  id: string;
  nom: string;
  sens: "entree" | "sortie" | "les-deux";
}
export interface DonneesFinances {
  comptes: CompteFinances[];
  categories: CategorieFinances[];
  /** Solde total de tous les comptes aujourd'hui. */
  soldeCents: number;
  /** Sorties du mois en cours par catégorie (négatives), telles que Finances les rend. */
  sortiesDuMois: { categorieId: string | null; cents: number }[];
}

export type Chargement = { ok: true; donnees: DonneesFinances } | { ok: false; code: string; message: string };

/** Phrase pour l'utilisateur quand Finances ne répond pas. */
export function messageIndisponible(code: string, message: string): string {
  switch (code) {
    case "service_absent":
      return "Budget a besoin du plugin Finances : installez-le (ou réactivez-le) depuis le catalogue.";
    case "contrat_incompatible":
      return "La version de Finances ne correspond pas à cette version de Budget : mettez l'un des deux à jour.";
    case "permission_refusee":
      return "Budget n'a pas la permission de lire Finances. Réinstallez-le pour accepter ses permissions.";
    default:
      return message;
  }
}

async function lire<T>(appeler: Appeler, fonction: string, args?: unknown): Promise<{ ok: true; valeur: T } | { ok: false; code: string; message: string }> {
  const r = await appeler(fonction, args);
  return r.ok ? { ok: true, valeur: r.valeur as T } : r;
}

/** Charge comptes, catégories, solde total d'aujourd'hui et sorties du mois. S'arrête à la première erreur. */
export async function chargerFinances(appeler: Appeler, aujourdhui: Jour): Promise<Chargement> {
  const comptes = await lire<CompteFinances[]>(appeler, "comptes.liste");
  if (!comptes.ok) return comptes;
  const categories = await lire<CategorieFinances[]>(appeler, "categories.liste");
  if (!categories.ok) return categories;
  const actifs = comptes.valeur.filter((c) => !c.archive);
  let soldeCents = 0;
  if (actifs.length > 0) {
    const soldes = await lire<Record<string, number>>(appeler, "soldes.aLaDate", { jour: aujourdhui, comptes: actifs.map((c) => c.id) });
    if (!soldes.ok) return soldes;
    soldeCents = Object.values(soldes.valeur).reduce((s, v) => s + v, 0);
  }
  const sorties = await lire<{ categorieId: string | null; cents: number }[]>(appeler, "totaux.parCategorie", { du: premierDuMois(aujourdhui), au: dernierDuMois(aujourdhui), sens: "sortie" });
  if (!sorties.ok) return sorties;
  return { ok: true, donnees: { comptes: comptes.valeur, categories: categories.valeur, soldeCents, sortiesDuMois: sorties.valeur } };
}

const MIDI = 12 * 60;

/**
 * Confirme une prévision : ajoute l'écriture réelle dans Finances. La clé d'idempotence est celle de la prévision : un second clic, ou un
 * rejeu après un délai dépassé, ne crée jamais de doublon. On ne confirme qu'à partir du jour prévu : Finances ne garde que l'argent réel,\n * et l'écriture porte la date prévue (midi) sans jamais dépasser l'instant présent.
 */
export async function confirmer(appeler: Appeler, p: Prevision, maintenant: number): Promise<{ ok: true; ecritureId: string } | { ok: false; code: string; message: string }> {
  if (p.compteId === null) return { ok: false, code: "argument_invalide", message: "Choisissez le compte de cette prévision avant de la confirmer." };
  if (p.jour > jourDeInstant(maintenant)) return { ok: false, code: "argument_invalide", message: `Cette prévision est prévue le ${p.jour} : elle ne peut être confirmée qu'à partir de ce jour.` };
  const quand = Math.min(localVersInstant(p.jour, MIDI), maintenant);
  const r = await appeler("ecritures.ajouter", {
    compteId: p.compteId,
    montantCents: p.montantCents,
    quand,
    libelle: p.libelle,
    ...(p.categorieId ? { categorieId: p.categorieId } : {}),
    ref: `budget:${p.id}`,
    cle: `budget-${p.id}`,
  });
  if (!r.ok) return r;
  const id = (r.valeur as { id?: unknown }).id;
  return typeof id === "string" ? { ok: true, ecritureId: id } : { ok: false, code: "erreur", message: "Réponse de Finances illisible." };
}
