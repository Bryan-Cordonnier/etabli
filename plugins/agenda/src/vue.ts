// Ce que montre l'écran Calendrier, calculé sans navigateur : la grille du mois, le contenu d'un jour, sa chronologie et les alertes de repos.
import { ajouterJours, decomposer, differenceJours, lundiDe, premierDuMois, type Jour } from "@etabli/ui/civil";
import { alertesRepos, chronologie, occurrences, type AlerteDatee, type Chronologie } from "./calculs";
import type { Carnet, Occurrence, TypeEvenement } from "./types";

export const LIBELLES_TYPE: Record<TypeEvenement, string> = { travail: "Travail", retux: "Retux", rdv: "Rendez-vous", autre: "Autre" };
/** Une teinte par type, lisible sur fond clair et sombre. */
export const COULEURS_TYPE: Record<TypeEvenement, string> = { travail: "#2563eb", retux: "#0f766e", rdv: "#d97706", autre: "#7c8794" };

export const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const JOURS_COURTS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const JOURS_LONGS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

export const libelleMois = (j: Jour): string => `${MOIS[decomposer(j).mois - 1]} ${decomposer(j).annee}`;

export function libelleJour(j: Jour): string {
  const lundi = lundiDe(j);
  return `${JOURS_LONGS[differenceJours(lundi, j)]} ${decomposer(j).jour} ${MOIS[decomposer(j).mois - 1]}`;
}

/** « 07:10 », ou « 22:10 la veille » pour une heure négative (coucher). */
export function heure(minutes: number): string {
  const jours = Math.floor(minutes / 1440);
  const r = minutes - jours * 1440;
  const hhmm = `${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
  if (jours === 0) return hhmm;
  return jours === -1 ? `${hhmm} la veille` : jours < 0 ? `${hhmm} (${-jours} jours avant)` : `${hhmm} le lendemain`;
}

export interface CaseJour {
  jour: Jour;
  dansLeMois: boolean;
  occurrences: Occurrence[];
}

export interface VueMois {
  cases: CaseJour[];
  alertes: AlerteDatee[];
}

/** Six semaines pleines (42 jours) qui commencent un lundi et contiennent le mois de `reference`. */
export function vueMois(carnet: Carnet, reference: Jour): VueMois {
  const debut = lundiDe(premierDuMois(reference));
  const fin = ajouterJours(debut, 41);
  const mois = decomposer(reference).mois;
  // Les alertes de repos regardent une semaine avant et après : une journée du 1er peut dépendre de la veille.
  const large = occurrences(carnet.evenements, ajouterJours(debut, -8), ajouterJours(fin, 8));
  const dansGrille = large.filter((o) => differenceJours(debut, o.jour) >= 0 && differenceJours(o.jour, fin) >= 0);
  const cases: CaseJour[] = Array.from({ length: 42 }, (_, i) => {
    const jour = ajouterJours(debut, i);
    return { jour, dansLeMois: decomposer(jour).mois === mois, occurrences: dansGrille.filter((o) => o.jour === jour) };
  });
  const alertes = alertesRepos(large).filter((a) => differenceJours(debut, a.jour) >= 0 && differenceJours(a.jour, fin) >= 0);
  return { cases, alertes };
}

export interface LigneJour {
  occurrence: Occurrence;
  /** Chronologie à rebours si l'événement a un trajet. */
  chronologie: Chronologie | null;
}

/** Le contenu d'un jour. La chronologie à rebours n'est calculée que pour le premier événement avec trajet (le réveil dépend du premier départ). */
export function vueJour(carnet: Carnet, jour: Jour): LigneJour[] {
  const occ = occurrences(carnet.evenements, jour, jour);
  let premier = true;
  return occ.map((occurrence) => {
    const aTrajet = occurrence.trajetMin !== null;
    const avec = aTrajet && premier;
    if (aTrajet) premier = false;
    return { occurrence, chronologie: avec && occurrence.trajetMin !== null ? chronologie(occurrence.debutMin, occurrence.trajetMin, carnet.reglages) : null };
  });
}

