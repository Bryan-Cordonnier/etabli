// Données de Paie : lecture stricte, saisies validées, opérations. Règle de sécurité (cahier de bord, point 6) : « rien d'enregistré » donne des
// données vides, mais des données PRÉSENTES et illisibles sont une erreur, jamais des données vides : on écraserait les vraies paies.
import { comparerJours, differenceJours, type Jour } from "@etabli/ui/civil";
import {
  ErreurPaie,
  type Bulletin,
  REGLAGES_DEFAUT,
  SCHEMA,
  type Contrat,
  type Donnees,
  type Mission,
  type PeriodeReserve,
  type Reglages,
  type TypeContrat,
} from "./types";
import { choix, entier, jourValide, liste, montant, objet, texte } from "./validation";

export const LIMITE_OCTETS = 3_500_000;
export const MISSIONS_MAX = 500;
export const RESERVES_MAX = 200;
export const CONTRATS_MAX = 50;
/** Une mission dure 400 jours au plus (au-delà, c'est un contrat). */
export const MISSION_MAX_JOURS = 400;

export const donneesVides = (): Donnees => ({ schema: SCHEMA, suivant: 1, reglages: { ...REGLAGES_DEFAUT }, missions: [], reserves: [], contrats: [], transmis: {}, bulletins: {} });
export const octetsDe = (d: Donnees): number => JSON.stringify(d).length;

const BORNES: Record<keyof Reglages, [number, number]> = {
  cotisationsBp: [0, 6000],
  ifmBp: [0, 3000],
  cpBp: [0, 3000],
  seuilSemaineMin: [0, 60 * 60],
  majorationSup1Bp: [0, 20_000],
  majorationSup2Bp: [0, 20_000],
  seuilSup1Min: [0, 40 * 60],
  delaiPaieJours: [0, 90],
  tarifReserveCents: [0, 1_000_000],
  indemniteHorsBaseCents: [0, 1_000_000],
  precariteBp: [0, 3000],
  cpCddBp: [0, 3000],
};

export function lireReglages(brut: unknown): Reglages {
  const o = objet(brut, Object.keys(BORNES));
  const r = {} as Reglages;
  for (const k of Object.keys(BORNES) as (keyof Reglages)[]) r[k] = entier(o[k], k, BORNES[k][0], BORNES[k][1]);
  return r;
}

function joursUniques(v: unknown, nom: string, max: number): Jour[] {
  const jours = liste(v, nom, (x) => jourValide(x, nom), max);
  if (new Set(jours).size !== jours.length) throw new ErreurPaie("argument_invalide", `« ${nom} » contient un jour en double.`);
  return jours;
}

export function lireMission(brut: unknown, avecId: boolean): Omit<Mission, "id"> & { id?: string } {
  const o = objet(brut, ["libelle", "debut", "fin", "joursSemaine", "debutMin", "finMin", "pauseMin", "tauxHoraireCents", "statut"], avecId ? ["id", "exclusions", "supplementaires"] : ["exclusions", "supplementaires"]);
  const debut = jourValide(o.debut, "debut");
  const fin = jourValide(o.fin, "fin");
  if (comparerJours(fin, debut) < 0) throw new ErreurPaie("argument_invalide", "La mission ne peut pas finir avant de commencer.");
  if (differenceJours(debut, fin) + 1 > MISSION_MAX_JOURS) throw new ErreurPaie("limite_atteinte", `Une mission dure ${MISSION_MAX_JOURS} jours au plus.`);
  const joursSemaine = liste(o.joursSemaine, "joursSemaine", (x) => entier(x, "joursSemaine", 1, 7), 7);
  if (joursSemaine.length === 0 || new Set(joursSemaine).size !== joursSemaine.length) throw new ErreurPaie("argument_invalide", "Choisissez au moins un jour de la semaine, sans doublon.");
  const debutMin = entier(o.debutMin, "debutMin", 0, 1439);
  const finMin = entier(o.finMin, "finMin", 0, 1439);
  if (debutMin === finMin) throw new ErreurPaie("argument_invalide", "Début et fin identiques (durée nulle). Une fin plus petite que le début passe minuit.");
  const supplementaires = liste(o.supplementaires ?? [], "supplementaires", (x) => {
    const s = objet(x, ["jour", "minutes"]);
    const jour = jourValide(s.jour, "supplementaires.jour");
    if (comparerJours(jour, debut) < 0 || comparerJours(jour, fin) > 0) throw new ErreurPaie("argument_invalide", `Le jour supplémentaire ${jour} est hors de la mission.`);
    return { jour, minutes: entier(s.minutes, "supplementaires.minutes", 1, 720) };
  }, 100);
  return {
    ...(avecId ? { id: String(o.id) } : {}),
    libelle: texte(o.libelle, "libelle", 120),
    debut,
    fin,
    joursSemaine: [...joursSemaine].sort((a, b) => a - b),
    exclusions: joursUniques(o.exclusions ?? [], "exclusions", MISSION_MAX_JOURS),
    debutMin,
    finMin,
    pauseMin: entier(o.pauseMin, "pauseMin", 0, 480),
    tauxHoraireCents: montant(o.tauxHoraireCents, "tauxHoraireCents", 1),
    statut: choix(o.statut, "statut", ["prevu", "confirme"] as const),
    supplementaires,
  };
}

