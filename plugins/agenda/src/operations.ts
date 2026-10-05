// Écritures sur le carnet. Chaque opération rend un NOUVEAU carnet (l'ancien n'est jamais modifié : en cas de refus rien n'est écrit).
// Espace propre (docs/24, A.1.3) : un plugin appelant ne touche qu'aux événements qu'il a posés ; l'utilisateur (propriétaire) touche à tout.
import { CLES_GARDEES, EVENEMENTS_MAX_PAR_PLUGIN, LIMITE_OCTETS, lireReglages, octetsDe, type Brouillon } from "./carnet";
import { ErreurAgenda, UTILISATEUR, type Carnet, type Evenement, type Reglages } from "./types";

export interface Contexte {
  /** Plugin appelant (imposé par le moteur) ou `UTILISATEUR`. */
  appelant: string;
  /** Vrai seulement pour l'écran de l'agenda : peut modifier n'importe quel événement. */
  proprietaire: boolean;
}

export interface Resultat<T> {
  valeur: T;
  carnet: Carnet;
}

function verifierTaille(c: Carnet): Carnet {
  if (octetsDe(c) > LIMITE_OCTETS) {
    throw new ErreurAgenda("limite_atteinte", "L'agenda est plein (3,5 Mo). Supprimez d'anciens événements ; rien n'a été enregistré.");
  }
  return c;
}

const possede = (e: Evenement, ctx: Contexte): boolean => ctx.proprietaire || e.source.plugin === ctx.appelant;

function verifierQuota(evenements: readonly Evenement[], appelant: string): void {
  const n = evenements.filter((e) => e.source.plugin === appelant).length;
  if (n > EVENEMENTS_MAX_PAR_PLUGIN) {
    throw new ErreurAgenda("limite_atteinte", `« ${appelant} » a ${n} événements : au plus ${EVENEMENTS_MAX_PAR_PLUGIN} par plugin.`);
  }
}

/** Ajoute un événement (écran de l'agenda ou plugin appelant). */
export function ajouter(c: Carnet, b: Brouillon, ctx: Contexte, ref = "ui"): Resultat<{ id: string }> {
  const numero = c.dernierNumero + 1;
  const e: Evenement = { id: `e${numero}`, ...b, source: { plugin: ctx.appelant, ref } };
  const evenements = [...c.evenements, e];
  verifierQuota(evenements, ctx.appelant);
  return { valeur: { id: e.id }, carnet: verifierTaille({ ...c, evenements, dernierNumero: numero }) };
}

export function modifier(c: Carnet, id: string, b: Brouillon, ctx: Contexte): Resultat<{ id: string }> {
  const ancien = c.evenements.find((e) => e.id === id);
  if (!ancien) throw new ErreurAgenda("introuvable", `Événement « ${id} » introuvable.`);
  if (!possede(ancien, ctx)) throw new ErreurAgenda("permission_refusee", `L'événement « ${id} » appartient à « ${ancien.source.plugin} ».`);
  const evenements = c.evenements.map((e) => (e.id === id ? { id, ...b, source: e.source } : e));
  return { valeur: { id }, carnet: verifierTaille({ ...c, evenements }) };
}

export function supprimer(c: Carnet, id: string, ctx: Contexte): Resultat<{ supprimes: number }> {
  const ancien = c.evenements.find((e) => e.id === id);
  if (!ancien) throw new ErreurAgenda("introuvable", `Événement « ${id} » introuvable.`);
  if (!possede(ancien, ctx)) throw new ErreurAgenda("permission_refusee", `L'événement « ${id} » appartient à « ${ancien.source.plugin} ».`);
  return { valeur: { supprimes: 1 }, carnet: { ...c, evenements: c.evenements.filter((e) => e.id !== id) } };
}

/**
 * `evenements.remplacer` : tous les événements de (appelant, ref) sont remplacés par la liste donnée. Rejouer la même `cle` ne crée pas
 * de doublon : la réponse mémorisée est rendue telle quelle, le carnet ne change pas.
 */
export function remplacer(c: Carnet, ref: string, brouillons: readonly Brouillon[], cle: string, ctx: Contexte): Resultat<{ ids: string[]; rejoue: boolean }> {
  const vue = (c.cles[ctx.appelant] ?? []).find((m) => m.cle === cle);
  if (vue) return { valeur: { ids: vue.ids, rejoue: true }, carnet: c };
  let numero = c.dernierNumero;
  const nouveaux: Evenement[] = brouillons.map((b) => ({ id: `e${++numero}`, ...b, source: { plugin: ctx.appelant, ref } }));
  const gardes = c.evenements.filter((e) => !(e.source.plugin === ctx.appelant && e.source.ref === ref));
  const evenements = [...gardes, ...nouveaux];
  verifierQuota(evenements, ctx.appelant);
  const ids = nouveaux.map((e) => e.id);
  const memoire = [...(c.cles[ctx.appelant] ?? []), { cle, ids }].slice(-CLES_GARDEES);
  return { valeur: { ids, rejoue: false }, carnet: verifierTaille({ ...c, evenements, dernierNumero: numero, cles: { ...c.cles, [ctx.appelant]: memoire } }) };
}

/** `evenements.supprimer` : retire les événements de (appelant, ref). Naturellement idempotent. */
export function supprimerGroupe(c: Carnet, ref: string, ctx: Contexte): Resultat<{ supprimes: number }> {
  const restants = c.evenements.filter((e) => !(e.source.plugin === ctx.appelant && e.source.ref === ref));
  const supprimes = c.evenements.length - restants.length;
  return { valeur: { supprimes }, carnet: supprimes === 0 ? c : { ...c, evenements: restants } };
}

export function reglerHoraires(c: Carnet, brut: unknown): Carnet {
  const reglages: Reglages = lireReglages(brut);
  return { ...c, reglages };
}

export { UTILISATEUR };
