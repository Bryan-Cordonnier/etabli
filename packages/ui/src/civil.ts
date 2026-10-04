// Dates civiles, jours ouvrés, instants UTC ↔ heure locale et durées en minutes (docs/24, M10 et T9). Écrit une fois pour `agenda`,
// `finances`, `paie`, `budget` et l'ERP. Sans dépendance : le fuseau horaire passe par `Intl` (le navigateur ou Node fournit la base
// de fuseaux), tout le reste est de l'arithmétique sur entiers.
//
// Deux sortes de dates, qu'il ne faut jamais mélanger :
// - un JOUR CIVIL (« le 12 octobre ») : texte `AAAA-MM-JJ`, sans heure ni fuseau ; on ne le convertit jamais en `Date` ;
// - un INSTANT (« ce qui a eu lieu ») : millisecondes UTC entières depuis 1970. On l'affiche dans un fuseau (défaut Europe/Paris).
// Une heure du jour est un nombre de minutes depuis minuit ; négatif = la veille (23:00 la veille = −60), ≥ 1 440 = le lendemain.
// Les fuseaux sont fiables à partir de 1912 (avant, les décalages ne sont pas des minutes entières). Une entrée invalide lève
// `RangeError` : jamais de date fausse en silence.

/** Un jour civil au format `AAAA-MM-JJ` (années 0001 à 9999). */
export type Jour = string;
/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
export type JourSemaine = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const FUSEAU_PARIS = "Europe/Paris";
export const MINUTES_PAR_JOUR = 1440;
const MS_PAR_MINUTE = 60_000;
const MS_PAR_JOUR = 86_400_000;

// ——— Jours civils ———

