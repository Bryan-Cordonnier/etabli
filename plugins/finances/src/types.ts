// Modèle de données de Finances (docs/24, section 6) : l'argent RÉEL seulement. Montants en centimes entiers, instants en millisecondes
// UTC, jours civils AAAA-MM-JJ (dans le fuseau figé sur chaque écriture). Le registre est en ajout seulement : aucune écriture ne se
// modifie ni ne se supprime, une erreur se corrige par une écriture inverse (annulation).
import type { Centimes } from "@etabli/ui/money";
import type { Jour } from "@etabli/ui/civil";

export const SCHEMA = 1;
/** Source des écritures saisies par l'utilisateur dans l'interface de Finances (le « @ » est interdit dans un identifiant de plugin). */
export const UTILISATEUR = "@utilisateur";

export type TypeCompte = "courant" | "epargne" | "especes" | "autre";
export const TYPES_COMPTE: readonly TypeCompte[] = ["courant", "epargne", "especes", "autre"];
export type Sens = "entree" | "sortie" | "les-deux";
export const SENS: readonly Sens[] = ["entree", "sortie", "les-deux"];

export interface Compte {
  id: string;
  nom: string;
  type: TypeCompte;
  soldeInitialCents: Centimes;
  /** Premier jour où le compte compte : avant, son solde est 0 et aucune écriture n'est permise. */
  ouvertLe: Jour;
  archive: boolean;
  /** Qui l'a créé (identifiant du plugin appelant, ou « @utilisateur »). */
  source: string;
  /** Clé d'idempotence de la création (par source). */
  cle: string | null;
}

export interface Categorie {
  id: string;
  nom: string;
  parentId: string | null;
  sens: Sens;
  couleur: string | null;
  source: string;
  cle: string | null;
}

export interface Ecriture {
  id: string;
  compteId: string;
  /** Signé : positif = entrée d'argent, négatif = sortie. Jamais nul. */
  montantCents: Centimes;
  /** Quand l'argent a bougé (instant UTC, ms). */
  quand: number;
  /** Fuseau figé à la création : le jour civil ne change jamais, même si le réglage change plus tard. */
  fuseau: string;
  jour: Jour;
  categorieId: string | null;
  libelle: string;
  /** Plugin d'origine, imposé par le moteur (jamais une donnée de l'appelant), ou « @utilisateur ». */
  source: string;
  ref: string | null;
  /** Pour une annulation : l'identifiant de l'écriture annulée. */
  annule: string | null;
  motif: string | null;
  /** Quand l'écriture a été enregistrée (instant UTC) : sert d'historique, distinct de `quand`. */
  creeLe: number;
  cle: string | null;
}

export interface Registre {
  schema: typeof SCHEMA;
  fuseau: string;
  /** Compteur des identifiants (c1, k1, e1…), jamais réutilisé. */
  suivant: number;
  comptes: Compte[];
  categories: Categorie[];
  ecritures: Ecriture[];
}

/** Erreur métier : le code est l'un de ceux qu'un fournisseur a le droit de renvoyer (protocole du SDK). */
export type CodeErreur = "argument_invalide" | "introuvable" | "limite_atteinte" | "permission_refusee" | "erreur";

export class ErreurFinances extends Error {
  constructor(
    readonly code: CodeErreur,
    message: string,
  ) {
    super(message);
    this.name = "ErreurFinances";
  }
}
