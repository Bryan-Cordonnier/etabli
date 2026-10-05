// Lecture du carnet enregistré dans les réglages du plugin. Règle de sécurité (cahier de bord, point 6) : « rien d'enregistré » donne un
// carnet vide, mais des données PRÉSENTES et illisibles sont une erreur, jamais un carnet vide : l'appelant écraserait les vraies données.
import { ajouterAns, comparerJours, type Jour } from "@etabli/ui/civil";
import { choix, entier, jourValide, objet, texte, texteFacultatif } from "./validation";
import {
  ErreurAgenda,
  FREQUENCES,
  REGLAGES_DEFAUT,
  TYPES_EVENEMENT,
  type Carnet,
  type Evenement,
  type Repetition,
  type Reglages,
  type ReponseMemorisee,
} from "./types";

/** Taille maximale du carnet : le moteur plafonne les réglages d'un plugin à 5 Mio, on garde de la marge. */
export const LIMITE_OCTETS = 3_500_000;
/** Seuil d'avertissement dans l'écran. */
export const AVERTISSEMENT_OCTETS = 2_800_000;
export const EVENEMENTS_MAX_PAR_PLUGIN = 2000;
export const CLES_GARDEES = 50;

export const carnetVide = (): Carnet => ({ schema: 1, evenements: [], reglages: { ...REGLAGES_DEFAUT }, dernierNumero: 0, cles: {} });

export const octetsDe = (c: Carnet): number => JSON.stringify(c).length;

const BORNES_REGLAGES: Record<keyof Reglages, [number, number]> = {
  margeArriveeMin: [0, 240],
  miseEnRouteMin: [0, 240],
  preparationMin: [0, 480],
  sommeilMin: [0, 960],
  endormissementMin: [0, 240],
  majorationTrajetBp: [0, 20_000],
};

export function lireReglages(brut: unknown): Reglages {
  const cles = Object.keys(BORNES_REGLAGES);
  const o = objet(brut, cles);
  const r = {} as Reglages;
  for (const k of Object.keys(BORNES_REGLAGES) as (keyof Reglages)[]) {
    const [min, max] = BORNES_REGLAGES[k];
    r[k] = entier(o[k], k, min, max);
  }
  return r;
}

export function lireRepetition(brut: unknown, premier: Jour): Repetition {
  const o = objet(brut, ["frequence", "jusquau"]);
  const frequence = choix(o.frequence, "repetition.frequence", FREQUENCES);
  const jusquau = jourValide(o.jusquau, "repetition.jusquau");
  if (comparerJours(jusquau, premier) < 0) throw new ErreurAgenda("argument_invalide", "« repetition.jusquau » ne peut pas précéder le premier jour.");
  if (comparerJours(jusquau, ajouterAns(premier, 5)) > 0) throw new ErreurAgenda("limite_atteinte", "Une répétition dure 5 ans au plus.");
  return { frequence, jusquau };
}

export interface Brouillon {
  type: Evenement["type"];
  titre: string;
  lieu: string | null;
  jour: Jour;
  debutMin: number;
  finMin: number;
  trajetMin: number | null;
  repetition: Repetition | null;
}

/** Un événement tel que le demandent l'écran ou un autre plugin (sans identifiant ni source). */
export function lireBrouillon(brut: unknown, nom = "evenement"): Brouillon {
  const o = objet(brut, ["type", "titre", "jour", "debutMin", "finMin"], ["lieu", "trajetMin", "repetition"]);
  const jour = jourValide(o.jour, `${nom}.jour`);
  const debutMin = entier(o.debutMin, `${nom}.debutMin`, 0, 1439);
  const finMin = entier(o.finMin, `${nom}.finMin`, 0, 1439);
  if (debutMin === finMin) throw new ErreurAgenda("argument_invalide", `« ${nom} » : début et fin sont identiques (durée nulle). Une fin plus petite que le début passe minuit.`);
  return {
    type: choix(o.type, `${nom}.type`, TYPES_EVENEMENT),
    titre: texte(o.titre, `${nom}.titre`, 120),
    lieu: texteFacultatif(o.lieu, `${nom}.lieu`, 200),
    jour,
    debutMin,
    finMin,
    trajetMin: o.trajetMin === undefined || o.trajetMin === null ? null : entier(o.trajetMin, `${nom}.trajetMin`, 0, 600),
    repetition: o.repetition === undefined || o.repetition === null ? null : lireRepetition(o.repetition, jour),
  };
}

function lireEvenement(brut: unknown): Evenement {
  const o = objet(brut, ["id", "type", "titre", "lieu", "jour", "debutMin", "finMin", "trajetMin", "repetition", "source"]);
  const id = typeof o.id === "string" && /^e[1-9]\d{0,9}$/.test(o.id) ? o.id : null;
  if (!id) throw new ErreurAgenda("illisible", "Identifiant d'événement illisible.");
  const s = objet(o.source, ["plugin", "ref"]);
  const { id: _id, source: _source, ...contenu } = o;
  return { id, ...lireBrouillon(contenu), source: { plugin: texte(s.plugin, "source.plugin", 80), ref: texte(s.ref, "source.ref", 80) } };
}

function lireCles(brut: unknown): Record<string, ReponseMemorisee[]> {
  if (brut === null || typeof brut !== "object" || Array.isArray(brut)) throw new ErreurAgenda("illisible", "Clés d'idempotence illisibles.");
  const sortie: Record<string, ReponseMemorisee[]> = {};
  for (const [plugin, liste] of Object.entries(brut)) {
    if (!Array.isArray(liste)) throw new ErreurAgenda("illisible", "Clés d'idempotence illisibles.");
    sortie[plugin] = liste.map((x) => {
      const o = objet(x, ["cle", "ids"]);
      if (typeof o.cle !== "string" || !Array.isArray(o.ids) || o.ids.some((i) => typeof i !== "string")) throw new ErreurAgenda("illisible", "Clé d'idempotence illisible.");
      return { cle: o.cle, ids: o.ids as string[] };
    });
  }
  return sortie;
}

/** Carnet enregistré → carnet validé. `null`/`undefined` (rien d'enregistré) → carnet vide ; tout autre écart → `ErreurAgenda("illisible")`. */
export function lireCarnet(enregistre: unknown): Carnet {
  if (enregistre === null || enregistre === undefined) return carnetVide();
  try {
    const o = objet(enregistre, ["schema", "evenements", "reglages", "dernierNumero", "cles"]);
    if (o.schema !== 1) throw new ErreurAgenda("illisible", `Version de carnet inconnue : ${String(o.schema)} (cet agenda lit la version 1).`);
    if (!Array.isArray(o.evenements)) throw new ErreurAgenda("illisible", "Liste d'événements illisible.");
    const evenements = o.evenements.map(lireEvenement);
    const dernierNumero = entier(o.dernierNumero, "dernierNumero", 0, 2_000_000_000);
    if (evenements.some((e) => Number(e.id.slice(1)) > dernierNumero)) throw new ErreurAgenda("illisible", "Numérotation des événements incohérente.");
    return { schema: 1, evenements, reglages: lireReglages(o.reglages), dernierNumero, cles: lireCles(o.cles) };
  } catch (e) {
    if (e instanceof ErreurAgenda && e.code === "illisible") throw e;
    throw new ErreurAgenda("illisible", `Le carnet de l'agenda est illisible (${e instanceof Error ? e.message : "erreur inconnue"}). Rien n'a été modifié.`);
  }
}
