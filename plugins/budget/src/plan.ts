// Lecture du plan enregistré dans les réglages du plugin. Règle de sécurité (cahier de bord, point 6) : « rien d'enregistré » donne un
// plan vide, mais des données PRÉSENTES et illisibles sont une erreur, jamais un plan vide : l'appelant écraserait les vraies données.
import { ajouterJours, comparerJours, type Jour } from "@etabli/ui/civil";
import { HORIZON_JOURS, RETARD_JOURS, echeances } from "./calculs";
import {
  ErreurBudget,
  PERIODICITES,
  SCHEMA,
  STATUTS,
  type Abonnement,
  type Enveloppe,
  type Plan,
  type Prevision,
  type ReponseMemorisee,
  type Virement,
} from "./types";
import { choix, identifiant, identifiantFacultatif, jourValide, montant, montantPositif, objet, texte } from "./validation";

/** Taille maximale du plan : le moteur plafonne les réglages d'un plugin à 5 Mio, on garde de la marge. */
export const LIMITE_OCTETS = 3_500_000;
export const AVERTISSEMENT_OCTETS = 2_800_000;
export const CLES_GARDEES = 50;
/** Source des prévisions que Budget produit lui-même à partir des virements et des abonnements. */
export const BUDGET = "@budget";

export const planVide = (): Plan => ({ schema: SCHEMA, suivant: 1, previsions: [], virements: [], abonnements: [], enveloppes: [], seuilCents: 0, cles: {} });
export const octetsDe = (p: Plan): number => JSON.stringify(p).length;

/** Une prévision demandée par un plugin ou l'écran : sans identifiant, source ni statut. */
export interface BrouillonPrevision {
  compteId: string | null;
  montantCents: number;
  jour: Jour;
  categorieId: string | null;
  libelle: string;
}

export function lireBrouillonPrevision(brut: unknown, nom = "prevision"): BrouillonPrevision {
  const o = objet(brut, ["montantCents", "jour", "libelle"], ["compteId", "categorieId"]);
  const cents = montant(o.montantCents, `${nom}.montantCents`);
  if (cents === 0) throw new ErreurBudget("argument_invalide", `« ${nom}.montantCents » ne peut pas être nul.`);
  return {
    compteId: identifiantFacultatif(o.compteId, `${nom}.compteId`),
    montantCents: cents,
    jour: jourValide(o.jour, `${nom}.jour`),
    categorieId: identifiantFacultatif(o.categorieId, `${nom}.categorieId`),
    libelle: texte(o.libelle, `${nom}.libelle`, 200),
  };
}

const lireSource = (brut: unknown) => {
  const s = objet(brut, ["plugin", "ref"]);
  return { plugin: texte(s.plugin, "source.plugin", 80), ref: texte(s.ref, "source.ref", 80) };
};

function lirePrevision(brut: unknown): Prevision {
  const o = objet(brut, ["id", "jour", "montantCents", "compteId", "categorieId", "libelle", "source", "statut", "ecritureId"]);
  if (typeof o.id !== "string" || !/^p[1-9]\d{0,9}$/.test(o.id)) throw new ErreurBudget("illisible", "Identifiant de prévision illisible.");
  return {
    id: o.id,
    jour: jourValide(o.jour, "jour"),
    montantCents: montant(o.montantCents, "montantCents"),
    compteId: identifiantFacultatif(o.compteId, "compteId"),
    categorieId: identifiantFacultatif(o.categorieId, "categorieId"),
    libelle: texte(o.libelle, "libelle", 200),
    source: lireSource(o.source),
    statut: choix(o.statut, "statut", STATUTS),
    ecritureId: identifiantFacultatif(o.ecritureId, "ecritureId"),
  };
}

