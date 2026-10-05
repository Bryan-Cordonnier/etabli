// Le service `agenda@1` (docs/24, A.1.5) : une fonction pure `executer(enregistre, fonction, args, appelant)`. La page de service
// (service/main.ts) n'y ajoute que la lecture et l'écriture des réglages ; tout le reste se teste ici sans navigateur.
import { differenceJours } from "@etabli/ui/civil";
import { FENETRE_MAX_JOURS, OCCURRENCES_MAX, occurrences, plagesOccupees } from "./calculs";
import { lireBrouillon, lireCarnet } from "./carnet";
import { remplacer, supprimerGroupe, type Contexte } from "./operations";
import { ErreurAgenda, TYPES_EVENEMENT, type Carnet } from "./types";
import { choix, cle, jourValide, liste, objet, reference } from "./validation";

/** Niveau d'accès de chaque fonction : copie du manifeste, vérifiée par un test (le moteur, lui, lit le manifeste). */
export const FONCTIONS: Record<string, "lecture" | "ecriture"> = {
  "evenements.liste": "lecture",
  "plages.occupees": "lecture",
  "evenements.remplacer": "ecriture",
  "evenements.supprimer": "ecriture",
};

/** Événements posés d'un coup par un plugin. */
export const EVENEMENTS_PAR_APPEL_MAX = 500;

export interface Execution {
  valeur: unknown;
  /** Carnet à enregistrer, ou `null` si rien n'a changé (lectures, rejeu d'une clé déjà vue). */
  carnet: Carnet | null;
}

function fenetre(a: Record<string, unknown>) {
  const du = jourValide(a.du, "du");
  const au = jourValide(a.au, "au");
  if (differenceJours(du, au) < 0) throw new ErreurAgenda("argument_invalide", "« du » doit précéder « au ».");
  const jours = differenceJours(du, au) + 1;
  if (jours > FENETRE_MAX_JOURS) throw new ErreurAgenda("limite_atteinte", `Fenêtre de ${jours} jours : au plus ${FENETRE_MAX_JOURS} (5 ans).`);
  return { du, au };
}

/** Exécute une fonction du service. Lève `ErreurAgenda` (code permis à un fournisseur) pour tout refus. */
export function executer(enregistre: unknown, fonction: string, args: unknown, appelant: string): Execution {
  if (!Object.hasOwn(FONCTIONS, fonction)) throw new ErreurAgenda("introuvable", `Fonction inconnue : « ${fonction} ».`);
  const carnet = lireCarnet(enregistre);
  const ctx: Contexte = { appelant, proprietaire: false };

  switch (fonction) {
    case "evenements.liste": {
      const a = objet(args, ["du", "au"], ["types"]);
      const { du, au } = fenetre(a);
      const types = a.types === undefined ? undefined : liste(a.types, "types", (t) => choix(t, "types", TYPES_EVENEMENT), TYPES_EVENEMENT.length);
      const occ = occurrences(carnet.evenements, du, au, types);
      if (occ.length > OCCURRENCES_MAX) throw new ErreurAgenda("limite_atteinte", `Plus de ${OCCURRENCES_MAX} occurrences dans cette fenêtre : réduisez-la.`);
      return { valeur: occ, carnet: null };
    }
    case "plages.occupees": {
      const { du, au } = fenetre(objet(args, ["du", "au"]));
      const occ = occurrences(carnet.evenements, du, au);
      if (occ.length > OCCURRENCES_MAX) throw new ErreurAgenda("limite_atteinte", `Plus de ${OCCURRENCES_MAX} occurrences dans cette fenêtre : réduisez-la.`);
      return { valeur: plagesOccupees(occ), carnet: null };
    }
    case "evenements.remplacer": {
      const a = objet(args, ["ref", "evenements", "cle"]);
      const ref = reference(a.ref, "ref");
      const brouillons = liste(a.evenements, "evenements", (e) => lireBrouillon(e), EVENEMENTS_PAR_APPEL_MAX);
      const r = remplacer(carnet, ref, brouillons, cle(a.cle), ctx);
      return { valeur: r.valeur, carnet: r.carnet === carnet ? null : r.carnet };
    }
    case "evenements.supprimer": {
      const a = objet(args, ["ref"]);
      const r = supprimerGroupe(carnet, reference(a.ref, "ref"), ctx);
      return { valeur: r.valeur, carnet: r.carnet === carnet ? null : r.carnet };
    }
  }
  throw new ErreurAgenda("introuvable", `Fonction inconnue : « ${fonction} ».`);
}
