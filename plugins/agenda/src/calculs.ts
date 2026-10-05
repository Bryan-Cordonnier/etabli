// Calculs de l'agenda, purs et testés : répétitions, plages occupées, chronologie à rebours (coucher → réveil → départ) et repos légal.
// Les formules de `horaires` et `repos` viennent de `gestion-budget-perso` (crates/core) : leurs tests y deviennent des vecteurs d'or.
import { ajouterJours, ajouterMois, comparerJours, differenceJours, dureeEntre, MINUTES_PAR_JOUR, numeroDeJour, type Jour } from "@etabli/ui/civil";
import { TYPES_TRAVAIL, type Evenement, type Occurrence, type Reglages, type TypeEvenement } from "./types";

/** Au plus cette durée de fenêtre pour une lecture (5 ans, docs/24 A.1.3). */
export const FENETRE_MAX_JOURS = 1830;
/** Au plus ce nombre d'occurrences rendues par un appel (une fenêtre pleine de répétitions quotidiennes reste sous cette borne). */
export const OCCURRENCES_MAX = 5000;

// ——— Répétitions ———

/** Premiers jours (début) où l'événement tombe entre `du` et `au` inclus. Un événement sans répétition tombe une fois. */
export function joursDEvenement(e: Evenement, du: Jour, au: Jour): Jour[] {
  const jours: Jour[] = [];
  const dansFenetre = (j: Jour) => comparerJours(j, du) >= 0 && comparerJours(j, au) <= 0;
  if (!e.repetition) return dansFenetre(e.jour) ? [e.jour] : [];
  const { frequence, jusquau } = e.repetition;
  const fin = comparerJours(jusquau, au) < 0 ? jusquau : au;
  // On saute directement près de `du` plutôt que de parcourir des années d'occurrences passées.
  const pas = frequence === "jour" ? 1 : frequence === "semaine" ? 7 : 0;
  let k = 0;
  if (pas > 0 && comparerJours(du, e.jour) > 0) k = Math.floor(differenceJours(e.jour, du) / pas);
  if (frequence === "mois" && comparerJours(du, e.jour) > 0) k = Math.max(0, Math.floor(differenceJours(e.jour, du) / 31) - 1);
  for (; ; k++) {
    const j = frequence === "mois" ? ajouterMois(e.jour, k) : ajouterJours(e.jour, k * pas);
    if (comparerJours(j, fin) > 0) break;
    if (dansFenetre(j)) jours.push(j);
    if (jours.length > OCCURRENCES_MAX) break;
  }
  return jours;
}

export function occurrencesDe(e: Evenement, du: Jour, au: Jour): Occurrence[] {
  return joursDEvenement(e, du, au).map((jour) => ({
    evenementId: e.id,
    type: e.type,
    titre: e.titre,
    lieu: e.lieu,
    jour,
    debutMin: e.debutMin,
    finMin: e.finMin,
    trajetMin: e.trajetMin,
    source: e.source.plugin,
  }));
}

const numero = (id: string): number => Number(id.slice(1));

/** Ordre stable : jour, heure de début, puis ordre de création. */
export const parOrdre = (a: Occurrence, b: Occurrence): number =>
  comparerJours(a.jour, b.jour) || a.debutMin - b.debutMin || numero(a.evenementId) - numero(b.evenementId);

export function occurrences(evenements: readonly Evenement[], du: Jour, au: Jour, types?: readonly TypeEvenement[]): Occurrence[] {
  const sortie: Occurrence[] = [];
  for (const e of evenements) {
    if (types && !types.includes(e.type)) continue;
    sortie.push(...occurrencesDe(e, du, au));
  }
  return sortie.sort(parOrdre);
}

// ——— Plages absolues et repos légal ———

/** Plage en minutes absolues depuis le jour numéro 0 (le repère commun du repos légal). */
export interface Plage {
  debut: number;
  fin: number;
}

export function plageAbsolue(o: Pick<Occurrence, "jour" | "debutMin" | "finMin">): Plage {
  const debut = numeroDeJour(o.jour) * MINUTES_PAR_JOUR + o.debutMin;
  return { debut, fin: debut + dureeEntre(o.debutMin, o.finMin) };
}

export const REPOS_MIN_MIN = 11 * 60;
export const JOURNEE_MAX_MIN = 10 * 60;
export const SEMAINE_MAX_MIN = 48 * 60;
const SEMAINE_MIN = 7 * MINUTES_PAR_JOUR;

export type Alerte =
  | { type: "repos_insuffisant"; entre: number; reposMin: number }
  | { type: "journee_trop_longue"; plage: number; dureeMin: number }
  | { type: "semaine_trop_longue"; depuis: number; totalMin: number };