export function lireVirement(brut: unknown, avecId: boolean): Omit<Virement, "id"> & { id?: string } {
  const o = objet(brut, ["libelle", "montantCents", "compteSourceId", "compteCibleId", "jour"], avecId ? ["id", "repetition"] : ["repetition"]);
  const jour = jourValide(o.jour, "jour");
  const compteSourceId = identifiant(o.compteSourceId, "compteSourceId");
  const compteCibleId = identifiant(o.compteCibleId, "compteCibleId");
  if (compteSourceId === compteCibleId) throw new ErreurBudget("argument_invalide", "Un virement va d'un compte vers un AUTRE compte.");
  let repetition: Virement["repetition"] = null;
  if (o.repetition !== undefined && o.repetition !== null) {
    const r = objet(o.repetition, ["frequence", "jusquau"]);
    const jusquau = jourValide(r.jusquau, "repetition.jusquau");
    if (comparerJours(jusquau, jour) < 0) throw new ErreurBudget("argument_invalide", "« repetition.jusquau » ne peut pas précéder le premier jour.");
    repetition = { frequence: choix(r.frequence, "repetition.frequence", ["semaine", "mois"] as const), jusquau };
  }
  return { ...(avecId ? { id: String(o.id) } : {}), libelle: texte(o.libelle, "libelle", 120), montantCents: montantPositif(o.montantCents, "montantCents"), compteSourceId, compteCibleId, jour, repetition };
}

export function lireAbonnement(brut: unknown, avecId: boolean): Omit<Abonnement, "id"> & { id?: string } {
  const o = objet(brut, ["libelle", "montantCents", "periodicite", "jour"], avecId ? ["id", "compteId", "categorieId", "aResilier"] : ["compteId", "categorieId", "aResilier"]);
  if (o.aResilier !== undefined && typeof o.aResilier !== "boolean") throw new ErreurBudget("argument_invalide", "« aResilier » doit être vrai ou faux.");
  return {
    ...(avecId ? { id: String(o.id) } : {}),
    libelle: texte(o.libelle, "libelle", 120),
    montantCents: montantPositif(o.montantCents, "montantCents"),
    compteId: identifiantFacultatif(o.compteId, "compteId"),
    categorieId: identifiantFacultatif(o.categorieId, "categorieId"),
    periodicite: choix(o.periodicite, "periodicite", PERIODICITES),
    jour: jourValide(o.jour, "jour"),
    aResilier: o.aResilier === true,
  };
}

function lireEnveloppe(brut: unknown): Enveloppe {
  const o = objet(brut, ["categorieId", "plafondCents"]);
  return { categorieId: identifiant(o.categorieId, "categorieId"), plafondCents: montantPositif(o.plafondCents, "plafondCents") };
}

function lireCles(brut: unknown): Record<string, ReponseMemorisee[]> {
  if (brut === null || typeof brut !== "object" || Array.isArray(brut)) throw new ErreurBudget("illisible", "Clés d'idempotence illisibles.");
  const sortie: Record<string, ReponseMemorisee[]> = {};
  for (const [plugin, liste] of Object.entries(brut)) {
    if (!Array.isArray(liste)) throw new ErreurBudget("illisible", "Clés d'idempotence illisibles.");
    sortie[plugin] = liste.map((x) => {
      const o = objet(x, ["cle", "ids"]);
      if (typeof o.cle !== "string" || !Array.isArray(o.ids) || o.ids.some((i) => typeof i !== "string")) throw new ErreurBudget("illisible", "Clé d'idempotence illisible.");
      return { cle: o.cle, ids: o.ids as string[] };
    });
  }
  return sortie;
}

function liste<T>(brut: unknown, nom: string, lire: (x: unknown) => T): T[] {
  if (!Array.isArray(brut)) throw new ErreurBudget("illisible", `Liste « ${nom} » illisible.`);
  return brut.map(lire);
}

