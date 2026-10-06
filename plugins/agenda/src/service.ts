// Les services `agenda@1` et `rappels@1` (docs/24, A.1.5) : une fonction pure `executer(enregistre, fonction, args, appelant, maintenant)`. La page de
// service (service/main.ts) n'y ajoute que la lecture et l'écriture des réglages et l'échange avec le moteur pour les rappels ; tout le reste se
// teste ici sans navigateur.
import type { RemindersResult } from "@etabli/sdk";
import { differenceJours } from "@etabli/ui/civil";
import { FENETRE_MAX_JOURS, OCCURRENCES_MAX, occurrences, plagesOccupees } from "./calculs";
import { lireBrouillon, lireCarnet } from "./carnet";
import { remplacer, supprimerGroupe, type Contexte } from "./operations";
import { annulerRappels, groupeValide, lireRappels, remplacerRappels, rappelsPourLeMoteur } from "./rappels";
import { ErreurAgenda, TYPES_EVENEMENT, type Carnet } from "./types";
import { choix, cle, jourValide, liste, objet, reference } from "./validation";

/** Niveau d'accès des fonctions du service `agenda` : copie du manifeste, vérifiée par un test (le moteur, lui, lit le manifeste). */
export const FONCTIONS: Record<string, "lecture" | "ecriture"> = {
  "evenements.liste": "lecture",
  "plages.occupees": "lecture",
  "evenements.remplacer": "ecriture",
  "evenements.supprimer": "ecriture",
};

/** Idem pour le service `rappels` (l'Agenda en est le seul fournisseur : il détient la permission `notifications`). */
export const FONCTIONS_RAPPELS: Record<string, "lecture" | "ecriture"> = {
  "rappels.remplacer": "ecriture",
  "rappels.annuler": "ecriture",
  "rappels.etat": "lecture",
};

/** Événements posés d'un coup par un plugin. */
export const EVENEMENTS_PAR_APPEL_MAX = 500;

export interface Execution {
  valeur: unknown;
  /** Carnet à enregistrer, ou `null` si rien n'a changé (lectures, rejeu d'une clé déjà vue). */
  carnet: Carnet | null;
  /** Le carnet tel qu'il est après l'appel (celui à enregistrer, ou celui qui a été lu). */
  courant: Carnet;
  /**
   * Échange à faire avec le moteur (page de service seulement) : `programmer` = envoyer la liste COMPLÈTE des rappels au téléphone,
   * `etat` = lire les autorisations. `null` pour tout le reste.
   */
  hote: "programmer" | "etat" | null;
}

function fenetre(a: Record<string, unknown>) {
  const du = jourValide(a.du, "du");
  const au = jourValide(a.au, "au");
  if (differenceJours(du, au) < 0) throw new ErreurAgenda("argument_invalide", "« du » doit précéder « au ».");
  const jours = differenceJours(du, au) + 1;
  if (jours > FENETRE_MAX_JOURS) throw new ErreurAgenda("limite_atteinte", `Fenêtre de ${jours} jours : au plus ${FENETRE_MAX_JOURS} (5 ans).`);
  return { du, au };
}