export const estBissextile = (annee: number): boolean => (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;

export function joursDansMois(annee: number, mois: number): number {
  if (!Number.isInteger(mois) || mois < 1 || mois > 12) throw new RangeError(`Mois invalide : ${mois}.`);
  return mois === 2 ? (estBissextile(annee) ? 29 : 28) : [4, 6, 9, 11].includes(mois) ? 30 : 31;
}

const pad = (n: number, largeur: number) => String(n).padStart(largeur, "0");

/** Compose un jour ; lève `RangeError` si la date n'existe pas (30 février, mois 13…). */
export function jour(annee: number, mois: number, j: number): Jour {
  if (!Number.isInteger(annee) || annee < 1 || annee > 9999) throw new RangeError(`Année invalide : ${annee}.`);
  if (!Number.isInteger(j) || j < 1 || j > joursDansMois(annee, mois)) throw new RangeError(`Jour inexistant : ${annee}-${mois}-${j}.`);
  return `${pad(annee, 4)}-${pad(mois, 2)}-${pad(j, 2)}`;
}

const FORME_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Vrai pour une date qui existe vraiment (« 2026-02-29 » est faux). */
export function estJour(texte: unknown): texte is Jour {
  if (typeof texte !== "string") return false;
  const m = FORME_JOUR.exec(texte);
  if (!m) return false;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return a >= 1 && mo >= 1 && mo <= 12 && j >= 1 && j <= joursDansMois(a, mo);
}

/** `{ annee, mois, jour }` d'un jour valide. */
export function decomposer(j: Jour): { annee: number; mois: number; jour: number } {
  if (!estJour(j)) throw new RangeError(`Jour invalide : « ${String(j)} » (attendu AAAA-MM-JJ, date existante).`);
  return { annee: Number(j.slice(0, 4)), mois: Number(j.slice(5, 7)), jour: Number(j.slice(8, 10)) };
}

/** Nombre de jours depuis le 1er janvier 1970 (négatif avant), calendrier grégorien proleptique (algorithme de H. Hinnant). */
export function numeroDeJour(j: Jour): number {
  const { annee, mois, jour: d } = decomposer(j);
  const y = mois <= 2 ? annee - 1 : annee;
  const ere = Math.floor(y / 400);
  const anneeEre = y - ere * 400;
  const jourAnnee = Math.floor((153 * (mois + (mois > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const jourEre = anneeEre * 365 + Math.floor(anneeEre / 4) - Math.floor(anneeEre / 100) + jourAnnee;
  return ere * 146097 + jourEre - 719468;
}

/** Inverse de `numeroDeJour`. */
export function jourDeNumero(numero: number): Jour {
  if (!Number.isSafeInteger(numero)) throw new RangeError(`Numéro de jour invalide : ${numero}.`);
  const z = numero + 719468;
  const ere = Math.floor(z / 146097);
  const jourEre = z - ere * 146097;
  const anneeEre = Math.floor((jourEre - Math.floor(jourEre / 1460) + Math.floor(jourEre / 36524) - Math.floor(jourEre / 146096)) / 365);
  const jourAnnee = jourEre - (365 * anneeEre + Math.floor(anneeEre / 4) - Math.floor(anneeEre / 100));
  const mp = Math.floor((5 * jourAnnee + 2) / 153);
  const d = jourAnnee - Math.floor((153 * mp + 2) / 5) + 1;
  const mois = mp < 10 ? mp + 3 : mp - 9;
  return jour(anneeEre + ere * 400 + (mois <= 2 ? 1 : 0), mois, d);
}

export const ajouterJours = (j: Jour, n: number): Jour => {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Nombre de jours invalide : ${n}.`);
  return jourDeNumero(numeroDeJour(j) + n);
};

/** Jours entre deux jours (`b − a`) : `differenceJours("2026-03-01", "2026-03-29")` = 28. */
export const differenceJours = (a: Jour, b: Jour): number => numeroDeJour(b) - numeroDeJour(a);

/** −1, 0 ou 1. Les jours valides se comparent aussi comme du texte. */
export const comparerJours = (a: Jour, b: Jour): -1 | 0 | 1 => {
  const d = differenceJours(a, b);
  return d > 0 ? -1 : d < 0 ? 1 : 0;
};

export const jourDeSemaine = (j: Jour): JourSemaine => (((((numeroDeJour(j) + 3) % 7) + 7) % 7) + 1) as JourSemaine;
export const lundiDe = (j: Jour): Jour => ajouterJours(j, 1 - jourDeSemaine(j));
export const dimancheDe = (j: Jour): Jour => ajouterJours(j, 7 - jourDeSemaine(j));
export const premierDuMois = (j: Jour): Jour => jour(decomposer(j).annee, decomposer(j).mois, 1);
export const dernierDuMois = (j: Jour): Jour => {
  const { annee, mois } = decomposer(j);
  return jour(annee, mois, joursDansMois(annee, mois));
};

/**
 * Ajoute `n` mois (négatif permis) en gardant le quantième, ramené à la FIN du mois d'arrivée s'il n'existe pas :
 * 31 janvier + 1 mois = 28 février (29 en bissextile). Pour une échéance mensuelle, partir toujours de la date d'ORIGINE
 * (`ajouterMois("2026-01-31", k)`), pas de la précédente : le 31 revient en mars (31) au lieu de rester au 28.
 */
export function ajouterMois(j: Jour, n: number): Jour {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Nombre de mois invalide : ${n}.`);
  const { annee, mois, jour: d } = decomposer(j);
  const total = annee * 12 + (mois - 1) + n;
  const a = Math.floor(total / 12);
  const m = total - a * 12 + 1;
  if (a < 1 || a > 9999) throw new RangeError(`Année hors limites : ${a}.`);
  return jour(a, m, Math.min(d, joursDansMois(a, m)));
}

/** Ajoute des années (le 29 février devient le 28 les années non bissextiles). */
export const ajouterAns = (j: Jour, n: number): Jour => ajouterMois(j, n * 12);

/** Tous les jours de `du` à `au` inclus (vide si `au` précède `du`). Plafonné (défaut 3 700 jours) pour éviter une boucle géante. */
export function plage(du: Jour, au: Jour, max = 3700): Jour[] {
  const n = differenceJours(du, au) + 1;
  if (n <= 0) return [];
  if (n > max) throw new RangeError(`Plage de ${n} jours : plus que le maximum de ${max}.`);
  const debut = numeroDeJour(du);
  return Array.from({ length: n }, (_, i) => jourDeNumero(debut + i));
}

// ——— Jours ouvrés ———

/** Dit si un jour est férié. Le calendrier des fériés est un choix de l'appelant : rien n'est supposé (voir `estFerieFrance`). */
export type EstFerie = (j: Jour) => boolean;

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher, calendrier grégorien). */
export function paques(annee: number): Jour {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jourDuMois = ((h + l - 7 * m + 114) % 31) + 1;
  return jour(annee, mois, jourDuMois);
}

/** Les onze jours fériés légaux en France métropolitaine, dans l'ordre. */
export function feriesFrance(annee: number): Jour[] {
  const p = paques(annee);
  return [
    jour(annee, 1, 1),
    ajouterJours(p, 1), // lundi de Pâques
    jour(annee, 5, 1),
    jour(annee, 5, 8),
    ajouterJours(p, 39), // Ascension
    ajouterJours(p, 50), // lundi de Pentecôte
    jour(annee, 7, 14),
    jour(annee, 8, 15),
    jour(annee, 11, 1),
    jour(annee, 11, 11),
    jour(annee, 12, 25),
  ].sort();
}

const caches = new Map<number, ReadonlySet<Jour>>();
/** Calendrier de fériés de la France métropolitaine, à passer aux fonctions de jours ouvrés. */
export const estFerieFrance: EstFerie = (j) => {
  const { annee } = decomposer(j);
  let jours = caches.get(annee);
  if (!jours) caches.set(annee, (jours = new Set(feriesFrance(annee))));
  return jours.has(j);
};

/** Ouvré = du lundi au vendredi et non férié. Par défaut aucun jour n'est férié (`estFerieFrance` pour la France). */
export function estOuvre(j: Jour, ferie: EstFerie = () => false): boolean {
  return jourDeSemaine(j) <= 5 && !ferie(j);
}

const GARDE_OUVRES = 400;

/** `j` s'il est ouvré, sinon le premier jour ouvré qui suit (« jamais un dimanche : report au jour ouvré suivant »). */
export function prochainOuvre(j: Jour, ferie: EstFerie = () => false): Jour {
  let courant = j;
  for (let i = 0; i < GARDE_OUVRES; i++, courant = ajouterJours(courant, 1)) if (estOuvre(courant, ferie)) return courant;
  throw new RangeError("Aucun jour ouvré dans les 400 jours qui suivent : calendrier de fériés incohérent ?");
}

/** `j` s'il est ouvré, sinon le dernier jour ouvré qui le précède. */
export function precedentOuvre(j: Jour, ferie: EstFerie = () => false): Jour {
  let courant = j;
  for (let i = 0; i < GARDE_OUVRES; i++, courant = ajouterJours(courant, -1)) if (estOuvre(courant, ferie)) return courant;
  throw new RangeError("Aucun jour ouvré dans les 400 jours qui précèdent : calendrier de fériés incohérent ?");
}

/**
 * Avance de `n` jours ouvrés (négatif : recule). `n = 0` rend `j` tel quel s'il est ouvré, sinon le jour ouvré suivant.
 * Le jour de départ ne compte pas : du vendredi, +1 ouvré = lundi.
 */
export function ajouterJoursOuvres(j: Jour, n: number, ferie: EstFerie = () => false): Jour {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Nombre de jours ouvrés invalide : ${n}.`);
  if (n === 0) return prochainOuvre(j, ferie);
  const pas = n > 0 ? 1 : -1;
  let courant = j;
  for (let restant = Math.abs(n); restant > 0; ) {
    courant = ajouterJours(courant, pas);
    if (estOuvre(courant, ferie)) restant--;
  }
  return courant;
}

/** Nombre de jours ouvrés de `du` à `au`, les deux inclus (0 si `au` précède `du`). */
export function compterJoursOuvres(du: Jour, au: Jour, ferie: EstFerie = () => false): number {
  return plage(du, au, 20_000).filter((j) => estOuvre(j, ferie)).length;
}

// ——— Heures du jour et durées, en minutes ———

/** Ramène des minutes (négatives ou ≥ 1 440) à un jour décalé et une heure 0..1 439 : `-60` → `{ jours: -1, minutes: 1380 }`. */
export function normaliserMinutes(minutes: number): { jours: number; minutes: number } {
  if (!Number.isSafeInteger(minutes)) throw new RangeError(`Minutes invalides : ${minutes}.`);
  const jours = Math.floor(minutes / MINUTES_PAR_JOUR);
  return { jours, minutes: minutes - jours * MINUTES_PAR_JOUR };
}

/** « 08:30 », « 23:00 » (une heure veille/lendemain est ramenée dans la journée : voir `normaliserMinutes` pour le décalage). */
export function formatHeure(minutes: number): string {
  const n = normaliserMinutes(minutes).minutes;
  return `${pad(Math.floor(n / 60), 2)}:${pad(n % 60, 2)}`;
}

/** « 8:30 », « 08:30 », « 8h30 », « 8 h 30 », « 8h » → minutes depuis minuit (0..1 439) ; `null` si illisible ou hors 00:00–23:59. */
export function parseHeure(texte: string): number | null {
  if (typeof texte !== "string") return null;
  const m = /^\s*(\d{1,2})\s*[:hH]\s*(\d{2})?\s*$/.exec(texte);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Durée d'une plage de travail entre deux heures du jour : si la fin est avant ou égale au début, la plage passe minuit
 * (22:00 → 06:00 = 480). Pour 0 minute il faut ne pas appeler cette fonction.
 */
export function dureeEntre(debutMin: number, finMin: number): number {
  const d = normaliserMinutes(debutMin).minutes;
  const f = normaliserMinutes(finMin).minutes;
  return f > d ? f - d : f + MINUTES_PAR_JOUR - d;
}

/** 450 → « 7 h 30 », 60 → « 1 h », 45 → « 45 min », 0 → « 0 min », −90 → « -1 h 30 ». */
export function formatDuree(minutes: number): string {
  if (!Number.isSafeInteger(minutes)) throw new RangeError(`Durée invalide : ${minutes}.`);
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const corps = h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${pad(m, 2)}`;
  return minutes < 0 ? `-${corps}` : corps;
}

/** « 7h30 », « 7 h 30 », « 7:30 », « 7h », « 45 min », « 1h05 », « 90 » (un entier seul = minutes) → minutes ; `null` si illisible. */
export function parseDuree(texte: string): number | null {
  if (typeof texte !== "string") return null;
  const t = texte.trim().toLowerCase().replace(/[  ]/g, " ");
  let m = /^(-)?(\d+)\s*(?:h|:)\s*(\d{2})?\s*(?:min)?$/.exec(t);
  if (m) {
    const min = m[3] === undefined ? 0 : Number(m[3]);
    if (min > 59) return null;
    const v = Number(m[2]) * 60 + min;
    return Number.isSafeInteger(v) ? (m[1] ? -v : v) : null;
  }
  m = /^(-)?(\d+)\s*(?:min|mn|m)?$/.exec(t);
  if (m) {
    const v = Number(m[2]);
    return Number.isSafeInteger(v) ? (m[1] ? -v : v) : null;
  }
  return null;
}

// ——— Instants UTC et heure locale (Intl) ———

export interface OptionsFuseau {
  /** Nom IANA du fuseau (défaut `Europe/Paris`). */
  fuseau?: string;
}

const formateurs = new Map<string, Intl.DateTimeFormat>();
function formateur(fuseau: string): Intl.DateTimeFormat {
  let f = formateurs.get(fuseau);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: fuseau,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      });
    } catch {
      throw new RangeError(`Fuseau horaire inconnu : « ${fuseau} ».`);
    }
    formateurs.set(fuseau, f);
  }
  return f;
}