export function lireReserve(brut: unknown, avecId: boolean): Omit<PeriodeReserve, "id"> & { id?: string } {
  const o = objet(brut, ["libelle", "jours", "horsBase"], avecId ? ["id"] : []);
  return { ...(avecId ? { id: String(o.id) } : {}), libelle: texte(o.libelle, "libelle", 120), jours: joursUniques(o.jours, "jours", 366), horsBase: entier(o.horsBase, "horsBase", 0, 366) };
}

export function lireContrat(brut: unknown, avecId: boolean): Omit<Contrat, "id"> & { id?: string } {
  const o = objet(brut, ["libelle", "type", "brutMensuelCents", "debut", "jourDePaie"], avecId ? ["id", "fin"] : ["fin"]);
  const type: TypeContrat = choix(o.type, "type", ["cdi", "cdd"] as const);
  const debut = jourValide(o.debut, "debut");
  const fin = o.fin === undefined || o.fin === null ? null : jourValide(o.fin, "fin");
  if (type === "cdd" && fin === null) throw new ErreurPaie("argument_invalide", "Un CDD a une date de fin.");
  if (fin !== null && comparerJours(fin, debut) < 0) throw new ErreurPaie("argument_invalide", "Le contrat ne peut pas finir avant de commencer.");
  return {
    ...(avecId ? { id: String(o.id) } : {}),
    libelle: texte(o.libelle, "libelle", 120),
    type,
    brutMensuelCents: montant(o.brutMensuelCents, "brutMensuelCents", 1),
    debut,
    fin,
    jourDePaie: entier(o.jourDePaie, "jourDePaie", 1, 28),
  };
}

function elements<T extends { id: string }>(brut: unknown, nom: string, prefixe: string, lire: (x: unknown) => T, suivant: number): T[] {
  if (!Array.isArray(brut)) throw new ErreurPaie("illisible", `Liste « ${nom} » illisible.`);
  const lus = brut.map(lire);
  const motif = new RegExp(`^${prefixe}[1-9]\\d{0,9}$`);
  for (const e of lus) if (!motif.test(e.id) || Number(e.id.slice(1)) >= suivant) throw new ErreurPaie("illisible", `Identifiant illisible dans « ${nom} ».`);
  return lus;
}

function lireBulletins(brut: unknown): Record<string, Bulletin> {
  if (brut === null || typeof brut !== "object" || Array.isArray(brut)) throw new ErreurPaie("illisible", "Bulletins illisibles.");
  const sortie: Record<string, Bulletin> = {};
  for (const [ref, b] of Object.entries(brut)) {
    if (!/^(mission:m|reserve:r)[1-9]\d{0,9}$/.test(ref)) throw new ErreurPaie("illisible", "Bulletin illisible.");
    const o = objet(b, ["netCents", "jour", "ecritureId"]);
    if (o.ecritureId !== null && typeof o.ecritureId !== "string") throw new ErreurPaie("illisible", "Bulletin illisible.");
    sortie[ref] = { netCents: montant(o.netCents, "netCents"), jour: jourValide(o.jour, "jour"), ecritureId: o.ecritureId };
  }
  return sortie;
}

/** Données enregistrées → données validées. `null`/`undefined` (rien d'enregistré) → données vides ; tout autre écart → `ErreurPaie("illisible")`. */
export function lireDonnees(enregistre: unknown): Donnees {
  if (enregistre === null || enregistre === undefined) return donneesVides();
  try {
    const o = objet(enregistre, ["schema", "suivant", "reglages", "missions", "reserves", "contrats", "transmis", "bulletins"]);
    if (o.schema !== SCHEMA) throw new ErreurPaie("illisible", `Version de données inconnue : ${String(o.schema)} (ce plugin lit la version ${SCHEMA}).`);
    const suivant = entier(o.suivant, "suivant", 1, 2_000_000_000);
    if (o.transmis === null || typeof o.transmis !== "object" || Array.isArray(o.transmis)) throw new ErreurPaie("illisible", "Suivi des transmissions illisible.");
    const transmis = Object.fromEntries(Object.entries(o.transmis).map(([k, v]) => [k, typeof v === "string" && v.length <= 64 ? v : (() => { throw new ErreurPaie("illisible", "Suivi des transmissions illisible."); })()]));
    return {
      schema: SCHEMA,
      suivant,
      reglages: lireReglages(o.reglages),
      missions: elements(o.missions, "missions", "m", (x) => lireMission(x, true) as Mission, suivant),
      reserves: elements(o.reserves, "reserves", "r", (x) => lireReserve(x, true) as PeriodeReserve, suivant),
      contrats: elements(o.contrats, "contrats", "c", (x) => lireContrat(x, true) as Contrat, suivant),
      transmis,
      bulletins: lireBulletins(o.bulletins),
    };
  } catch (e) {
    if (e instanceof ErreurPaie && e.code === "illisible") throw e;
    throw new ErreurPaie("illisible", `Les données de la paie sont illisibles (${e instanceof Error ? e.message : "erreur inconnue"}). Rien n'a été modifié.`);
  }
}

