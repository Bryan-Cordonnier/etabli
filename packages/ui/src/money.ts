// Argent en centimes entiers (docs/24, M10 et A.1.3) : addition, pourcentage en points de base avec règle d'arrondi explicite,
// répartition sans perte, formatage et lecture à la française. Aucun flottant n'entre dans un calcul : les produits passent par
// BigInt, donc `montant × taux` ne dépasse jamais 2^53. Écrit une fois pour `finances`, `paie`, `budget` et l'ERP.
//
// Conventions : un montant est un entier de centimes (12,50 € = 1250), borné à ±10^12 ; un taux est un entier de points de base
// (22 % = 2200 ; 1 point de base = 0,01 %) ; toute fonction qui arrondit nomme sa règle (défaut : `demi-haut`, celle de `arr()` du
// cœur Rust de gestion-budget-perso : floor((2n + d) / 2d)). Une entrée invalide lève `RangeError` : jamais de résultat faux.

/** Un montant en centimes entiers (signé). */
export type Centimes = number;
/** Un taux en points de base : 2200 = 22 %. */
export type PointsDeBase = number;

/** Plafond d'un montant, en valeur absolue : 10 milliards d'euros. */
export const MAX_CENTIMES = 1_000_000_000_000;
export const POINTS_DE_BASE = 10_000;

/**
 * Règle d'arrondi d'une division entière non exacte (exemples pour 2,5 et −2,5) :
 * - `demi-haut` : au plus proche, le milieu vers +∞ (3 ; −2) — règle par défaut, celle de `arr()` ;
 * - `demi-eloigne` : au plus proche, le milieu en s'éloignant de zéro (3 ; −3) — arrondi « commercial » ;
 * - `demi-pair` : au plus proche, le milieu vers le pair (2 ; −2) — arrondi « bancaire » ;
 * - `bas` : vers −∞ (2 ; −3) ; `haut` : vers +∞ (3 ; −2) ; `zero` : vers zéro (2 ; −2).
 */
export type Arrondi = "demi-haut" | "demi-eloigne" | "demi-pair" | "bas" | "haut" | "zero";

const REGLES: readonly Arrondi[] = ["demi-haut", "demi-eloigne", "demi-pair", "bas", "haut", "zero"];

function entier(n: unknown, nom: string): number {
  if (typeof n !== "number" || !Number.isSafeInteger(n)) throw new RangeError(`${nom} : entier attendu (reçu ${String(n)}).`);
  return n;
}

/** Vérifie qu'une valeur est un montant valide (entier sûr, borné à ±10^12) et la renvoie. */
export function centimes(n: unknown, nom = "montant"): Centimes {
  const v = entier(n, nom);
  if (Math.abs(v) > MAX_CENTIMES) throw new RangeError(`${nom} : hors limites (±${MAX_CENTIMES} centimes), reçu ${v}.`);
  return v;
}

/** Vrai pour un montant valide (sans exception). */
export const estCentimes = (n: unknown): n is Centimes => Number.isSafeInteger(n) && Math.abs(n as number) <= MAX_CENTIMES;

/** Vérifie et convertit un résultat BigInt en montant. */
function enCentimes(v: bigint, nom: string): Centimes {
  if (v > BigInt(MAX_CENTIMES) || v < -BigInt(MAX_CENTIMES)) throw new RangeError(`${nom} : résultat hors limites (±${MAX_CENTIMES} centimes).`);
  return Number(v);
}

export function ajouter(a: Centimes, b: Centimes): Centimes {
  return centimes(centimes(a, "a") + centimes(b, "b"), "somme");
}

export function soustraire(a: Centimes, b: Centimes): Centimes {
  return centimes(centimes(a, "a") - centimes(b, "b"), "différence");
}

/** Somme d'une liste (0 pour une liste vide). Chaque terme et chaque total partiel sont contrôlés. */
export function somme(montants: readonly Centimes[]): Centimes {
  let total = 0;
  for (const m of montants) total = ajouter(total, m);
  return total;
}

/** Opposé, sans jamais produire −0. */
export function oppose(a: Centimes): Centimes {
  const v = centimes(a);
  return v === 0 ? 0 : -v;
}

export const absolu = (a: Centimes): Centimes => Math.abs(centimes(a));

/** −1, 0 ou 1. */
export const signe = (a: Centimes): -1 | 0 | 1 => (centimes(a) < 0 ? -1 : a > 0 ? 1 : 0);

