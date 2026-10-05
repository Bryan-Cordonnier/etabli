// Le service `finances@1` (docs/24, A.1.4) : une fonction pure `executer(enregistre, fonction, args, appelant, maintenant)`. La page de
// service (service/main.ts) n'y ajoute que la lecture et l'écriture des réglages ; tout le reste se teste ici sans navigateur.
import { differenceJours, type Jour } from "@etabli/ui/civil";
import { FENETRE_MAX_JOURS, PAGE_MAX, parOrdre, serieParJour, soldesALaDate, totauxParCategorie } from "./calculs";
import { ajouterEcriture, annulerEcriture, creerCategorie, creerCompte, type Contexte, type Resultat } from "./operations";
import { lireRegistre } from "./registre";
import { ErreurFinances, type Categorie, type Compte, type Ecriture, type Registre } from "./types";
import { choix, identifiant, jourValide, liste, objet, texte } from "./validation";

/** Niveau d'accès de chaque fonction : copie du manifeste, vérifiée par un test (le moteur, lui, lit le manifeste). */
export const FONCTIONS: Record<string, "lecture" | "ecriture"> = {
  "comptes.liste": "lecture",
  "categories.liste": "lecture",
  "ecritures.liste": "lecture",
  "soldes.aLaDate": "lecture",
  "serie.parJour": "lecture",
  "totaux.parCategorie": "lecture",
  "comptes.creer": "ecriture",
  "categories.creer": "ecriture",
  "ecritures.ajouter": "ecriture",
  "ecritures.annuler": "ecriture",
};

export interface Execution {
  valeur: unknown;
  /** Registre à enregistrer, ou `null` si rien n'a changé (lectures, rejeu d'une clé déjà vue). */
  registre: Registre | null;
}

const compteVisible = ({ cle: _cle, ...c }: Compte) => c;
const categorieVisible = ({ cle: _cle, ...c }: Categorie) => c;
const ecritureVisible = ({ cle: _cle, ...e }: Ecriture) => e;

function comptesChoisis(reg: Registre, ids: unknown): Compte[] {
  if (ids === undefined) return reg.comptes;
  return liste(ids, "comptes", (x) => identifiant(x, "comptes"), 200).map((id) => {
    const c = reg.comptes.find((k) => k.id === id);
    if (!c) throw new ErreurFinances("introuvable", `Compte « ${id} » introuvable.`);
    return c;
  });
}

function fenetre(a: Record<string, unknown>): [Jour, Jour] {
  const du = jourValide(a.du, "du");
  const au = jourValide(a.au, "au");
  if (differenceJours(du, au) < 0) throw new ErreurFinances("argument_invalide", "« du » doit précéder « au ».");
  if (differenceJours(du, au) + 1 > FENETRE_MAX_JOURS) {
    throw new ErreurFinances("limite_atteinte", `Fenêtre de ${differenceJours(du, au) + 1} jours : au plus ${FENETRE_MAX_JOURS} (5 ans).`);
  }
  return [du, au];
}

function ecrire<T>(r: Resultat<T>, avant: Registre): Execution {
  return { valeur: r.valeur, registre: r.registre === avant ? null : r.registre };
}

/** Exécute une fonction du service (`proprietaire` : seulement l'interface de Finances, jamais la page de service). Lève `ErreurFinances` (code permis à un fournisseur) pour tout refus. */
export function executer(enregistre: unknown, fonction: string, args: unknown, appelant: string, maintenant: number, proprietaire = false): Execution {
  if (!Object.hasOwn(FONCTIONS, fonction)) throw new ErreurFinances("introuvable", `Fonction inconnue : « ${fonction} ».`);
  const reg = lireRegistre(enregistre);
  const ctx: Contexte = { appelant, maintenant, proprietaire };
  const lire = (valeur: unknown): Execution => ({ valeur, registre: null });

  switch (fonction) {
    case "comptes.liste":
      objet(args ?? {}, []);
      return lire(reg.comptes.map(compteVisible));
    case "categories.liste":
      objet(args ?? {}, []);
      return lire(reg.categories.map(categorieVisible));
    case "ecritures.liste": {
      const a = objet(args ?? {}, [], ["du", "au", "compteId", "categorieId", "source", "curseur"]);
      const du = a.du === undefined ? null : jourValide(a.du, "du");
      const au = a.au === undefined ? null : jourValide(a.au, "au");
      if (du && au) fenetre({ du, au });
      const compteId = a.compteId === undefined ? null : identifiant(a.compteId, "compteId");
      if (compteId && !reg.comptes.some((c) => c.id === compteId)) throw new ErreurFinances("introuvable", `Compte « ${compteId} » introuvable.`);
      const categorieId = a.categorieId === undefined ? null : identifiant(a.categorieId, "categorieId");
      const source = a.source === undefined ? null : texte(a.source, "source", 80);
      let apres: [number, number] | null = null;
      if (a.curseur !== undefined) {
        const m = typeof a.curseur === "string" ? /^(\d{1,16}):(\d{1,9})$/.exec(a.curseur) : null;
        if (!m) throw new ErreurFinances("argument_invalide", "« curseur » n'est pas un curseur rendu par une page précédente.");
        apres = [Number(m[1]), Number(m[2])];
      }
      const triees = reg.ecritures
        .filter((e) => (!du || e.jour >= du) && (!au || e.jour <= au) && (!compteId || e.compteId === compteId) && (!categorieId || e.categorieId === categorieId) && (!source || e.source === source))
        .sort(parOrdre);
      const debut = apres ? triees.findIndex((e) => e.quand > apres[0] || (e.quand === apres[0] && Number(e.id.slice(1)) > apres[1])) : 0;
      const page = debut < 0 ? [] : triees.slice(debut, debut + PAGE_MAX);
      const suite = debut >= 0 && debut + PAGE_MAX < triees.length ? page[page.length - 1] : undefined;
      return lire({ ecritures: page.map(ecritureVisible), ...(suite ? { curseur: `${suite.quand}:${suite.id.slice(1)}` } : {}) });
    }
    case "soldes.aLaDate": {
      const a = objet(args, ["jour"], ["comptes"]);
      return lire(soldesALaDate(reg, jourValide(a.jour, "jour"), comptesChoisis(reg, a.comptes)));
    }
    case "serie.parJour": {
      const a = objet(args, ["du", "au"], ["comptes"]);
      const [du, au] = fenetre(a);
      return lire(serieParJour(reg, du, au, comptesChoisis(reg, a.comptes)));
    }
    case "totaux.parCategorie": {
      const a = objet(args, ["du", "au"], ["sens"]);
      const [du, au] = fenetre(a);
      const sens = a.sens === undefined ? undefined : choix(a.sens, "sens", ["entree", "sortie"] as const);
      return lire(totauxParCategorie(reg, du, au, sens));
    }
    case "comptes.creer":
      return ecrire(creerCompte(reg, args, ctx), reg);
    case "categories.creer":
      return ecrire(creerCategorie(reg, args, ctx), reg);
    case "ecritures.ajouter":
      return ecrire(ajouterEcriture(reg, args, ctx), reg);
    case "ecritures.annuler":
      return ecrire(annulerEcriture(reg, args, ctx), reg);
    default:
      throw new ErreurFinances("introuvable", `Fonction inconnue : « ${fonction} ».`);
  }
}
