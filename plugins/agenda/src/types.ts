// Types de l'agenda (docs/24, sections 6 et 7, A.1.5). Jours civils AAAA-MM-JJ ; heures en minutes depuis minuit ; une fin
// avant ou égale au début passe minuit. Aucune date en UTC ici : un événement est « le 12 octobre à 8 h », pas un instant.
import type { Jour } from "@etabli/ui/civil";

export type TypeEvenement = "travail" | "retux" | "rdv" | "autre";
export const TYPES_EVENEMENT: readonly TypeEvenement[] = ["travail", "retux", "rdv", "autre"];
/** Types qui comptent pour le repos légal (11 h, 10 h par jour, 48 h par semaine). */
export const TYPES_TRAVAIL: readonly TypeEvenement[] = ["travail", "retux"];

export type Frequence = "jour" | "semaine" | "mois";
export const FREQUENCES: readonly Frequence[] = ["jour", "semaine", "mois"];

export interface Repetition {
  frequence: Frequence;
  /** Dernier jour où l'événement peut commencer (au plus 5 ans après le premier). */
  jusquau: Jour;
}

export interface Source {
  /** Identifiant du plugin d'origine (imposé par le moteur), ou `UTILISATEUR`. */
  plugin: string;
  /** Regroupe les événements posés ensemble par un plugin (« mission:12 ») : `remplacer` agit sur tout le groupe. */
  ref: string;
}

export interface Evenement {
  id: string;
  type: TypeEvenement;
  titre: string;
  lieu: string | null;
  jour: Jour;
  debutMin: number;
  finMin: number;
  /** Trajet de base en minutes (sans majoration), ou `null` s'il n'y a pas de déplacement. */
  trajetMin: number | null;
  repetition: Repetition | null;
  source: Source;
}

/** Un événement tel qu'il tombe un jour précis (les répétitions sont développées). */
export interface Occurrence {
  evenementId: string;
  type: TypeEvenement;
  titre: string;
  lieu: string | null;
  jour: Jour;
  debutMin: number;
  finMin: number;
  trajetMin: number | null;
  /** Plugin d'origine. */
  source: string;
}

/** Réglages de la chronologie à rebours (valeurs de départ : celles du cahier des charges de gestion-budget-perso). */
export interface Reglages {
  margeArriveeMin: number;
  miseEnRouteMin: number;
  preparationMin: number;
  sommeilMin: number;
  endormissementMin: number;
  /** Majoration du trajet en points de base (1500 = +15 %). */
  majorationTrajetBp: number;
}

export const REGLAGES_DEFAUT: Reglages = {
  margeArriveeMin: 10,
  miseEnRouteMin: 10,
  preparationMin: 45,
  sommeilMin: 480,
  endormissementMin: 15,
  majorationTrajetBp: 0,
};

/** Réponse mémorisée d'un `evenements.remplacer`, pour rejouer sans doublon. */
export interface ReponseMemorisee {
  cle: string;
  ids: string[];
}

export interface Carnet {
  schema: 1;
  evenements: Evenement[];
  reglages: Reglages;
  /** Dernier numéro d'identifiant donné (les identifiants ne sont jamais réutilisés). */
  dernierNumero: number;
  /** Dernières clés d'idempotence vues, par plugin appelant. */
  cles: Record<string, ReponseMemorisee[]>;
}

export const UTILISATEUR = "utilisateur";

/** Codes communs des contrats (docs/24, A.1.3). */
export type CodeErreur = "argument_invalide" | "introuvable" | "limite_atteinte" | "permission_refusee" | "illisible";

export class ErreurAgenda extends Error {
  constructor(
    readonly code: CodeErreur,
    message: string,
  ) {
    super(message);
    this.name = "ErreurAgenda";
  }
}