/** Division entière d'un BigInt (n / d), arrondie selon `regle`. `d` non nul. */
function divBig(n: bigint, d: bigint, regle: Arrondi): bigint {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  let q = n / d; // BigInt tronque vers zéro
  let r = n % d;
  if (r < 0n) {
    q -= 1n; // ramène au plancher : n = q × d + r avec 0 ≤ r < d
    r += d;
  }
  if (r === 0n) return q;
  const deuxR = 2n * r;
  switch (regle) {
    case "bas":
      return q;
    case "haut":
      return q + 1n;
    case "zero":
      return n >= 0n ? q : q + 1n;
    case "demi-haut":
      return deuxR >= d ? q + 1n : q;
    case "demi-eloigne":
      if (deuxR !== d) return deuxR > d ? q + 1n : q;
      return n >= 0n ? q + 1n : q;
    case "demi-pair":
      if (deuxR !== d) return deuxR > d ? q + 1n : q;
      return q % 2n === 0n ? q : q + 1n;
  }
}

function verifierRegle(regle: Arrondi): Arrondi {
  if (!REGLES.includes(regle)) throw new RangeError(`Règle d'arrondi inconnue : ${String(regle)}.`);
  return regle;
}

/** `n / d` arrondi selon `regle` (défaut `demi-haut`). Entiers sûrs ; `d` non nul. */
export function divArrondi(n: number, d: number, regle: Arrondi = "demi-haut"): number {
  entier(n, "numérateur");
  entier(d, "diviseur");
  if (d === 0) throw new RangeError("Division par zéro.");
  const v = divBig(BigInt(n), BigInt(d), verifierRegle(regle));
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < -BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Résultat hors limites.");
  return Number(v);
}

/** `montant × m / d`, produit exact (BigInt) puis une seule division arrondie : jamais de dépassement intermédiaire. */
export function mulDiv(montant: Centimes, m: number, d: number, regle: Arrondi = "demi-haut"): Centimes {
  centimes(montant);
  entier(m, "multiplicateur");
  entier(d, "diviseur");
  if (d === 0) throw new RangeError("Division par zéro.");
  return enCentimes(divBig(BigInt(montant) * BigInt(m), BigInt(d), verifierRegle(regle)), "produit");
}

/** `bp` points de base d'un montant : `pourcentage(10000, 2200)` = 2200 (22 % de 100 €). */
export function pourcentage(montant: Centimes, bp: PointsDeBase, regle: Arrondi = "demi-haut"): Centimes {
  return mulDiv(montant, entier(bp, "taux"), POINTS_DE_BASE, regle);
}

/**
 * Montant après un prélèvement de `bp` : `brut × (10 000 − bp) / 10 000`, UN seul arrondi (comme le net de `paie.rs`).
 * Différent de `brut − pourcentage(brut, bp)` à un centime près dans certains cas : choisir l'un, s'y tenir.
 */
export function apresPrelevement(brut: Centimes, bp: PointsDeBase, regle: Arrondi = "demi-haut"): Centimes {
  return mulDiv(brut, POINTS_DE_BASE - entier(bp, "taux"), POINTS_DE_BASE, regle);
}

/** Montant majoré de `bp` : `montant × (10 000 + bp) / 10 000`, un seul arrondi. */
export function majorer(montant: Centimes, bp: PointsDeBase, regle: Arrondi = "demi-haut"): Centimes {
  return mulDiv(montant, POINTS_DE_BASE + entier(bp, "taux"), POINTS_DE_BASE, regle);
}

/**
 * Répartit `total` selon des poids entiers positifs ou nuls, sans perdre ni créer un centime (plus forts restes ; à égalité, le
 * premier d'abord). Un total négatif est réparti comme son opposé. La somme du résultat vaut toujours `total`.
 */
export function repartir(total: Centimes, poids: readonly number[]): Centimes[] {
  centimes(total, "total");
  if (poids.length === 0) throw new RangeError("Aucun poids pour la répartition.");
  let somme = 0n;
  for (const p of poids) {
    if (entier(p, "poids") < 0) throw new RangeError("Un poids ne peut pas être négatif.");
    somme += BigInt(p);
  }
  if (somme === 0n) throw new RangeError("La somme des poids est nulle.");
  const absTotal = BigInt(Math.abs(total));
  const parts = poids.map((p, i) => {
    const produit = absTotal * BigInt(p);
    return { i, base: produit / somme, reste: produit % somme };
  });
  let manque = Number(absTotal - parts.reduce((s, x) => s + x.base, 0n));
  const ordre = [...parts].sort((a, b) => (a.reste === b.reste ? a.i - b.i : a.reste > b.reste ? -1 : 1));
  const extra = new Set<number>();
  for (const x of ordre) {
    if (manque === 0) break;
    if (x.reste > 0n) {
      extra.add(x.i);
      manque -= 1;
    }
  }
  return parts.map((x) => {
    const v = Number(x.base) + (extra.has(x.i) ? 1 : 0);
    return total < 0 && v !== 0 ? -v : v;
  });
}

/** Répartit en `n` parts égales (les premières reçoivent le centime en plus). */
export const repartirEgalement = (total: Centimes, n: number): Centimes[] =>
  repartir(total, Array.from({ length: entier(n, "nombre de parts") }, () => 1));

