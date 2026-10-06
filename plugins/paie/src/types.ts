// Modèle de données de Paie (docs/24, sections 6 et 8) : pour un PARTICULIER, programmer ses paies (missions d'intérim, jours de réserve, CDI et
// CDD). Montants en centimes entiers, taux en points de base (2200 = 22 %), durées en minutes, jours civils AAAA-MM-JJ.
// Aucun taux n'est en dur dans le code : tout est un réglage. Les valeurs par défaut sont des HYPOTHÈSES à confirmer sur un vrai bulletin.
import type { Jour } from "@etabli/ui/civil";
import type { Centimes, PointsDeBase } from "@etabli/ui/money";

export const SCHEMA = 1;

export interface Reglages {
  /** Cotisations salariales (hypothèse : 22 %, à confirmer sur un bulletin). */
  cotisationsBp: PointsDeBase;
  /** Indemnité de fin de mission (IFM) sur le brut de base (intérim). */
  ifmBp: PointsDeBase;
  /** Congés payés sur (brut de base + IFM) (intérim). */
  cpBp: PointsDeBase;
  /** Durée hebdomadaire au-delà de laquelle les heures sont supplémentaires (35 h = 2100 min). */
  seuilSemaineMin: number;
  /** Majoration des heures supplémentaires jusqu'à `seuilSup1Min` par semaine (légal : +25 %). */
  majorationSup1Bp: PointsDeBase;
  /** Au-delà : majoration (légal : +50 %). */
  majorationSup2Bp: PointsDeBase;
  /** Nombre de minutes supplémentaires par semaine payées à la première majoration (légal : 8 h = 480 min). */
  seuilSup1Min: number;
  /** Délai entre la fin d'une mission ou d'une période de réserve et le paiement, en jours (jamais un week-end ni un jour férié). */
  delaiPaieJours: number;
  /** Tarif d'un jour de réserve, brut (à régler : aucune valeur par défaut). */
  tarifReserveCents: Centimes;
  /** Indemnité d'un jour hors base de réserve (hypothèse : 38 €, à confirmer). */
  indemniteHorsBaseCents: Centimes;
  /** CDD : prime de précarité sur le brut total du contrat (légal : 10 %). */
  precariteBp: PointsDeBase;
  /** CDD : indemnité de congés payés non pris sur le brut total (légal : 10 %). */
  cpCddBp: PointsDeBase;
}

export const REGLAGES_DEFAUT: Reglages = {
  cotisationsBp: 2200,
  ifmBp: 1000,
  cpBp: 1000,
  seuilSemaineMin: 35 * 60,
  majorationSup1Bp: 2500,
  majorationSup2Bp: 5000,
  seuilSup1Min: 8 * 60,
  delaiPaieJours: 7,
  tarifReserveCents: 0,
  indemniteHorsBaseCents: 3800,
  precariteBp: 1000,
  cpCddBp: 1000,
};

export type StatutMission = "prevu" | "confirme";

export interface Mission {
  id: string;
  libelle: string;
  debut: Jour;
  fin: Jour;
  /** Jours travaillés dans la semaine : 1 = lundi … 7 = dimanche. */
  joursSemaine: number[];
  /** Jours de la période où l'on ne travaille pas. */
  exclusions: Jour[];
  debutMin: number;
  /** Une fin avant ou égale au début passe minuit. */
  finMin: number;
  pauseMin: number;
  /** Taux horaire brut. */
  tauxHoraireCents: Centimes;
  statut: StatutMission;
  /** Minutes supplémentaires ajoutées à la main un jour précis (« +1 h ce soir »), payées en heures supplémentaires. */
  supplementaires: { jour: Jour; minutes: number }[];
}

export interface PeriodeReserve {
  id: string;
  libelle: string;
  /** Jours de réserve payés au tarif. */
  jours: Jour[];
  /** Nombre de jours hors base, payés à l'indemnité. */
  horsBase: number;
}

export type TypeContrat = "cdi" | "cdd";

export interface Contrat {
  id: string;
  libelle: string;
  type: TypeContrat;
  brutMensuelCents: Centimes;
  debut: Jour;
  /** Dernier jour : obligatoire pour un CDD, facultatif pour un CDI. */
  fin: Jour | null;
  /** Jour du mois de la paie (1 à 28 ; reporté au jour ouvré suivant s'il tombe un week-end ou un jour férié). */
  jourDePaie: number;
}

/** Net réellement reçu pour une mission ou une période de réserve : plus rien n'est « attendu » pour elle chez Budget. */
export interface Bulletin {
  netCents: Centimes;
  /** Jour où l'argent est arrivé. */
  jour: Jour;
  /** Écriture de Finances, si la transmission a eu lieu. */
  ecritureId: string | null;
}

export interface Donnees {
  schema: typeof SCHEMA;
  suivant: number;
  reglages: Reglages;
  missions: Mission[];
  reserves: PeriodeReserve[];
  contrats: Contrat[];
  /**
   * Ce qui a été transmis aux autres plugins : « service|ref » → empreinte du contenu envoyé. Sert à dire « transmis n sur n » et à ne
   * renvoyer que ce qui a changé. La vérité reste ici : on peut tout régénérer en rejouant (docs/24, A.1.7).
   */
  transmis: Record<string, string>;
  /** Net reçu, par référence (« mission:m1 », « reserve:r2 »). */
  bulletins: Record<string, Bulletin>;
}

export type CodeErreur = "argument_invalide" | "introuvable" | "limite_atteinte" | "illisible";

export class ErreurPaie extends Error {
  constructor(
    readonly code: CodeErreur,
    message: string,
  ) {
    super(message);
    this.name = "ErreurPaie";
  }
}