/** Plan enregistré → plan validé. `null`/`undefined` (rien d'enregistré) → plan vide ; tout autre écart → `ErreurBudget("illisible")`. */
export function lirePlan(enregistre: unknown): Plan {
  if (enregistre === null || enregistre === undefined) return planVide();
  try {
    const o = objet(enregistre, ["schema", "suivant", "previsions", "virements", "abonnements", "enveloppes", "seuilCents", "cles"]);
    if (o.schema !== SCHEMA) throw new ErreurBudget("illisible", `Version de plan inconnue : ${String(o.schema)} (ce plugin lit la version ${SCHEMA}).`);
    if (typeof o.suivant !== "number" || !Number.isSafeInteger(o.suivant) || o.suivant < 1) throw new ErreurBudget("illisible", "Compteur illisible.");
    const previsions = liste(o.previsions, "previsions", lirePrevision);
    const virements = liste(o.virements, "virements", (x) => {
      const v = lireVirement(x, true);
      if (typeof v.id !== "string" || !/^v[1-9]\d{0,9}$/.test(v.id)) throw new ErreurBudget("illisible", "Identifiant de virement illisible.");
      return v as Virement;
    });
    const abonnements = liste(o.abonnements, "abonnements", (x) => {
      const a = lireAbonnement(x, true);
      if (typeof a.id !== "string" || !/^a[1-9]\d{0,9}$/.test(a.id)) throw new ErreurBudget("illisible", "Identifiant d'abonnement illisible.");
      return a as Abonnement;
    });
    const numeros = [...previsions, ...virements, ...abonnements].map((x) => Number(x.id.slice(1)));
    if (numeros.some((n) => n >= (o.suivant as number))) throw new ErreurBudget("illisible", "Numérotation incohérente.");
    return { schema: SCHEMA, suivant: o.suivant, previsions, virements, abonnements, enveloppes: liste(o.enveloppes, "enveloppes", lireEnveloppe), seuilCents: montant(o.seuilCents, "seuilCents"), cles: lireCles(o.cles) };
  } catch (e) {
    if (e instanceof ErreurBudget && e.code === "illisible") throw e;
    throw new ErreurBudget("illisible", `Le plan du budget est illisible (${e instanceof Error ? e.message : "erreur inconnue"}). Rien n'a été modifié.`);
  }
}

// ——— Échéances des virements et abonnements ———

/**
 * Crée les prévisions manquantes des virements et abonnements, de `aujourdhui − 31 jours` à `aujourdhui + 180 jours`. Une échéance déjà
 * présente (quel que soit son statut : attendue, réalisée, abandonnée) n'est jamais recréée : on ne ressuscite pas ce que l'utilisateur
 * a abandonné. Rend le MÊME objet s'il n'y a rien à ajouter.
 */
export function synchroniser(plan: Plan, aujourdhui: Jour): Plan {
  const du = ajouterJours(aujourdhui, -RETARD_JOURS);
  const au = ajouterJours(aujourdhui, HORIZON_JOURS);
  const nouvelles: Prevision[] = [];
  let suivant = plan.suivant;
  const existe = (ref: string, jour: Jour, signe: 1 | -1, compteId: string | null) =>
    plan.previsions.some((p) => p.source.plugin === BUDGET && p.source.ref === ref && p.jour === jour && Math.sign(p.montantCents) === signe && p.compteId === compteId);
  const ajouterPrevision = (ref: string, jour: Jour, montantCents: number, compteId: string | null, categorieId: string | null, libelle: string) => {
    if (existe(ref, jour, montantCents < 0 ? -1 : 1, compteId)) return;
    nouvelles.push({ id: `p${suivant++}`, jour, montantCents, compteId, categorieId, libelle, source: { plugin: BUDGET, ref }, statut: "attendue", ecritureId: null });
  };
  for (const v of plan.virements) {
    for (const jour of echeances(v.jour, v.repetition ? v.repetition.frequence : "unique", v.repetition?.jusquau ?? null, du, au)) {
      ajouterPrevision(`virement:${v.id}`, jour, -v.montantCents, v.compteSourceId, null, `${v.libelle} (sortie)`);
      ajouterPrevision(`virement:${v.id}`, jour, v.montantCents, v.compteCibleId, null, `${v.libelle} (entrée)`);
    }
  }
  for (const a of plan.abonnements) {
    for (const jour of echeances(a.jour, a.periodicite, null, du, au)) ajouterPrevision(`abonnement:${a.id}`, jour, -a.montantCents, a.compteId, a.categorieId, a.libelle);
  }
  return nouvelles.length === 0 ? plan : { ...plan, suivant, previsions: [...plan.previsions, ...nouvelles] };
}