/** Exécute une fonction des services. Lève `ErreurAgenda` (code permis à un fournisseur) pour tout refus. `maintenant` : instant UTC en ms. */
export function executer(enregistre: unknown, fonction: string, args: unknown, appelant: string, maintenant: number = Date.now()): Execution {
  if (!Object.hasOwn(FONCTIONS, fonction) && !Object.hasOwn(FONCTIONS_RAPPELS, fonction)) throw new ErreurAgenda("introuvable", `Fonction inconnue : « ${fonction} ».`);
  const carnet = lireCarnet(enregistre);
  const ctx: Contexte = { appelant, proprietaire: false };
  const lecture = (valeur: unknown): Execution => ({ valeur, carnet: null, courant: carnet, hote: null });
  const ecriture = (valeur: unknown, suivant: Carnet, hote: Execution["hote"] = null): Execution => ({
    valeur,
    carnet: suivant === carnet ? null : suivant,
    courant: suivant,
    hote: suivant === carnet ? null : hote,
  });

  switch (fonction) {
    case "evenements.liste": {
      const a = objet(args, ["du", "au"], ["types"]);
      const { du, au } = fenetre(a);
      const types = a.types === undefined ? undefined : liste(a.types, "types", (t) => choix(t, "types", TYPES_EVENEMENT), TYPES_EVENEMENT.length);
      const occ = occurrences(carnet.evenements, du, au, types);
      if (occ.length > OCCURRENCES_MAX) throw new ErreurAgenda("limite_atteinte", `Plus de ${OCCURRENCES_MAX} occurrences dans cette fenêtre : réduisez-la.`);
      return lecture(occ);
    }
    case "plages.occupees": {
      const { du, au } = fenetre(objet(args, ["du", "au"]));
      const occ = occurrences(carnet.evenements, du, au);
      if (occ.length > OCCURRENCES_MAX) throw new ErreurAgenda("limite_atteinte", `Plus de ${OCCURRENCES_MAX} occurrences dans cette fenêtre : réduisez-la.`);
      return lecture(plagesOccupees(occ));
    }
    case "evenements.remplacer": {
      const a = objet(args, ["ref", "evenements", "cle"]);
      const ref = reference(a.ref, "ref");
      const brouillons = liste(a.evenements, "evenements", (e) => lireBrouillon(e), EVENEMENTS_PAR_APPEL_MAX);
      const r = remplacer(carnet, ref, brouillons, cle(a.cle), ctx);
      // Un événement avec trajet change les rappels de l'Agenda lui-même (« pars maintenant ») : on renvoie la liste complète au téléphone.
      return ecriture(r.valeur, r.carnet, "programmer");
    }
    case "evenements.supprimer": {
      const a = objet(args, ["ref"]);
      const r = supprimerGroupe(carnet, reference(a.ref, "ref"), ctx);
      return ecriture(r.valeur, r.carnet, "programmer");
    }
    case "rappels.remplacer": {
      const a = objet(args, ["groupe", "rappels", "cle"]);
      const groupe = groupeValide(a.groupe);
      const rappels = lireRappels(a.rappels, maintenant);
      const r = remplacerRappels(carnet, appelant, groupe, rappels, cle(a.cle));
      // Même rejouée (rien de changé dans le carnet), la demande est renvoyée au téléphone : c'est la réponse « programmes » qui compte.
      return { valeur: r.valeur, carnet: r.carnet === carnet ? null : r.carnet, courant: r.carnet, hote: "programmer" };
    }
    case "rappels.annuler": {
      const r = annulerRappels(carnet, appelant, groupeValide(objet(args, ["groupe"]).groupe));
      return ecriture(r.valeur, r.carnet, "programmer");
    }
    case "rappels.etat":
      objet(args ?? {}, []);
      return { valeur: {}, carnet: null, courant: carnet, hote: "etat" };
  }
  throw new ErreurAgenda("introuvable", `Fonction inconnue : « ${fonction} ».`);
}

/**
 * Réponse finale d'un appel qui a parlé au moteur. Jamais bloquante : refus des notifications par l'utilisateur ou PC (« téléphone seulement »)
 * ne sont pas des erreurs — l'appelant reçoit `programmes: 0` et la `raison`, et garde ses rappels pour plus tard.
 */
export function reponseRappels(e: Execution, fonction: string, resultat: RemindersResult | null, maintenant: number): unknown {
  // Les fonctions d'événements renvoient ce que dit leur contrat ; le renvoi des rappels au téléphone est un effet de bord silencieux.
  if (e.hote === null || resultat === null || fonction.startsWith("evenements.")) return e.valeur;
  const total = rappelsPourLeMoteur(e.courant, maintenant).length;
  if (fonction === "rappels.etat") {
    if (resultat.ok) return { autorise: resultat.autorise, alarmeExacte: resultat.alarmeExacte, jusquau: resultat.jusquau, total };
    return { autorise: false, alarmeExacte: false, jusquau: null, total, raison: resultat.code, message: resultat.message };
  }
  const base = e.valeur as Record<string, unknown>;
  if (resultat.ok) return { ...base, programmes: resultat.programmes, jusquau: resultat.jusquau, ...(resultat.autorise ? {} : { raison: "notifications_refusees" }) };
  return { ...base, programmes: 0, jusquau: null, raison: resultat.code, ...(resultat.code === "erreur" ? { message: resultat.message } : {}) };
}
