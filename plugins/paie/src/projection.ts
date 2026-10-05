// Ce que Paie transmet aux autres plugins (docs/24, A.1.6) : des PROJECTIONS qu'on peut régénérer, jamais la vérité. La vérité reste ici
// (missions, réserve, contrats). Chaque projection est un « remplacer » complet d'un groupe `ref` chez Budget ou chez l'Agenda.
import { ajouterJours, type Jour } from "@etabli/ui/civil";
import { RETARD_JOURS_PAIE, detailMission, detailReserve, joursDeMission, paiesContrat } from "./calculs";
import type { Donnees } from "./types";

export type ServiceCible = "budget" | "agenda";

export interface Projection {
  service: ServiceCible;
  /** Groupe chez le destinataire (« mission:m1 »). */
  ref: string;
  /** Arguments sans la clé d'idempotence : `previsions` pour Budget, `evenements` pour l'Agenda. */
  contenu: unknown[];
}

/** Empreinte courte et stable d'un contenu (FNV-1a 32 bits) : sert de clé d'idempotence et à repérer ce qui a changé. */
export function empreinte(valeur: unknown): string {
  const texte = JSON.stringify(valeur);
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const cleDe = (p: Projection): string => `${p.service}|${p.ref}`;

/**
 * Toutes les projections voulues. Une mission ou une période dont le net réel a été saisi (bulletin) n'a plus de prévision attendue chez
 * Budget (une liste vide : le `remplacer` retire l'attendu sans toucher au réalisé).
 */
export function projections(d: Donnees, aujourdhui: Jour): Projection[] {
  const sortie: Projection[] = [];
  const du = ajouterJours(aujourdhui, -RETARD_JOURS_PAIE);
  const au = ajouterJours(aujourdhui, 180);
  for (const m of d.missions) {
    const ref = `mission:${m.id}`;
    const det = detailMission(m, d.reglages);
    sortie.push({
      service: "budget",
      ref,
      contenu: d.bulletins[ref] || !det.datePaiement || det.netCents <= 0 ? [] : [{ montantCents: det.netCents, jour: det.datePaiement, libelle: `${m.libelle} (paie)` }],
    });
    sortie.push({ service: "agenda", ref, contenu: joursDeMission(m).map((jour) => ({ type: "travail", titre: m.libelle, jour, debutMin: m.debutMin, finMin: m.finMin })) });
  }
  for (const r of d.reserves) {
    const ref = `reserve:${r.id}`;
    const det = detailReserve(r, d.reglages);
    sortie.push({
      service: "budget",
      ref,
      contenu: d.bulletins[ref] || !det.datePaiement || det.netCents <= 0 ? [] : [{ montantCents: det.netCents, jour: det.datePaiement, libelle: `${r.libelle} (réserve)` }],
    });
  }
  for (const c of d.contrats) {
    sortie.push({
      service: "budget",
      ref: `contrat:${c.id}`,
      contenu: paiesContrat(c, d.reglages, du, au).filter((p) => p.netCents > 0).map((p) => ({ montantCents: p.netCents, jour: p.datePaiement, libelle: p.libelle })),
    });
  }
  return sortie;
}
