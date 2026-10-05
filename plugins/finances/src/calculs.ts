// Lectures du registre : soldes à une date, séries, totaux par catégorie, listes. Fonctions pures sur un registre déjà valide.
// solde(compte, jour) = 0 avant l'ouverture du compte, sinon solde initial + somme des écritures dont le jour est ≤ `jour`.
import { ajouter, somme } from "@etabli/ui/money";
import { differenceJours, plage, type Jour } from "@etabli/ui/civil";
import { numero } from "./registre";
import type { Compte, Ecriture, Registre } from "./types";

/** Fenêtre maximale d'une requête de série ou de totaux : 5 ans (docs/24, A.1.3). */
export const FENETRE_MAX_JOURS = 1830;
export const PAGE_MAX = 1000;

export function soldeCompte(reg: Registre, compte: Compte, jour: Jour): number {
  if (jour < compte.ouvertLe) return 0;
  return ajouter(compte.soldeInitialCents, somme(reg.ecritures.filter((e) => e.compteId === compte.id && e.jour <= jour).map((e) => e.montantCents)));
}

export function soldesALaDate(reg: Registre, jour: Jour, comptes: readonly Compte[] = reg.comptes): Record<string, number> {
  const sortie: Record<string, number> = {};
  for (const c of comptes) sortie[c.id] = soldeCompte(reg, c, jour);
  return sortie;
}

/** Solde total des comptes choisis, un point par jour de `du` à `au` (jours sans mouvement reportés). */
export function serieParJour(reg: Registre, du: Jour, au: Jour, comptes: readonly Compte[] = reg.comptes): { jour: Jour; soldeCents: number }[] {
  const jours = plage(du, au, FENETRE_MAX_JOURS);
  const ids = new Set(comptes.map((c) => c.id));
  const delta = new Map<Jour, number>();
  const ajoutAu = (j: Jour, v: number) => delta.set(j, (delta.get(j) ?? 0) + v);
  for (const c of comptes) if (c.ouvertLe > du && c.ouvertLe <= au) ajoutAu(c.ouvertLe, c.soldeInitialCents);
  for (const e of reg.ecritures) if (ids.has(e.compteId) && e.jour > du && e.jour <= au) ajoutAu(e.jour, e.montantCents);
  let courant = comptes.reduce((s, c) => ajouter(s, soldeCompte(reg, c, du)), 0);
  return jours.map((j, i) => {
    if (i > 0) courant = ajouter(courant, delta.get(j) ?? 0);
    return { jour: j, soldeCents: courant };
  });
}

export type SensTotal = "entree" | "sortie";

/** Total par catégorie (`null` = sans catégorie) des écritures de la fenêtre, trié du plus grand au plus petit en valeur absolue. */
export function totauxParCategorie(reg: Registre, du: Jour, au: Jour, sens?: SensTotal): { categorieId: string | null; cents: number }[] {
  const totaux = new Map<string | null, number>();
  // Avec un sens (dépenses seules, recettes seules), une écriture annulée et son annulation disparaissent ensemble : sans cela,
  // l'annulation (de signe opposé) tomberait dans l'autre sens et la dépense annulée resterait comptée.
  const annulees = new Set(reg.ecritures.filter((e) => e.annule !== null).map((e) => e.annule));
  for (const e of reg.ecritures) {
    if (e.jour < du || e.jour > au) continue;
    if (sens && (e.annule !== null || annulees.has(e.id))) continue;
    if (sens === "entree" && e.montantCents <= 0) continue;
    if (sens === "sortie" && e.montantCents >= 0) continue;
    totaux.set(e.categorieId, ajouter(totaux.get(e.categorieId) ?? 0, e.montantCents));
  }
  return [...totaux].map(([categorieId, cents]) => ({ categorieId, cents })).sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents) || String(a.categorieId).localeCompare(String(b.categorieId)));
}

/** Ordre chronologique du registre : par instant, puis par ordre de création. */
export const parOrdre = (a: Ecriture, b: Ecriture): number => a.quand - b.quand || numero(a.id) - numero(b.id);

export function fenetreValide(du: Jour, au: Jour): boolean {
  return differenceJours(du, au) >= 0 && differenceJours(du, au) + 1 <= FENETRE_MAX_JOURS;
}

