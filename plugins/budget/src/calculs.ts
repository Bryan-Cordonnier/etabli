// Calculs de Budget, purs et testés : échéances des virements et abonnements, courbe « combien j'aurai à telle date », budget du mois.
// Tout est en entiers (centimes) : aucune virgule flottante d'argent (docs/24, section 8).
import { ajouterJours, ajouterMois, comparerJours, differenceJours, dernierDuMois, plage, premierDuMois, type Jour } from "@etabli/ui/civil";
import { ajouter } from "@etabli/ui/money";
import type { Enveloppe, Periodicite, Prevision } from "./types";

/** Au plus cette durée de fenêtre pour une lecture (5 ans, docs/24 A.1.3). */
export const FENETRE_MAX_JOURS = 1830;
/** Les échéances futures sont préparées sur cet horizon (en jours) à chaque ouverture. */
export const HORIZON_JOURS = 180;
/** Les échéances passées sont rattrapées jusqu'à cette ancienneté : une échéance manquée reste visible « en retard ». */
export const RETARD_JOURS = 31;

// ——— Échéances ———

/** Jours d'échéance entre `du` et `au` inclus. `jusquau` : dernière échéance permise (aucune borne si `null`). */
export function echeances(origine: Jour, periodicite: Periodicite | "unique", jusquau: Jour | null, du: Jour, au: Jour): Jour[] {
  const fin = jusquau && comparerJours(jusquau, au) < 0 ? jusquau : au;
  if (periodicite === "unique") return comparerJours(origine, du) >= 0 && comparerJours(origine, fin) <= 0 ? [origine] : [];
  const jours: Jour[] = [];
  const apres = comparerJours(du, origine) > 0;
  let k = 0;
  // On saute près de `du` plutôt que de parcourir des années d'échéances passées (sans jamais dépasser `du`).
  if (apres) {
    const ecart = differenceJours(origine, du);
    k = periodicite === "semaine" ? Math.floor(ecart / 7) : periodicite === "mois" ? Math.max(0, Math.floor(ecart / 31) - 1) : Math.max(0, Math.floor(ecart / 366) - 1);
  }
  for (; ; k++) {
    const j = periodicite === "semaine" ? ajouterJours(origine, 7 * k) : ajouterMois(origine, periodicite === "mois" ? k : 12 * k);
    if (comparerJours(j, fin) > 0) break;
    if (comparerJours(j, du) >= 0) jours.push(j);
    if (jours.length > 5000) break;
  }
  return jours;
}

// ——— Courbe du mois ———

export interface PointCourbe {
  jour: Jour;
  soldeCents: number;
}

export interface Courbe {
  serie: PointCourbe[];
  /** Le jour le plus bas de la courbe (le premier s'il y en a plusieurs). */
  plancher: PointCourbe;
  /** Jours où le solde passe sous le seuil, avec l'écart (positif) en centimes. */
  sousSeuil: { jour: Jour; ecartCents: number }[];
  /** Prévisions attendues dont le jour est passé : signalées, jamais réalisées automatiquement. */
  enRetard: Prevision[];
}

/**
 * Solde réel d'aujourd'hui (lu dans Finances) puis, jour après jour, les prévisions attendues. Une prévision attendue d'AUJOURD'HUI
 * compte (l'argent n'a pas encore bougé) ; une attendue d'hier ou plus ancienne est « en retard » et ne compte pas.
 */
export function courbe(args: { soldeCents: number; aujourdhui: Jour; jours: number; previsions: readonly Prevision[]; seuilCents: number }): Courbe {
  const { soldeCents, aujourdhui, jours, previsions, seuilCents } = args;
  if (!Number.isSafeInteger(jours) || jours < 1 || jours > FENETRE_MAX_JOURS) throw new RangeError(`Durée de courbe invalide : ${jours} jours.`);
  const fin = ajouterJours(aujourdhui, jours - 1);
  const attendues = previsions.filter((p) => p.statut === "attendue");
  const enRetard = attendues.filter((p) => comparerJours(p.jour, aujourdhui) < 0).sort((a, b) => comparerJours(a.jour, b.jour) || Number(a.id.slice(1)) - Number(b.id.slice(1)));
  const delta = new Map<Jour, number>();
  for (const p of attendues) {
    if (comparerJours(p.jour, aujourdhui) < 0 || comparerJours(p.jour, fin) > 0) continue;
    delta.set(p.jour, ajouter(delta.get(p.jour) ?? 0, p.montantCents));
  }
  let courant = soldeCents;
  const serie = plage(aujourdhui, fin, FENETRE_MAX_JOURS).map((jour) => {
    courant = ajouter(courant, delta.get(jour) ?? 0);
    return { jour, soldeCents: courant };
  });
  const plancher = serie.reduce((m, p) => (p.soldeCents < m.soldeCents ? p : m), serie[0]!);
  const sousSeuil = serie.filter((p) => p.soldeCents < seuilCents).map((p) => ({ jour: p.jour, ecartCents: seuilCents - p.soldeCents }));
  return { serie, plancher, sousSeuil, enRetard };
}

// ——— Budget du mois ———

export interface LigneEnveloppe {
  categorieId: string;
  plafondCents: number;
  /** Déjà dépensé ce mois-ci (lu dans Finances), positif. */
  reelCents: number;
  /** Encore prévu d'ici la fin du mois (prévisions attendues de sortie), positif. */
  prevuCents: number;
  /** Plafond − réel − prévu : négatif = dépassement attendu. */
  resteCents: number;
  depasse: boolean;
}

/**
 * `reelsSorties` : totaux de sorties du mois par catégorie tels que Finances les rend (négatifs). Le prévu ne compte que ce qui reste à
 * venir (à partir d'aujourd'hui) pour ne pas compter deux fois ce qui a déjà été réalisé.
 */
export function budgetDuMois(args: {
  enveloppes: readonly Enveloppe[];
  reelsSorties: readonly { categorieId: string | null; cents: number }[];
  previsions: readonly Prevision[];
  aujourdhui: Jour;
}): LigneEnveloppe[] {
  const { enveloppes, reelsSorties, previsions, aujourdhui } = args;
  const debut = premierDuMois(aujourdhui);
  const fin = dernierDuMois(aujourdhui);
  return enveloppes.map((e) => {
    const reelCents = -reelsSorties.filter((r) => r.categorieId === e.categorieId).reduce((s, r) => ajouter(s, r.cents), 0);
    const prevuCents = -previsions
      .filter((p) => p.statut === "attendue" && p.categorieId === e.categorieId && p.montantCents < 0 && comparerJours(p.jour, aujourdhui) >= 0 && comparerJours(p.jour, fin) <= 0 && comparerJours(p.jour, debut) >= 0)
      .reduce((s, p) => ajouter(s, p.montantCents), 0);
    const resteCents = e.plafondCents - Math.max(reelCents, 0) - prevuCents;
    return { categorieId: e.categorieId, plafondCents: e.plafondCents, reelCents: Math.max(reelCents, 0), prevuCents, resteCents, depasse: resteCents < 0 };
  });
}
