// Ce que montre le tableau de bord, calculé à partir du registre (fonctions pures, testées) : l'écran ne fait que l'afficher.
import { ajouterJours, dernierDuMois, jourDeInstant, localVersInstant, premierDuMois, type Jour } from "@etabli/ui/civil";
import { somme } from "@etabli/ui/money";
import { parseEuros } from "@etabli/ui/money";
import { serieParJour, soldeCompte, totauxParCategorie } from "./calculs";
import { ALERTE_OCTETS, LIMITE_OCTETS, tailleOctets } from "./registre";
import type { Compte, Ecriture, Registre } from "./types";

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « 2026-10-05 » → « 5 oct. ». */
export function jourCourt(j: Jour): string {
  return `${Number(j.slice(8, 10))} ${MOIS[Number(j.slice(5, 7)) - 1]}`;
}

export interface LigneEcriture {
  ecriture: Ecriture;
  compte: string;
  categorie: string;
  /** Écriture déjà annulée par une autre. */
  annulee: boolean;
  /** Peut être annulée (ni annulation, ni déjà annulée). */
  annulable: boolean;
}

export interface VueTableau {
  aujourdhui: Jour;
  soldeTotal: number;
  comptes: { compte: Compte; soldeCents: number }[];
  serie: { jour: Jour; soldeCents: number }[];
  depensesMois: { categorieId: string | null; nom: string; cents: number }[];
  totalDepensesMois: number;
  dernieres: LigneEcriture[];
  octets: number;
  /** Le registre approche de sa limite : proposer d'exporter et de clôturer. */
  presquePlein: boolean;
}

export function vueTableau(reg: Registre, maintenant: number, jours = 90, nombreEcritures = 12): VueTableau {
  const aujourdhui = jourDeInstant(maintenant, { fuseau: reg.fuseau });
  const actifs = reg.comptes.filter((c) => !c.archive);
  const comptes = actifs.map((compte) => ({ compte, soldeCents: soldeCompte(reg, compte, aujourdhui) }));
  const nomCategorie = (id: string | null) => reg.categories.find((c) => c.id === id)?.nom ?? "Sans catégorie";
  const depenses = totauxParCategorie(reg, premierDuMois(aujourdhui), dernierDuMois(aujourdhui), "sortie").map((t) => ({
    categorieId: t.categorieId,
    nom: nomCategorie(t.categorieId),
    cents: -t.cents,
  }));
  const annulees = new Set(reg.ecritures.filter((e) => e.annule !== null).map((e) => e.annule));
  const dernieres = [...reg.ecritures]
    .sort((a, b) => b.quand - a.quand || Number(b.id.slice(1)) - Number(a.id.slice(1)))
    .slice(0, nombreEcritures)
    .map((ecriture) => ({
      ecriture,
      compte: reg.comptes.find((c) => c.id === ecriture.compteId)?.nom ?? ecriture.compteId,
      categorie: ecriture.categorieId ? nomCategorie(ecriture.categorieId) : "",
      annulee: annulees.has(ecriture.id),
      annulable: ecriture.annule === null && !annulees.has(ecriture.id),
    }));
  const octets = tailleOctets(reg);
  return {
    aujourdhui,
    soldeTotal: somme(comptes.map((c) => c.soldeCents)),
    comptes,
    serie: actifs.length ? serieParJour(reg, ajouterJours(aujourdhui, -(jours - 1)), aujourdhui, actifs) : [],
    depensesMois: depenses,
    totalDepensesMois: somme(depenses.map((d) => d.cents)),
    dernieres,
    octets,
    presquePlein: octets >= ALERTE_OCTETS,
  };
}

export const pourcentageUtilise = (octets: number): number => Math.min(100, Math.round((octets * 100) / LIMITE_OCTETS));

export interface Saisie {
  compteId: string;
  sens: "sortie" | "entree";
  montant: string;
  jour: Jour;
  categorieId: string;
  libelle: string;
}

/**
 * Transforme le formulaire de saisie en arguments de `ecritures.ajouter`, ou renvoie une phrase qui dit quoi corriger. Le montant est lu en
 * euros à la française (jamais arrondi : « 12,505 » est refusé). Aujourd'hui : l'instant exact ; un autre jour : midi à Paris.
 */
export function argumentsDeSaisie(s: Saisie, reg: Registre, maintenant: number, cle: string): { args: Record<string, unknown> } | { erreur: string } {
  if (!s.compteId) return { erreur: "Choisissez un compte (créez-en un d'abord)." };
  const cents = parseEuros(s.montant);
  if (cents === null) return { erreur: "Montant illisible : écrivez par exemple 12,50 (deux décimales au plus)." };
  if (cents <= 0) return { erreur: "Le montant doit être supérieur à zéro : le choix « Dépense / Recette » donne le sens." };
  if (s.libelle.trim() === "") return { erreur: "Écrivez un libellé (ce que c'était)." };
  const aujourdhui = jourDeInstant(maintenant, { fuseau: reg.fuseau });
  const quand = s.jour === aujourdhui ? maintenant : localVersInstant(s.jour, 12 * 60, { fuseau: reg.fuseau });
  return {
    args: {
      compteId: s.compteId,
      montantCents: s.sens === "sortie" ? -cents : cents,
      quand,
      libelle: s.libelle.trim(),
      ...(s.categorieId ? { categorieId: s.categorieId } : {}),
      cle,
    },
  };
}
