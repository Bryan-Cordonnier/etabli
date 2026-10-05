// Le service `budget@1` (docs/24, A.1.4) : une fonction pure `executer(enregistre, fonction, args, appelant)`. La page de service
// (service/main.ts) n'y ajoute que la lecture et l'écriture des réglages ; tout le reste se teste ici sans navigateur.
// Un fournisseur ne peut pas appeler un autre service (profondeur 1) : ces fonctions ne touchent qu'au plan de Budget.
import { differenceJours } from "@etabli/ui/civil";
import { FENETRE_MAX_JOURS } from "./calculs";
import { PREVISIONS_PAR_APPEL_MAX, realiserPrevisions, remplacerPrevisions, supprimerPrevisions } from "./operations";
import { lireBrouillonPrevision, lirePlan } from "./plan";
import { ErreurBudget, STATUTS, type Plan, type Prevision } from "./types";
import { choix, cle, identifiant, jourValide, liste, objet, reference, texte } from "./validation";

/** Niveau d'accès de chaque fonction : copie du manifeste, vérifiée par un test (le moteur, lui, lit le manifeste). */
export const FONCTIONS: Record<string, "lecture" | "ecriture"> = {
  "previsions.liste": "lecture",
  "previsions.remplacer": "ecriture",
  "previsions.supprimer": "ecriture",
  "previsions.realiser": "ecriture",
};

/** Prévisions rendues par page. */
export const PAGE_MAX = 1000;

export interface Execution {
  valeur: unknown;
  /** Plan à enregistrer, ou `null` si rien n'a changé (lectures, rejeu d'une clé déjà vue). */
  plan: Plan | null;
}

/** Ce que voit un autre plugin : pas de clé d'idempotence, source aplatie. */
const visible = (p: Prevision) => ({ id: p.id, jour: p.jour, montantCents: p.montantCents, compteId: p.compteId, categorieId: p.categorieId, libelle: p.libelle, source: p.source.plugin, ref: p.source.ref, statut: p.statut, ecritureId: p.ecritureId });
const numero = (p: Prevision): number => Number(p.id.slice(1));

export function executer(enregistre: unknown, fonction: string, args: unknown, appelant: string): Execution {
  if (!Object.hasOwn(FONCTIONS, fonction)) throw new ErreurBudget("introuvable", `Fonction inconnue : « ${fonction} ».`);
  const plan = lirePlan(enregistre);
  const qui = { plugin: appelant };

  switch (fonction) {
    case "previsions.liste": {
      const a = objet(args ?? {}, [], ["du", "au", "compteId", "source", "statut", "curseur"]);
      const du = a.du === undefined ? null : jourValide(a.du, "du");
      const au = a.au === undefined ? null : jourValide(a.au, "au");
      if (du && au) {
        if (differenceJours(du, au) < 0) throw new ErreurBudget("argument_invalide", "« du » doit précéder « au ».");
        if (differenceJours(du, au) + 1 > FENETRE_MAX_JOURS) throw new ErreurBudget("limite_atteinte", `Fenêtre de ${differenceJours(du, au) + 1} jours : au plus ${FENETRE_MAX_JOURS} (5 ans).`);
      }
      const compteId = a.compteId === undefined ? null : identifiant(a.compteId, "compteId");
      const source = a.source === undefined ? null : texte(a.source, "source", 80);
      const statut = a.statut === undefined ? null : choix(a.statut, "statut", STATUTS);
      let debut = 0;
      if (a.curseur !== undefined) {
        const m = typeof a.curseur === "string" ? /^(\d{1,9})$/.exec(a.curseur) : null;
        if (!m) throw new ErreurBudget("argument_invalide", "« curseur » n'est pas un curseur rendu par une page précédente.");
        debut = Number(m[1]);
      }
      const triees = plan.previsions
        .filter((p) => (!du || p.jour >= du) && (!au || p.jour <= au) && (!compteId || p.compteId === compteId) && (!source || p.source.plugin === source) && (!statut || p.statut === statut))
        .sort((x, y) => (x.jour < y.jour ? -1 : x.jour > y.jour ? 1 : numero(x) - numero(y)));
      const page = triees.slice(debut, debut + PAGE_MAX);
      const suite = debut + PAGE_MAX < triees.length ? String(debut + PAGE_MAX) : undefined;
      return { valeur: { previsions: page.map(visible), ...(suite ? { curseur: suite } : {}) }, plan: null };
    }
    case "previsions.remplacer": {
      const a = objet(args, ["ref", "previsions", "cle"]);
      const ref = reference(a.ref, "ref");
      const brouillons = liste(a.previsions, "previsions", (p) => lireBrouillonPrevision(p), PREVISIONS_PAR_APPEL_MAX);
      const r = remplacerPrevisions(plan, qui, ref, brouillons, cle(a.cle));
      return { valeur: r.valeur, plan: r.plan === plan ? null : r.plan };
    }
    case "previsions.supprimer": {
      const r = supprimerPrevisions(plan, qui, reference(objet(args, ["ref"]).ref, "ref"));
      return { valeur: r.valeur, plan: r.plan === plan ? null : r.plan };
    }
    case "previsions.realiser": {
      const a = objet(args, ["ref"], ["jour", "ecritureId"]);
      const r = realiserPrevisions(plan, qui, reference(a.ref, "ref"), a.jour === undefined ? null : jourValide(a.jour, "jour"), a.ecritureId === undefined ? null : identifiant(a.ecritureId, "ecritureId"));
      return { valeur: r.valeur, plan: r.plan === plan ? null : r.plan };
    }
  }
  throw new ErreurBudget("introuvable", `Fonction inconnue : « ${fonction} ».`);
}
