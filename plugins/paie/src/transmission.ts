// Transmission de Paie vers Budget, l'Agenda et Finances. Fonctions pures : l'appelant (`appeler`) est injecté, donc testé sans moteur.
// Règle de conception (docs/24, A.1.7) : un consommateur doit pouvoir être RÉPARÉ EN REJOUANT. La vérité est dans Paie ; les autres plugins
// ne reçoivent que des projections. Un plugin absent n'empêche rien : le calcul et les écrans de Paie restent entiers, et ce qui n'a pas pu
// partir est compté « non transmis » jusqu'à la prochaine ouverture.
import type { Jour } from "@etabli/ui/civil";
import { enregistrerBulletin } from "./donnees";
import { cleDe, empreinte, projections } from "./projection";
import type { Donnees } from "./types";

export type Cible = "budget" | "agenda" | "finances";
export type Reponse<T = unknown> = { ok: true; valeur: T } | { ok: false; code: string; message: string };
export type Appeler = (service: Cible, fonction: string, args: unknown) => Promise<Reponse>;

/** Codes qui veulent dire « ce plugin n'est pas utilisable maintenant » (pas une erreur de Paie). */
const INDISPONIBLE = new Set(["service_absent", "contrat_incompatible", "permission_refusee", "delai_depasse", "occupe"]);

export interface Rapport {
  /** Projections déjà à jour chez le destinataire (rien à envoyer). */
  aJour: number;
  /** Projections envoyées à cet appel. */
  envoyees: number;
  /** Projections qui n'ont pas pu partir (destinataire absent ou occupé) : à rejouer. */
  enAttente: number;
  /** Destinataires indisponibles, avec la phrase à montrer. */
  indisponibles: { service: Cible; message: string }[];
  /** Refus de fond d'un destinataire (argument invalide…) : un défaut à corriger, pas à rejouer. */
  erreurs: { ref: string; service: Cible; message: string }[];
}

export function messageIndisponible(service: Cible, code: string): string {
  const nom = service === "budget" ? "Budget" : service === "agenda" ? "l'Agenda" : "Finances";
  switch (code) {
    case "service_absent":
      return `Installez ${nom} pour y voir vos paies : tout le reste de Paie fonctionne sans.`;
    case "contrat_incompatible":
      return `La version de ${nom} ne correspond pas à cette version de Paie : mettez l'un des deux à jour.`;
    case "permission_refusee":
      return `Paie n'a pas la permission d'utiliser ${nom}. Réinstallez-la pour accepter ses permissions.`;
    default:
      return `${nom} ne répond pas pour l'instant : Paie réessaiera à la prochaine ouverture.`;
  }
}

const fonctionDe = { budget: "previsions", agenda: "evenements" } as const;

/**
 * Envoie à Budget et à l'Agenda ce qui a changé depuis la dernière transmission réussie, et retire ce qui n'existe plus. Rend les données
 * avec le suivi `transmis` mis à jour (à enregistrer) et un rapport. Ne jette jamais : toute erreur est dans le rapport.
 */
export async function transmettre(d: Donnees, aujourdhui: Jour, appeler: Appeler): Promise<{ donnees: Donnees; rapport: Rapport }> {
  const rapport: Rapport = { aJour: 0, envoyees: 0, enAttente: 0, indisponibles: [], erreurs: [] };
  const transmis = { ...d.transmis };
  const absents = new Set<Cible>();
  const voulues = projections(d, aujourdhui);
  const marquer = (service: Cible, code: string) => {
    if (!absents.has(service)) rapport.indisponibles.push({ service, message: messageIndisponible(service, code) });
    absents.add(service);
  };

  for (const p of voulues) {
    const cle = cleDe(p);
    const h = empreinte(p.contenu);
    if (transmis[cle] === h) {
      rapport.aJour++;
      continue;
    }
    if (absents.has(p.service)) {
      rapport.enAttente++;
      continue;
    }
    const base = fonctionDe[p.service];
    const r = await appeler(p.service, `${base}.remplacer`, { ref: p.ref, [base]: p.contenu, cle: `${p.ref}@${h}` });
    if (r.ok) {
      transmis[cle] = h;
      rapport.envoyees++;
    } else if (INDISPONIBLE.has(r.code)) {
      marquer(p.service, r.code);
      rapport.enAttente++;
    } else {
      rapport.erreurs.push({ ref: p.ref, service: p.service, message: r.message });
    }
  }

  // Ce qui a été transmis mais n'existe plus (mission supprimée) : on retire le groupe chez le destinataire.
  const voulu = new Set(voulues.map(cleDe));
  for (const cle of Object.keys(transmis)) {
    if (voulu.has(cle)) continue;
    const [service, ref] = cle.split("|") as [Cible, string];
    if (absents.has(service)) {
      rapport.enAttente++;
      continue;
    }
    const r = await appeler(service, `${fonctionDe[service as "budget" | "agenda"]}.supprimer`, { ref });
    if (r.ok) delete transmis[cle];
    else if (INDISPONIBLE.has(r.code)) {
      marquer(service, r.code);
      rapport.enAttente++;
    } else rapport.erreurs.push({ ref, service, message: r.message });
  }
  return { donnees: { ...d, transmis }, rapport };
}

export interface SaisieNetRecu {
  /** `mission:m1` ou `reserve:r2`. */
  ref: string;
  netCents: number;
  /** Jour où l'argent est arrivé. */
  jour: Jour;
  /** Compte de Finances qui l'a reçu (obligatoire pour écrire dans Finances). */
  compteId: string | null;
  libelle: string;
  /** Jour prévu du paiement chez Budget : retrouve la prévision à marquer réalisée. */
  jourPrevu: Jour | null;
}

/**
 * Le net réel est arrivé. Dans l'ordre : (1) écriture dans Finances (idempotente), (2) prévision de Budget marquée réalisée, (3) bulletin
 * enregistré dans Paie, ce qui retire l'attendu de Budget à toute transmission future. Finances absent : le bulletin est quand même
 * enregistré (Paie dit ce qui a été reçu) et l'écriture reste à faire — le rapport le dit.
 */
export async function saisirNetRecu(d: Donnees, s: SaisieNetRecu, appeler: Appeler, maintenant: number): Promise<{ donnees: Donnees; avertissements: string[] }> {
  const avertissements: string[] = [];
  let ecritureId: string | null = null;
  if (s.compteId) {
    const quand = Math.min(Date.parse(`${s.jour}T12:00:00Z`), maintenant);
    const r = await appeler("finances", "ecritures.ajouter", { compteId: s.compteId, montantCents: s.netCents, quand, libelle: s.libelle, ref: s.ref, cle: `paie-${s.ref}-${s.jour}` });
    if (r.ok) ecritureId = (r.valeur as { id?: string }).id ?? null;
    else avertissements.push(r.code === "service_absent" ? messageIndisponible("finances", r.code) : `Finances a refusé l'écriture : ${r.message}`);
  } else {
    avertissements.push("Aucun compte choisi : le net est noté dans Paie mais pas ajouté dans Finances.");
  }
  if (s.jourPrevu) {
    const r = await appeler("budget", "previsions.realiser", { ref: s.ref, jour: s.jourPrevu, ...(ecritureId ? { ecritureId } : {}) });
    if (!r.ok && r.code !== "service_absent") avertissements.push(`Budget n'a pas pu marquer la prévision réalisée : ${r.message}`);
  }
  return { donnees: enregistrerBulletin(d, s.ref, { netCents: s.netCents, jour: s.jour, ecritureId }), avertissements };
}