// ——— Affichage et lecture à la française ———

const ESPACE_FINE = " "; // séparateur de milliers de fr-FR
const ESPACE_INSECABLE = " "; // avant le symbole « € » et « % »

export interface OptionsFormat {
  /** Ajoute « € » (défaut : oui). */
  symbole?: boolean;
  /** `toujours` : écrit « + » devant un montant positif (défaut : `auto`, seul le « - » des négatifs). */
  signe?: "auto" | "toujours";
}

function groupes(entiers: string): string {
  return entiers.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE);
}

/** `-123456` → « -1 234,56 € » (séparateur de milliers : espace fine insécable, comme `Intl` en fr-FR). */
export function formatEuros(montant: Centimes, options: OptionsFormat = {}): string {
  const v = centimes(montant);
  const abs = Math.abs(v);
  const texte = `${groupes(String(Math.trunc(abs / 100)))},${String(abs % 100).padStart(2, "0")}`;
  const prefixe = v < 0 ? "-" : v > 0 && options.signe === "toujours" ? "+" : "";
  return `${prefixe}${texte}${options.symbole === false ? "" : `${ESPACE_INSECABLE}€`}`;
}

/**
 * Lit un montant saisi : « 12,50 », « 12.5 », « 1 234,56 € », « -3 », « −3,50 » (vrai signe moins), « 1.234,56 ».
 * Renvoie `null` si le texte n'est pas un montant exact : plus de deux décimales (« 12,505 » n'est PAS arrondi en silence),
 * séparateurs incohérents, lettres, hors limites. Un point seul est une décimale (« 1.234 » est donc refusé) ; avec une virgule
 * et un point, le dernier est la décimale et l'autre sépare des groupes de trois chiffres.
 */
export function parseEuros(texte: string): Centimes | null {
  if (typeof texte !== "string") return null;
  let t = texte.trim().replace(/€|eur(os?)?/gi, "").trim().replace(/[\u2212\u2013\u2012]/g, "-");
  let negatif = false;
  if (t.startsWith("-") || t.startsWith("+")) {
    negatif = t[0] === "-";
    t = t.slice(1).trim();
  }
  // Un espace n'est permis que comme séparateur de milliers (« 1 234,56 ») : « 12 34 » n'est pas 1 234.
  if (/\s/.test(t)) {
    if (!/^\d{1,3}(?:\s\d{3})+(?:[.,]\d{1,2})?$/.test(t)) return null;
    t = t.replace(/\s/g, "");
  }
  if (!/^[0-9.,]+$/.test(t) || !/[0-9]/.test(t)) return null;
  const virgule = t.lastIndexOf(",");
  const point = t.lastIndexOf(".");
  let decimale: "," | "." | null = null;
  let milliers: "," | "." | null = null;
  if (virgule >= 0 && point >= 0) {
    decimale = virgule > point ? "," : ".";
    milliers = decimale === "," ? "." : ",";
  } else if (virgule >= 0) {
    decimale = ",";
  } else if (point >= 0) {
    decimale = ".";
  }
  let entiers = t;
  let fraction = "";
  if (decimale) {
    const coupe = t.lastIndexOf(decimale);
    entiers = t.slice(0, coupe);
    fraction = t.slice(coupe + 1);
    if (fraction.length < 1 || fraction.length > 2 || !/^\d+$/.test(fraction)) return null;
    // Un seul séparateur décimal, et rien d'autre que `milliers` dans la partie entière.
    if (entiers.includes(decimale)) return null;
  }
  if (milliers) {
    if (!new RegExp(`^\\d{1,3}(\\${milliers}\\d{3})+$`).test(entiers)) return null;
    entiers = entiers.split(milliers).join("");
  }
  if (entiers === "" && decimale) entiers = "0";
  if (!/^\d+$/.test(entiers) || entiers.length > 13) return null;
  const valeur = Number(entiers) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(valeur) || valeur > MAX_CENTIMES) return null;
  return valeur === 0 ? 0 : negatif ? -valeur : valeur;
}

/** `2250` → « 22,5 % », `2200` → « 22 % », `525` → « 5,25 % ». */
export function formatTaux(bp: PointsDeBase): string {
  const v = entier(bp, "taux");
  const abs = Math.abs(v);
  const entiere = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, "0").replace(/0+$/, "");
  const texte = frac === "" ? String(entiere) : `${entiere},${frac}`;
  return `${v < 0 ? "-" : ""}${texte}${ESPACE_INSECABLE}%`;
}

/** « 22 », « 22,5 % », « 5.25 » → points de base (2200, 2250, 525) ; `null` au-delà de deux décimales ou si illisible. */
export function parseTaux(texte: string): PointsDeBase | null {
  if (typeof texte !== "string") return null;
  return parseEuros(texte.replace(/%/g, "")); // même grammaire : deux décimales exactes, signe, séparateurs
}