/** Port de `repos::verifier` : 11 h entre deux plages, 10 h par plage, 48 h sur 7 jours glissants. Les plages sont triées ici. */
export function verifierRepos(plages: readonly Plage[]): Alerte[] {
  const p = [...plages].sort((a, b) => a.debut - b.debut);
  const alertes: Alerte[] = [];
  p.forEach((pl, i) => {
    const duree = pl.fin - pl.debut;
    if (duree > JOURNEE_MAX_MIN) alertes.push({ type: "journee_trop_longue", plage: i, dureeMin: duree });
    const suivante = p[i + 1];
    if (suivante) {
      const repos = suivante.debut - pl.fin;
      if (repos < REPOS_MIN_MIN) alertes.push({ type: "repos_insuffisant", entre: i, reposMin: repos });
    }
  });
  p.forEach((pl, i) => {
    const limite = pl.debut + SEMAINE_MIN;
    let total = 0;
    for (const x of p.slice(i)) {
      if (x.debut >= limite) break;
      total += Math.min(x.fin, limite) - x.debut;
    }
    if (total > SEMAINE_MAX_MIN) alertes.push({ type: "semaine_trop_longue", depuis: i, totalMin: total });
  });
  return alertes;
}

export interface AlerteDatee {
  type: Alerte["type"];
  /** Jour où commence la plage concernée. */
  jour: Jour;
  message: string;
}

const heures = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
};

/** Alertes de repos pour les événements `travail` et `retux` de la fenêtre, avec le jour concerné et une phrase lisible. */
export function alertesRepos(occ: readonly Occurrence[]): AlerteDatee[] {
  const travail = occ.filter((o) => TYPES_TRAVAIL.includes(o.type));
  const paires = travail.map((o) => ({ o, plage: plageAbsolue(o) })).sort((a, b) => a.plage.debut - b.plage.debut);
  const alertes = verifierRepos(paires.map((x) => x.plage));
  const jourDe = (i: number): Jour => paires[i]?.o.jour ?? paires[0]!.o.jour;
  return alertes.map((a) => {
    switch (a.type) {
      case "repos_insuffisant":
        return { type: a.type, jour: jourDe(a.entre + 1), message: `Repos de ${heures(Math.max(0, a.reposMin))} seulement avant cette journée (11 h au minimum).` };
      case "journee_trop_longue":
        return { type: a.type, jour: jourDe(a.plage), message: `Journée de ${heures(a.dureeMin)} (10 h au maximum).` };
      case "semaine_trop_longue":
        return { type: a.type, jour: jourDe(a.depuis), message: `${heures(a.totalMin)} sur 7 jours à partir de ce jour (48 h au maximum).` };
    }
  });
}

// ——— Chronologie à rebours ———

export interface Chronologie {
  trajetMajoreMin: number;
  arriveeViseeMin: number;
  /** Heure à laquelle les roues tournent. */
  departMin: number;
  /** « Tu dois partir maintenant ». */
  decisionMin: number;
  reveilMin: number;
  /** Négatif : la veille. */
  coucherMin: number;
}

/** Trajet majoré, arrondi à la minute supérieure : `⌈trajet × (10 000 + majoration) / 10 000⌉`. */
export function trajetMajore(trajetMin: number, majorationBp: number): number {
  return Math.floor((trajetMin * (10_000 + majorationBp) + 9_999) / 10_000);
}

/** Port de `horaires::calculer_horaires` (minutes depuis minuit du jour de l'événement ; une valeur négative est la veille). */
export function chronologie(debutMin: number, trajetMin: number, r: Reglages): Chronologie {
  const trajetMajoreMin = trajetMajore(trajetMin, r.majorationTrajetBp);
  const arriveeViseeMin = debutMin - r.margeArriveeMin;
  const departMin = arriveeViseeMin - trajetMajoreMin;
  const decisionMin = departMin - r.miseEnRouteMin;
  const reveilMin = decisionMin - r.preparationMin;
  const coucherMin = reveilMin - r.sommeilMin - r.endormissementMin;
  return { trajetMajoreMin, arriveeViseeMin, departMin, decisionMin, reveilMin, coucherMin };
}

// ——— Plages occupées (offertes aux autres plugins) ———

export interface PlageOccupee {
  jour: Jour;
  debutMin: number;
  finMin: number;
  type: TypeEvenement;
}

export const plagesOccupees = (occ: readonly Occurrence[]): PlageOccupee[] =>
  occ.map((o) => ({ jour: o.jour, debutMin: o.debutMin, finMin: o.finMin, type: o.type }));
