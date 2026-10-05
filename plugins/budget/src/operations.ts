// Écritures sur le plan. Chaque opération rend un NOUVEAU plan (l'ancien n'est jamais modifié : en cas de refus rien n'est écrit).
// Espace propre (docs/24, A.1.3) : un plugin appelant ne touche qu'aux prévisions qu'il a posées ; l'utilisateur (propriétaire) touche à tout.
import { CLES_GARDEES, LIMITE_OCTETS, BUDGET, lireAbonnement, lireVirement, octetsDe, synchroniser, type BrouillonPrevision } from "./plan";
import { ErreurBudget, UTILISATEUR, type Abonnement, type Plan, type Prevision, type Virement } from "./types";
import { identifiant } from "./validation";
import type { Jour } from "@etabli/ui/civil";

export const PREVISIONS_MAX_PAR_PLUGIN = 5000;
export const PREVISIONS_PAR_APPEL_MAX = 500;
export const VIREMENTS_MAX = 200;
export const ABONNEMENTS_MAX = 200;
export const ENVELOPPES_MAX = 200;

function verifierTaille(p: Plan): Plan {
  if (octetsDe(p) > LIMITE_OCTETS) throw new ErreurBudget("limite_atteinte", "Le budget est plein (3,5 Mo). Supprimez d'anciennes prévisions réalisées ; rien n'a été enregistré.");
  return p;
}

function verifierQuota(previsions: readonly Prevision[], plugin: string): void {
  const n = previsions.filter((p) => p.source.plugin === plugin).length;
  if (n > PREVISIONS_MAX_PAR_PLUGIN) throw new ErreurBudget("limite_atteinte", `« ${plugin} » a ${n} prévisions : au plus ${PREVISIONS_MAX_PAR_PLUGIN} par plugin.`);
}

const retirerAttendues = (previsions: readonly Prevision[], ref: string, plugin: string): Prevision[] =>
  previsions.filter((p) => !(p.source.plugin === plugin && p.source.ref === ref && p.statut === "attendue"));

// ——— Prévisions de l'utilisateur ———

export function ajouterPrevision(plan: Plan, b: BrouillonPrevision): { id: string; plan: Plan } {
  const id = `p${plan.suivant}`;
  const p: Prevision = { id, ...b, source: { plugin: UTILISATEUR, ref: "ui" }, statut: "attendue", ecritureId: null };
  return { id, plan: verifierTaille({ ...plan, suivant: plan.suivant + 1, previsions: [...plan.previsions, p] }) };
}

function changerStatut(plan: Plan, id: string, statut: "realisee" | "abandonnee", ecritureId: string | null): Plan {
  const p = plan.previsions.find((x) => x.id === id);
  if (!p) throw new ErreurBudget("introuvable", `Prévision « ${id} » introuvable.`);
  if (p.statut !== "attendue") throw new ErreurBudget("argument_invalide", `La prévision « ${id} » est déjà ${p.statut === "realisee" ? "réalisée" : "abandonnée"}.`);
  return { ...plan, previsions: plan.previsions.map((x) => (x.id === id ? { ...x, statut, ecritureId } : x)) };
}

export const abandonner = (plan: Plan, id: string): Plan => changerStatut(plan, id, "abandonnee", null);
export const realiser = (plan: Plan, id: string, ecritureId: string | null): Plan => changerStatut(plan, id, "realisee", ecritureId === null ? null : identifiant(ecritureId, "ecritureId"));

// ——— Virements ———

export function creerVirement(plan: Plan, brut: unknown, aujourdhui: Jour): { id: string; plan: Plan } {
  if (plan.virements.length >= VIREMENTS_MAX) throw new ErreurBudget("limite_atteinte", `Au plus ${VIREMENTS_MAX} virements.`);
  const id = `v${plan.suivant}`;
  const v = { id, ...lireVirement(brut, false) } as Virement;
  return { id, plan: verifierTaille(synchroniser({ ...plan, suivant: plan.suivant + 1, virements: [...plan.virements, v] }, aujourdhui)) };
}

/** Retire le virement et ses échéances encore attendues ; ce qui est réalisé ou abandonné reste (historique). */
export function supprimerVirement(plan: Plan, id: string): Plan {
  if (!plan.virements.some((v) => v.id === id)) throw new ErreurBudget("introuvable", `Virement « ${id} » introuvable.`);
  return { ...plan, virements: plan.virements.filter((v) => v.id !== id), previsions: retirerAttendues(plan.previsions, `virement:${id}`, BUDGET) };
}

// ——— Abonnements ———

export function creerAbonnement(plan: Plan, brut: unknown, aujourdhui: Jour): { id: string; plan: Plan } {
  if (plan.abonnements.length >= ABONNEMENTS_MAX) throw new ErreurBudget("limite_atteinte", `Au plus ${ABONNEMENTS_MAX} abonnements.`);
  const id = `a${plan.suivant}`;
  const a = { id, ...lireAbonnement(brut, false) } as Abonnement;
  return { id, plan: verifierTaille(synchroniser({ ...plan, suivant: plan.suivant + 1, abonnements: [...plan.abonnements, a] }, aujourdhui)) };
}