function instant(ms: number): number {
  if (!Number.isSafeInteger(ms) || Math.abs(ms) > 8.64e15) throw new RangeError(`Instant invalide : ${ms} (millisecondes UTC entières attendues).`);
  return ms;
}

/** Décalage du fuseau par rapport à UTC à cet instant, en minutes (Paris : 60 l'hiver, 120 l'été). */
export function decalageMinutes(ms: number, fuseau = FUSEAU_PARIS): number {
  instant(ms);
  const p: Record<string, number> = {};
  for (const x of formateur(fuseau).formatToParts(ms)) if (x.type !== "literal") p[x.type] = Number(x.value);
  const local = jourEnMs(p.year ?? 1970, p.month ?? 1, p.day ?? 1) + ((p.hour ?? 0) % 24) * 3_600_000 + (p.minute ?? 0) * MS_PAR_MINUTE + (p.second ?? 0) * 1000;
  return Math.round((local - Math.floor(ms / 1000) * 1000) / MS_PAR_MINUTE);
}

const jourEnMs = (annee: number, mois: number, j: number): number => numeroDeJour(jour(annee, mois, j)) * MS_PAR_JOUR;

export interface Local {
  jour: Jour;
  /** Minutes depuis minuit, 0..1 439. */
  minutes: number;
  /** Décalage appliqué par rapport à UTC, en minutes. */
  decalageMin: number;
}