// ——— Opérations (chacune rend de NOUVELLES données ; en cas de refus rien n'est écrit) ———

function verifierTaille(d: Donnees): Donnees {
  if (octetsDe(d) > LIMITE_OCTETS) throw new ErreurPaie("limite_atteinte", "Les données de la paie sont pleines (3,5 Mo) ; rien n'a été enregistré.");
  return d;
}

export function ajouterMission(d: Donnees, brut: unknown): { id: string; donnees: Donnees } {
  if (d.missions.length >= MISSIONS_MAX) throw new ErreurPaie("limite_atteinte", `Au plus ${MISSIONS_MAX} missions.`);
  const id = `m${d.suivant}`;
  return { id, donnees: verifierTaille({ ...d, suivant: d.suivant + 1, missions: [...d.missions, { id, ...lireMission(brut, false) } as Mission] }) };
}

export function modifierMission(d: Donnees, id: string, brut: unknown): Donnees {
  if (!d.missions.some((m) => m.id === id)) throw new ErreurPaie("introuvable", `Mission « ${id} » introuvable.`);
  return verifierTaille({ ...d, missions: d.missions.map((m) => (m.id === id ? ({ id, ...lireMission(brut, false) } as Mission) : m)) });
}

export function supprimerMission(d: Donnees, id: string): Donnees {
  if (!d.missions.some((m) => m.id === id)) throw new ErreurPaie("introuvable", `Mission « ${id} » introuvable.`);
  return { ...d, missions: d.missions.filter((m) => m.id !== id) };
}

export function ajouterReserve(d: Donnees, brut: unknown): { id: string; donnees: Donnees } {
  if (d.reserves.length >= RESERVES_MAX) throw new ErreurPaie("limite_atteinte", `Au plus ${RESERVES_MAX} périodes de réserve.`);
  const id = `r${d.suivant}`;
  return { id, donnees: verifierTaille({ ...d, suivant: d.suivant + 1, reserves: [...d.reserves, { id, ...lireReserve(brut, false) } as PeriodeReserve] }) };
}

export function supprimerReserve(d: Donnees, id: string): Donnees {
  if (!d.reserves.some((r) => r.id === id)) throw new ErreurPaie("introuvable", `Période « ${id} » introuvable.`);
  return { ...d, reserves: d.reserves.filter((r) => r.id !== id) };
}

export function ajouterContrat(d: Donnees, brut: unknown): { id: string; donnees: Donnees } {
  if (d.contrats.length >= CONTRATS_MAX) throw new ErreurPaie("limite_atteinte", `Au plus ${CONTRATS_MAX} contrats.`);
  const id = `c${d.suivant}`;
  return { id, donnees: verifierTaille({ ...d, suivant: d.suivant + 1, contrats: [...d.contrats, { id, ...lireContrat(brut, false) } as Contrat] }) };
}

export function supprimerContrat(d: Donnees, id: string): Donnees {
  if (!d.contrats.some((c) => c.id === id)) throw new ErreurPaie("introuvable", `Contrat « ${id} » introuvable.`);
  return { ...d, contrats: d.contrats.filter((c) => c.id !== id) };
}

export const regler = (d: Donnees, brut: unknown): Donnees => ({ ...d, reglages: lireReglages(brut) });

/** Enregistre le net réellement reçu pour une mission (`mission:m1`) ou une période de réserve (`reserve:r2`). */
export function enregistrerBulletin(d: Donnees, ref: string, bulletin: Bulletin): Donnees {
  const [type, id] = ref.split(":");
  const existe = type === "mission" ? d.missions.some((m) => m.id === id) : type === "reserve" ? d.reserves.some((r) => r.id === id) : false;
  if (!existe) throw new ErreurPaie("introuvable", `« ${ref} » introuvable.`);
  return { ...d, bulletins: { ...d.bulletins, [ref]: { netCents: montant(bulletin.netCents, "netCents", 1), jour: jourValide(bulletin.jour, "jour"), ecritureId: bulletin.ecritureId } } };
}