export function supprimerAbonnement(plan: Plan, id: string): Plan {
  if (!plan.abonnements.some((a) => a.id === id)) throw new ErreurBudget("introuvable", `Abonnement « ${id} » introuvable.`);
  return { ...plan, abonnements: plan.abonnements.filter((a) => a.id !== id), previsions: retirerAttendues(plan.previsions, `abonnement:${id}`, BUDGET) };
}

export function marquerAResilier(plan: Plan, id: string, aResilier: boolean): Plan {
  if (!plan.abonnements.some((a) => a.id === id)) throw new ErreurBudget("introuvable", `Abonnement « ${id} » introuvable.`);
  return { ...plan, abonnements: plan.abonnements.map((a) => (a.id === id ? { ...a, aResilier } : a)) };
}

// ——— Enveloppes et seuil ———

/** Fixe le plafond mensuel d'une catégorie ; un plafond nul ou absent retire l'enveloppe. */
export function fixerEnveloppe(plan: Plan, categorieId: string, plafondCents: number | null): Plan {
  const id = identifiant(categorieId, "categorieId");
  const sans = plan.enveloppes.filter((e) => e.categorieId !== id);
  if (plafondCents === null || plafondCents === 0) return { ...plan, enveloppes: sans };
  if (!Number.isSafeInteger(plafondCents) || plafondCents < 0) throw new ErreurBudget("argument_invalide", "Le plafond doit être un nombre entier de centimes, positif.");
  if (sans.length >= ENVELOPPES_MAX) throw new ErreurBudget("limite_atteinte", `Au plus ${ENVELOPPES_MAX} enveloppes.`);
  return { ...plan, enveloppes: [...sans, { categorieId: id, plafondCents }] };
}

export function fixerSeuil(plan: Plan, seuilCents: number): Plan {
  if (!Number.isSafeInteger(seuilCents) || Math.abs(seuilCents) > 1e12) throw new ErreurBudget("argument_invalide", "Le seuil doit être un nombre entier de centimes.");
  return { ...plan, seuilCents };
}

// ——— Service : prévisions posées par un autre plugin ———

export interface Appelant {
  plugin: string;
}

/**
 * `previsions.remplacer` : toutes les prévisions ATTENDUES de (appelant, ref) sont remplacées. Ce qui est déjà réalisé ou abandonné
 * reste. Rejouer la même `cle` ne crée pas de doublon : la réponse mémorisée est rendue telle quelle, le plan ne change pas.
 */
export function remplacerPrevisions(plan: Plan, appelant: Appelant, ref: string, brouillons: readonly BrouillonPrevision[], cle: string): { valeur: { ids: string[]; rejoue: boolean }; plan: Plan } {
  const vue = (plan.cles[appelant.plugin] ?? []).find((m) => m.cle === cle);
  if (vue) return { valeur: { ids: vue.ids, rejoue: true }, plan };
  let suivant = plan.suivant;
  const nouvelles: Prevision[] = brouillons.map((b) => ({ id: `p${suivant++}`, ...b, source: { plugin: appelant.plugin, ref }, statut: "attendue", ecritureId: null }));
  const previsions = [...retirerAttendues(plan.previsions, ref, appelant.plugin), ...nouvelles];
  verifierQuota(previsions, appelant.plugin);
  const ids = nouvelles.map((p) => p.id);
  const memoire = [...(plan.cles[appelant.plugin] ?? []), { cle, ids }].slice(-CLES_GARDEES);
  return { valeur: { ids, rejoue: false }, plan: verifierTaille({ ...plan, suivant, previsions, cles: { ...plan.cles, [appelant.plugin]: memoire } }) };
}

/** `previsions.supprimer` : retire les prévisions attendues de (appelant, ref). Naturellement idempotent. */
export function supprimerPrevisions(plan: Plan, appelant: Appelant, ref: string): { valeur: { supprimees: number }; plan: Plan } {
  const restantes = retirerAttendues(plan.previsions, ref, appelant.plugin);
  const supprimees = plan.previsions.length - restantes.length;
  return { valeur: { supprimees }, plan: supprimees === 0 ? plan : { ...plan, previsions: restantes } };
}

/**
 * `previsions.realiser` : marque comme réalisées les prévisions attendues de (appelant, ref), ou seulement celles d'un `jour`.
 * `ecritureId` relie à l'écriture réelle de Finances (utile pour une seule prévision).
 */
export function realiserPrevisions(plan: Plan, appelant: Appelant, ref: string, jour: Jour | null, ecritureId: string | null): { valeur: { realisees: number }; plan: Plan } {
  let realisees = 0;
  const previsions = plan.previsions.map((p) => {
    if (p.source.plugin !== appelant.plugin || p.source.ref !== ref || p.statut !== "attendue" || (jour !== null && p.jour !== jour)) return p;
    realisees++;
    return { ...p, statut: "realisee" as const, ecritureId };
  });
  return { valeur: { realisees }, plan: realisees === 0 ? plan : { ...plan, previsions } };
}