/** L'instant vu dans le fuseau : le jour civil, l'heure en minutes (les secondes sont ignorées) et le décalage. */
export function instantVersLocal(ms: number, options: OptionsFuseau = {}): Local {
  const fuseau = options.fuseau ?? FUSEAU_PARIS;
  const decalageMin = decalageMinutes(ms, fuseau);
  const local = Math.floor(ms / 1000) * 1000 + decalageMin * MS_PAR_MINUTE;
  const numero = Math.floor(local / MS_PAR_JOUR);
  return { jour: jourDeNumero(numero), minutes: Math.floor((local - numero * MS_PAR_JOUR) / MS_PAR_MINUTE), decalageMin };
}

export const jourDeInstant = (ms: number, options: OptionsFuseau = {}): Jour => instantVersLocal(ms, options).jour;

export interface OptionsLocalVersInstant extends OptionsFuseau {
  /** Heure qui se produit deux fois (retour à l'heure d'hiver) : `premier` (défaut, l'été) ou `second` (l'hiver) ; `refuser` lève une erreur. */
  ambigu?: "premier" | "second" | "refuser";
  /** Heure qui n'existe pas (passage à l'heure d'été) : `decaler` (défaut) avance d'autant que le saut ; `refuser` lève une erreur. */
  inexistant?: "decaler" | "refuser";
}

