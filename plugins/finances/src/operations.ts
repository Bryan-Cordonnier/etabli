// Les quatre écritures du registre (créer un compte, une catégorie, ajouter une écriture, annuler une écriture). Chaque fonction reçoit
// le registre COURANT et renvoie un registre neuf plus la valeur de réponse ; elle ne modifie jamais son argument. Même code pour le
// service (un autre plugin appelle) et pour l'interface de Finances (l'utilisateur saisit) : un seul cerveau.
//
// Idempotence : `cle` est unique par (source, type d'objet). Rejouer le même appel renvoie le même identifiant (`rejoue: true`) sans rien
// créer ; la même clé avec d'autres données est un refus (une clé qui sert deux fois est une erreur de l'appelant).
import { ajouter } from "@etabli/ui/money";
import { jourDeInstant, type Jour } from "@etabli/ui/civil";
import { MAX_CATEGORIES, MAX_COMPTES, verifierTaille } from "./registre";
import { soldeCompte } from "./calculs";
import { ErreurFinances, SENS, TYPES_COMPTE, type Categorie, type Compte, type Ecriture, type Registre } from "./types";
import { choix, cle, identifiant, instant, jourValide, montant, objet, texte, texteFacultatif } from "./validation";

export interface Contexte {
  /** Plugin appelant, écrit par le moteur (ou « @utilisateur »). */
  appelant: string;
  /** Instant courant (ms UTC) : injecté pour pouvoir tester. */
  maintenant: number;
  /** L'utilisateur, dans l'interface de Finances, peut annuler n'importe quelle écriture ; un plugin seulement les siennes. */
  proprietaire?: boolean;
}

export interface Resultat<T> {
  registre: Registre;
  valeur: T;
}

export interface Rejoue {
  id: string;
  rejoue: boolean;
}

const JOUR_MIN: Jour = "2000-01-01";
const UN_JOUR = 86_400_000;

function conflit(quoi: string): never {
  throw new ErreurFinances("argument_invalide", `Cette clé a déjà servi pour ${quoi} différent${quoi.startsWith("une ") ? "e" : ""} : une clé d'idempotence identifie un seul appel.`);
}

function nouvelId(reg: Registre, prefixe: "c" | "k" | "e"): [string, number] {
  return [`${prefixe}${reg.suivant}`, reg.suivant + 1];
}

function enregistrer(reg: Registre): Registre {
  verifierTaille(reg);
  return reg;
}

export function creerCompte(reg: Registre, brut: unknown, ctx: Contexte): Resultat<Rejoue> {
  const a = objet(brut, ["nom", "type", "soldeInitialCents", "cle"], ["ouvertLe"]);
  const nom = texte(a.nom, "nom", 80);
  const type = choix(a.type, "type", TYPES_COMPTE);
  const solde = montant(a.soldeInitialCents, "soldeInitialCents");
  const k = cle(a.cle);
  const ouvertLe = a.ouvertLe === undefined ? jourDeInstant(ctx.maintenant, { fuseau: reg.fuseau }) : jourValide(a.ouvertLe, "ouvertLe");
  if (ouvertLe < JOUR_MIN) throw new ErreurFinances("argument_invalide", "« ouvertLe » : pas avant le 1er janvier 2000.");

  const deja = reg.comptes.find((c) => c.source === ctx.appelant && c.cle === k);
  if (deja) {
    if (deja.nom !== nom || deja.type !== type || deja.soldeInitialCents !== solde || (a.ouvertLe !== undefined && deja.ouvertLe !== ouvertLe)) conflit("un compte");
    return { registre: reg, valeur: { id: deja.id, rejoue: true } };
  }
  if (reg.comptes.length >= MAX_COMPTES) throw new ErreurFinances("limite_atteinte", `Au plus ${MAX_COMPTES} comptes.`);
  if (reg.comptes.some((c) => c.nom.toLocaleLowerCase("fr") === nom.toLocaleLowerCase("fr"))) {
    throw new ErreurFinances("argument_invalide", `Un compte « ${nom} » existe déjà.`);
  }
  const [id, suivant] = nouvelId(reg, "c");
  const compte: Compte = { id, nom, type, soldeInitialCents: solde, ouvertLe, archive: false, source: ctx.appelant, cle: k };
  return { registre: enregistrer({ ...reg, suivant, comptes: [...reg.comptes, compte] }), valeur: { id, rejoue: false } };
}

