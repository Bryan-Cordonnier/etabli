// Modèle de données de Budget (docs/24, section 6) : le PRÉVU. Ce qui s'est vraiment passé vit dans Finances ; ici, ce qui est attendu.
// Montants en centimes entiers (signés : positif = argent qui rentre), jours civils AAAA-MM-JJ. Un virement ou un abonnement produit
// de vraies prévisions (une par échéance) : la courbe et le service ne connaissent qu'un seul modèle, la `Prevision`.
import type { Jour } from "@etabli/ui/civil";
import type { Centimes } from "@etabli/ui/money";

export const SCHEMA = 1;
/** Source des prévisions saisies à la main (le « @ » est interdit dans un identifiant de plugin). */
export const UTILISATEUR = "@utilisateur";

export type Statut = "attendue" | "realisee" | "abandonnee";
export const STATUTS: readonly Statut[] = ["attendue", "realisee", "abandonnee"];

export interface Source {
  /** Plugin d'origine (imposé par le moteur), `@utilisateur`, ou `@budget` pour ce que Budget produit lui-même (virements, abonnements). */
  plugin: string;
  /** Regroupe les prévisions posées ensemble (« mission:12 », « virement:v1 ») : `remplacer` agit sur tout le groupe. */
  ref: string;
}

export interface Prevision {
  id: string;
  jour: Jour;
  montantCents: Centimes;
  /** Compte concerné, ou `null` s'il n'est pas encore choisi. */
  compteId: string | null;
  categorieId: string | null;
  libelle: string;
  source: Source;
  statut: Statut;
  /** Écriture réelle de Finances qui a réalisé cette prévision. */
  ecritureId: string | null;
}

export type FrequenceVirement = "semaine" | "mois";
export type Periodicite = "semaine" | "mois" | "an";
export const PERIODICITES: readonly Periodicite[] = ["semaine", "mois", "an"];

/** Un virement entre deux comptes : à chaque échéance, une prévision de sortie sur le compte source et une d'entrée sur la cible. */
export interface Virement {
  id: string;
  libelle: string;
  /** Toujours positif. */
  montantCents: Centimes;
  compteSourceId: string;
  compteCibleId: string;
  /** Premier jour. */
  jour: Jour;
  repetition: { frequence: FrequenceVirement; jusquau: Jour } | null;
}

/** Une dépense qui revient : une prévision de sortie à chaque échéance, sans fin (jusqu'à la suppression). */
export interface Abonnement {
  id: string;
  libelle: string;
  /** Toujours positif (c'est une dépense). */
  montantCents: Centimes;
  compteId: string | null;
  categorieId: string | null;
  periodicite: Periodicite;
  /** Première échéance. */
  jour: Jour;
  /** Marqué à résilier : rappel visuel, les échéances futures restent prévues tant qu'il existe. */
  aResilier: boolean;
}

/** Plafond de dépense d'une catégorie, par mois. */
export interface Enveloppe {
  categorieId: string;
  plafondCents: Centimes;
}

export interface ReponseMemorisee {
  cle: string;
  ids: string[];
}

export interface Plan {
  schema: typeof SCHEMA;
  suivant: number;
  previsions: Prevision[];
  virements: Virement[];
  abonnements: Abonnement[];
  enveloppes: Enveloppe[];
  /** Le solde ne doit pas passer sous ce seuil (centimes) : les jours en dessous sont signalés sur la courbe. */
  seuilCents: Centimes;
  /** Dernières clés d'idempotence vues, par plugin appelant. */
  cles: Record<string, ReponseMemorisee[]>;
}

/** Codes permis à un fournisseur (protocole du SDK) plus `illisible`, traduit en `erreur` à la frontière du service. */
export type CodeErreur = "argument_invalide" | "introuvable" | "limite_atteinte" | "permission_refusee" | "illisible";

export class ErreurBudget extends Error {
  constructor(
    readonly code: CodeErreur,
    message: string,
  ) {
    super(message);
    this.name = "ErreurBudget";
  }
}