/**
 * Instant UTC (ms) d'un jour civil et d'une heure locale. `minutes` peut être négatif ou ≥ 1 440 (la veille, le lendemain).
 * Aux changements d'heure : 02:30 le jour du passage à l'heure d'été n'existe pas (→ 03:30, `decaler`), et 02:30 le jour du retour
 * à l'heure d'hiver existe deux fois (→ la première, `premier`).
 */
export function localVersInstant(j: Jour, minutes: number, options: OptionsLocalVersInstant = {}): number {
  const fuseau = options.fuseau ?? FUSEAU_PARIS;
  const { jours, minutes: min } = normaliserMinutes(minutes);
  const naif = (numeroDeJour(j) + jours) * MS_PAR_JOUR + min * MS_PAR_MINUTE; // l'heure locale lue comme si elle était UTC
  const avant = decalageMinutes(naif - MS_PAR_JOUR, fuseau);
  const apres = decalageMinutes(naif + MS_PAR_JOUR, fuseau);
  const candidats = [...new Set([avant, apres])]
    .map((off) => ({ off, t: naif - off * MS_PAR_MINUTE }))
    .filter(({ off, t }) => decalageMinutes(t, fuseau) === off)
    .map(({ t }) => t)
    .sort((a, b) => a - b);
  if (candidats.length === 1) return candidats[0]!;
  if (candidats.length >= 2) {
    const choix = options.ambigu ?? "premier";
    if (choix === "refuser") throw new RangeError(`Heure ambiguë (retour à l'heure d'hiver) : ${j} ${formatHeure(min)}.`);
    return choix === "premier" ? candidats[0]! : candidats[candidats.length - 1]!;
  }
  if (options.inexistant === "refuser") throw new RangeError(`Heure inexistante (passage à l'heure d'été) : ${j} ${formatHeure(min)}.`);
  return naif - avant * MS_PAR_MINUTE; // avec le décalage d'avant le saut : l'heure tombe après le saut
}

/** Instant de minuit (début) du jour civil dans le fuseau. */
export const debutDeJour = (j: Jour, options: OptionsFuseau = {}): number => localVersInstant(j, 0, options);

/** Durée réelle du jour civil en minutes : 1 440, mais 1 380 au passage à l'heure d'été et 1 500 au retour à l'heure d'hiver. */
export const dureeDuJour = (j: Jour, options: OptionsFuseau = {}): number =>
  Math.round((debutDeJour(ajouterJours(j, 1), options) - debutDeJour(j, options)) / MS_PAR_MINUTE);

/** `2026-10-05T10:00:00.000Z`. */
export const instantVersIso = (ms: number): string => new Date(instant(ms)).toISOString();

/** Lit un instant ISO se terminant par `Z` ; `null` sinon (une date sans fuseau est ambiguë : refusée). */
export function isoVersInstant(texte: string): number | null {
  if (typeof texte !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/.test(texte)) return null;
  if (!estJour(texte.slice(0, 10))) return null;
  const ms = Date.parse(texte);
  return Number.isNaN(ms) ? null : ms;
}