export function creerCategorie(reg: Registre, brut: unknown, ctx: Contexte): Resultat<Rejoue> {
  const a = objet(brut, ["nom", "sens", "cle"], ["parentId", "couleur"]);
  const nom = texte(a.nom, "nom", 60);
  const sens = choix(a.sens, "sens", SENS);
  const k = cle(a.cle);
  const parentId = a.parentId === undefined || a.parentId === null ? null : identifiant(a.parentId, "parentId");
  const couleur = a.couleur === undefined || a.couleur === null ? null : texte(a.couleur, "couleur", 7);
  if (couleur !== null && !/^#[0-9a-fA-F]{6}$/.test(couleur)) throw new ErreurFinances("argument_invalide", "« couleur » doit être de la forme #rrggbb.");

  const deja = reg.categories.find((c) => c.source === ctx.appelant && c.cle === k);
  if (deja) {
    if (deja.nom !== nom || deja.sens !== sens || deja.parentId !== parentId) conflit("une catégorie");
    return { registre: reg, valeur: { id: deja.id, rejoue: true } };
  }
  if (parentId !== null) {
    const parent = reg.categories.find((c) => c.id === parentId);
    if (!parent) throw new ErreurFinances("introuvable", `Catégorie parente « ${parentId} » introuvable.`);
    if (parent.parentId !== null) throw new ErreurFinances("argument_invalide", "Une catégorie n'a que deux niveaux : le parent ne peut pas avoir de parent.");
  }
  if (reg.categories.length >= MAX_CATEGORIES) throw new ErreurFinances("limite_atteinte", `Au plus ${MAX_CATEGORIES} catégories.`);
  if (reg.categories.some((c) => c.parentId === parentId && c.nom.toLocaleLowerCase("fr") === nom.toLocaleLowerCase("fr"))) {
    throw new ErreurFinances("argument_invalide", `Une catégorie « ${nom} » existe déjà à cet endroit.`);
  }
  const [id, suivant] = nouvelId(reg, "k");
  const categorie: Categorie = { id, nom, parentId, sens, couleur, source: ctx.appelant, cle: k };
  return { registre: enregistrer({ ...reg, suivant, categories: [...reg.categories, categorie] }), valeur: { id, rejoue: false } };
}

/** Solde courant d'un compte après une écriture de plus : refuse de sortir des limites de `money` (±10^12 centimes). */
function verifierSolde(reg: Registre, compte: Compte, delta: number): void {
  try {
    ajouter(soldeCompte(reg, compte, "9999-12-31"), delta);
  } catch {
    throw new ErreurFinances("argument_invalide", "Le solde du compte dépasserait la limite de 10 milliards d'euros.");
  }
}

export function ajouterEcriture(reg: Registre, brut: unknown, ctx: Contexte): Resultat<Rejoue> {
  const a = objet(brut, ["compteId", "montantCents", "quand", "libelle", "cle"], ["categorieId", "ref"]);
  const compteId = identifiant(a.compteId, "compteId");
  const cents = montant(a.montantCents, "montantCents");
  if (cents === 0) throw new ErreurFinances("argument_invalide", "« montantCents » ne peut pas être nul (une écriture déplace de l'argent).");
  const quand = instant(a.quand, "quand");
  const libelle = texte(a.libelle, "libelle", 200);
  const ref = texteFacultatif(a.ref, "ref", 200);
  const categorieId = a.categorieId === undefined || a.categorieId === null ? null : identifiant(a.categorieId, "categorieId");
  const k = cle(a.cle);

  const deja = reg.ecritures.find((e) => e.source === ctx.appelant && e.cle === k && e.annule === null);
  if (deja) {
    if (deja.compteId !== compteId || deja.montantCents !== cents || deja.quand !== quand || deja.libelle !== libelle || deja.categorieId !== categorieId) conflit("une écriture");
    return { registre: reg, valeur: { id: deja.id, rejoue: true } };
  }
  const compte = reg.comptes.find((c) => c.id === compteId);
  if (!compte) throw new ErreurFinances("introuvable", `Compte « ${compteId} » introuvable.`);
  if (compte.archive) throw new ErreurFinances("argument_invalide", `Le compte « ${compte.nom} » est archivé : aucune écriture n'y est permise.`);
  if (categorieId !== null) {
    const categorie = reg.categories.find((c) => c.id === categorieId);
    if (!categorie) throw new ErreurFinances("introuvable", `Catégorie « ${categorieId} » introuvable.`);
    if ((categorie.sens === "entree" && cents < 0) || (categorie.sens === "sortie" && cents > 0)) {
      throw new ErreurFinances("argument_invalide", `La catégorie « ${categorie.nom} » n'accepte que des ${categorie.sens === "entree" ? "entrées" : "sorties"} d'argent.`);
    }
  }
  if (quand > ctx.maintenant + UN_JOUR) throw new ErreurFinances("argument_invalide", "« quand » est dans le futur : Finances ne garde que l'argent réel, ce qui a déjà eu lieu (le prévu va dans Budget).");
  const jour = jourDeInstant(quand, { fuseau: reg.fuseau });
  if (jour < JOUR_MIN) throw new ErreurFinances("argument_invalide", "« quand » : pas avant le 1er janvier 2000.");
  if (jour < compte.ouvertLe) throw new ErreurFinances("argument_invalide", `Le compte « ${compte.nom} » n'existait pas encore le ${jour} (ouvert le ${compte.ouvertLe}).`);
  verifierSolde(reg, compte, cents);

  const [id, suivant] = nouvelId(reg, "e");
  const ecriture: Ecriture = {
    id, compteId, montantCents: cents, quand, fuseau: reg.fuseau, jour, categorieId, libelle,
    source: ctx.appelant, ref, annule: null, motif: null, creeLe: ctx.maintenant, cle: k,
  };
  return { registre: enregistrer({ ...reg, suivant, ecritures: [...reg.ecritures, ecriture] }), valeur: { id, rejoue: false } };
}

/**
 * Annule une écriture par une écriture INVERSE (même compte, même instant, même catégorie, montant opposé) : les soldes de toutes les dates
 * redeviennent ceux d'avant l'erreur. L'original reste dans le registre, l'annulation garde le motif et l'instant réel de sa création.
 */
export function annulerEcriture(reg: Registre, brut: unknown, ctx: Contexte): Resultat<Rejoue> {
  const a = objet(brut, ["id", "motif", "cle"]);
  const id = identifiant(a.id, "id");
  const motif = texte(a.motif, "motif", 200);
  const k = cle(a.cle);

  const rejouee = reg.ecritures.find((e) => e.annule === id && e.source === ctx.appelant && e.cle === k);
  if (rejouee) return { registre: reg, valeur: { id: rejouee.id, rejoue: true } };

  const original = reg.ecritures.find((e) => e.id === id);
  if (!original) throw new ErreurFinances("introuvable", `Écriture « ${id} » introuvable.`);
  if (!ctx.proprietaire && original.source !== ctx.appelant) {
    throw new ErreurFinances("permission_refusee", "Un plugin n'annule que les écritures qu'il a créées lui-même.");
  }
  if (original.annule !== null) throw new ErreurFinances("argument_invalide", "Une annulation ne s'annule pas : ajoutez une nouvelle écriture.");
  if (reg.ecritures.some((e) => e.annule === id)) throw new ErreurFinances("argument_invalide", `L'écriture « ${id} » est déjà annulée.`);
  const compte = reg.comptes.find((c) => c.id === original.compteId);
  if (!compte) throw new ErreurFinances("erreur", `Compte de l'écriture « ${id} » introuvable : registre incohérent.`);
  verifierSolde(reg, compte, -original.montantCents);

  const [nid, suivant] = nouvelId(reg, "e");
  const inverse: Ecriture = {
    id: nid, compteId: original.compteId, montantCents: -original.montantCents, quand: original.quand, fuseau: original.fuseau, jour: original.jour,
    categorieId: original.categorieId, libelle: `Annulation : ${original.libelle}`.slice(0, 200), source: ctx.appelant, ref: original.ref,
    annule: id, motif, creeLe: ctx.maintenant, cle: k,
  };
  return { registre: enregistrer({ ...reg, suivant, ecritures: [...reg.ecritures, inverse] }), valeur: { id: nid, rejoue: false } };
}

