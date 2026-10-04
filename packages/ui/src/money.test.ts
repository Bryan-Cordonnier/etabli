import { describe, expect, it } from "vitest";
import {
  MAX_CENTIMES,
  absolu,
  ajouter,
  apresPrelevement,
  centimes,
  divArrondi,
  estCentimes,
  formatEuros,
  formatTaux,
  majorer,
  mulDiv,
  oppose,
  parseEuros,
  parseTaux,
  pourcentage,
  repartir,
  repartirEgalement,
  signe,
  soustraire,
  somme,
  type Arrondi,
} from "./money";

const REGLES: Arrondi[] = ["demi-haut", "demi-eloigne", "demi-pair", "bas", "haut", "zero"];
const NBSP = " ";
const FINE = " ";

describe("centimes et estCentimes", () => {
  it("accepte les entiers bornés", () => {
    expect(centimes(1250)).toBe(1250);
    expect(centimes(-MAX_CENTIMES)).toBe(-MAX_CENTIMES);
    expect(estCentimes(0)).toBe(true);
  });
  it("refuse les flottants, NaN, l'infini, les textes et ce qui dépasse ±10^12", () => {
    for (const mauvais of [12.5, NaN, Infinity, "12", null, undefined, MAX_CENTIMES + 1, -MAX_CENTIMES - 1, 2 ** 53]) {
      expect(estCentimes(mauvais)).toBe(false);
      expect(() => centimes(mauvais)).toThrow(RangeError);
    }
  });
});

describe("addition, soustraction, somme", () => {
  it("calcule en entiers", () => {
    expect(ajouter(1010, 20)).toBe(1030);
    expect(soustraire(100, 250)).toBe(-150);
    expect(somme([100, 200, -50])).toBe(250);
    expect(somme([])).toBe(0);
  });
  it("0,1 + 0,2 vaut exactement 0,30 € (10 + 20 centimes)", () => {
    expect(ajouter(10, 20)).toBe(30);
  });
  it("refuse un résultat hors limites, y compris au milieu d'une somme", () => {
    expect(() => ajouter(MAX_CENTIMES, 1)).toThrow(RangeError);
    expect(() => soustraire(-MAX_CENTIMES, 1)).toThrow(RangeError);
    expect(() => somme([MAX_CENTIMES, 1, -1])).toThrow(RangeError);
  });
  it("refuse un terme invalide plutôt que de produire NaN", () => {
    expect(() => ajouter(1.5, 1)).toThrow(RangeError);
    expect(() => somme([1, NaN])).toThrow(RangeError);
  });
  it("oppose, absolu et signe ne produisent jamais −0", () => {
    expect(Object.is(oppose(0), 0)).toBe(true);
    expect(oppose(250)).toBe(-250);
    expect(absolu(-250)).toBe(250);
    expect(signe(-3)).toBe(-1);
    expect(signe(0)).toBe(0);
    expect(signe(3)).toBe(1);
  });
});

describe("divArrondi : chaque règle, aux deux signes", () => {
  // [n, d, demi-haut, demi-eloigne, demi-pair, bas, haut, zero]
  const cas: [number, number, ...number[]][] = [
    [5, 2, 3, 3, 2, 2, 3, 2], // 2,5
    [-5, 2, -2, -3, -2, -3, -2, -2], // −2,5
    [7, 2, 4, 4, 4, 3, 4, 3], // 3,5
    [-7, 2, -3, -4, -4, -4, -3, -3], // −3,5
    [1, 3, 0, 0, 0, 0, 1, 0], // 0,333…
    [-1, 3, 0, 0, 0, -1, 0, 0], // −0,333…
    [2, 3, 1, 1, 1, 0, 1, 0], // 0,666…
    [-2, 3, -1, -1, -1, -1, 0, 0], // −0,666…
    [10, 5, 2, 2, 2, 2, 2, 2], // exact
    [-10, 5, -2, -2, -2, -2, -2, -2],
    [0, 7, 0, 0, 0, 0, 0, 0],
    [1, 2, 1, 1, 0, 0, 1, 0], // 0,5 : le pair est 0
    [3, 2, 2, 2, 2, 1, 2, 1], // 1,5 : le pair est 2
  ];
  for (const [n, d, ...attendus] of cas) {
    it(`${n} / ${d}`, () => {
      REGLES.forEach((regle, i) => expect(divArrondi(n, d, regle), `${n}/${d} ${regle}`).toBe(attendus[i]));
    });
  }
  it("un diviseur négatif donne le même résultat que le quotient de signes opposés", () => {
    for (const regle of REGLES) expect(divArrondi(5, -2, regle)).toBe(divArrondi(-5, 2, regle));
  });
  it("ne renvoie jamais −0", () => {
    for (const regle of REGLES) expect(Object.is(divArrondi(-1, 3, regle), -0)).toBe(false);
    expect(Object.is(divArrondi(-1, 3, "zero"), -0)).toBe(false);
    expect(Object.is(divArrondi(-1, 3, "haut"), -0)).toBe(false);
  });
  it("la règle par défaut est demi-haut, égale à floor((2n + d) / 2d) du cœur Rust", () => {
    for (const [n, d] of [[5, 2], [-5, 2], [7, 3], [-7, 3], [0, 4], [1, 2], [-1, 2], [123456, 10000]] as const) {
      expect(divArrondi(n, d)).toBe(Math.floor((2 * n + d) / (2 * d)));
    }
  });
  it("refuse la division par zéro, un non-entier et une règle inconnue", () => {
    expect(() => divArrondi(1, 0)).toThrow(RangeError);
    expect(() => divArrondi(1.5, 2)).toThrow(RangeError);
    expect(() => divArrondi(1, 2.5)).toThrow(RangeError);
    expect(() => divArrondi(1, 2, "arrondi-fantaisie" as Arrondi)).toThrow(RangeError);
  });
});

describe("mulDiv, pourcentage, prélèvement, majoration", () => {
  it("22 % de 100,00 € = 22,00 €", () => {
    expect(pourcentage(10000, 2200)).toBe(2200);
  });
  it("le demi-centime suit la règle choisie, aux deux signes", () => {
    expect(pourcentage(1, 5000)).toBe(1); // 0,5 → 1
    expect(pourcentage(-1, 5000)).toBe(0); // −0,5 → 0 (vers +∞), sans −0
    expect(Object.is(pourcentage(-1, 5000), -0)).toBe(false);
    expect(pourcentage(-1, 5000, "demi-eloigne")).toBe(-1);
    expect(pourcentage(1, 5000, "demi-pair")).toBe(0);
    expect(pourcentage(3, 5000, "demi-pair")).toBe(2); // 1,5 → 2
    expect(pourcentage(3, 5000, "bas")).toBe(1);
    expect(pourcentage(3, 5000, "haut")).toBe(2);
  });
  it("le produit intermédiaire ne dépasse pas 2^53 : 10^12 centimes × 9 999 points de base", () => {
    const exact = (BigInt(MAX_CENTIMES) * 9999n) / 10000n; // 999 900 000 000 (exact)
    expect(pourcentage(MAX_CENTIMES, 9999)).toBe(Number(exact));
    expect(pourcentage(999_999_999_999, 9_999)).toBe(Number((999_999_999_999n * 9999n + 5000n) / 10000n));
    expect(MAX_CENTIMES * 9999).toBeGreaterThan(Number.MAX_SAFE_INTEGER); // le calcul naïf en flottants aurait perdu des chiffres
  });
  it("refuse un résultat hors limites", () => {
    expect(() => pourcentage(MAX_CENTIMES, 10001)).toThrow(RangeError);
    expect(() => mulDiv(MAX_CENTIMES, 2, 1)).toThrow(RangeError);
  });
  it("vecteur d'or de paie.rs : brut 550,55 €, 22 % de cotisations, net 429,43 €", () => {
    // 5 × 7 h à 13 € : base 455,00 €, IFM 10 % = 45,50 €, CP 10 % de (base + IFM) = 50,05 €.
    const base = mulDiv(2100, 1300, 60);
    const ifm = divArrondi(base, 10);
    const cp = divArrondi(base + ifm, 10);
    expect([base, ifm, cp]).toEqual([45500, 4550, 5005]);
    expect(apresPrelevement(base + ifm + cp, 2200)).toBe(42943);
  });
  it("net en un seul arrondi, ce qui peut différer d'un centime de « brut − part »", () => {
    expect(apresPrelevement(5, 5000)).toBe(3); // 2,5 → 3
    expect(5 - pourcentage(5, 5000)).toBe(2); // 5 − 3 : un autre arrondi, à ne pas mélanger
  });
  it("majorer : TVA 20 % de 19,99 € = 23,99 € (23,988 arrondi)", () => {
    expect(majorer(10000, 2000)).toBe(12000);
    expect(majorer(1999, 2000)).toBe(2399);
    expect(majorer(-1999, 2000)).toBe(-2399);
  });
  it("un taux négatif est permis (remise)", () => {
    expect(majorer(10000, -1000)).toBe(9000);
    expect(pourcentage(10000, -500)).toBe(-500);
  });
  it("refuse un taux non entier", () => {
    expect(() => pourcentage(100, 22.5)).toThrow(RangeError);
    expect(() => majorer(100, NaN)).toThrow(RangeError);
  });
});

describe("repartir : jamais un centime perdu ni créé", () => {
  const somme = (l: number[]) => l.reduce((s, x) => s + x, 0);
  it("100 € sur trois parts égales : le premier reçoit le centime", () => {
    expect(repartir(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(repartirEgalement(1000, 3)).toEqual([334, 333, 333]);
  });
  it("selon les poids", () => {
    expect(repartir(1000, [50, 30, 20])).toEqual([500, 300, 200]);
    expect(repartir(10, [1, 2])).toEqual([3, 7]); // 3,33 et 6,67 : le plus fort reste prend le centime
    expect(repartir(5, [0, 0, 1])).toEqual([0, 0, 5]);
    expect(repartir(1, [1, 1])).toEqual([1, 0]);
  });
  it("un total négatif se répartit comme son opposé", () => {
    expect(repartir(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(repartir(0, [1, 2])).toEqual([0, 0]);
  });
  it("la somme est toujours exacte (balayage de totaux et de poids)", () => {
    for (let total = -250; total <= 250; total += 7) {
      for (const poids of [[1], [1, 1], [1, 2, 3], [7, 0, 3], [13, 17, 19, 23], [1, 1, 1, 1, 1, 1, 1]]) {
        const parts = repartir(total, poids);
        expect(somme(parts), `${total} ${poids}`).toBe(total);
        parts.forEach((p, i) => {
          if (poids[i] === 0) expect(p).toBe(0);
          expect(Object.is(p, -0)).toBe(false);
        });
      }
    }
  });
  it("tient aux grands montants", () => {
    const parts = repartir(MAX_CENTIMES, [1, 1, 1]);
    expect(somme(parts)).toBe(MAX_CENTIMES);
  });
  it("refuse les poids invalides", () => {
    expect(() => repartir(100, [])).toThrow(RangeError);
    expect(() => repartir(100, [0, 0])).toThrow(RangeError);
    expect(() => repartir(100, [1, -1])).toThrow(RangeError);
    expect(() => repartir(100, [1, 0.5])).toThrow(RangeError);
    expect(() => repartirEgalement(100, 0)).toThrow(RangeError);
  });
});

describe("formatEuros", () => {
  it("écrit à la française : virgule, espace fine pour les milliers, espace insécable avant « € »", () => {
    expect(formatEuros(0)).toBe(`0,00${NBSP}€`);
    expect(formatEuros(5)).toBe(`0,05${NBSP}€`);
    expect(formatEuros(99)).toBe(`0,99${NBSP}€`);
    expect(formatEuros(1250)).toBe(`12,50${NBSP}€`);
    expect(formatEuros(123456)).toBe(`1${FINE}234,56${NBSP}€`);
    expect(formatEuros(100000000)).toBe(`1${FINE}000${FINE}000,00${NBSP}€`);
    expect(formatEuros(MAX_CENTIMES)).toBe(`10${FINE}000${FINE}000${FINE}000,00${NBSP}€`);
  });
  it("négatifs : un trait d'union, jamais « -0,00 »", () => {
    expect(formatEuros(-123456)).toBe(`-1${FINE}234,56${NBSP}€`);
    expect(formatEuros(-5)).toBe(`-0,05${NBSP}€`);
    expect(formatEuros(-0)).toBe(`0,00${NBSP}€`);
  });
  it("options : sans symbole, avec « + »", () => {
    expect(formatEuros(123456, { symbole: false })).toBe(`1${FINE}234,56`);
    expect(formatEuros(1250, { signe: "toujours" })).toBe(`+12,50${NBSP}€`);
    expect(formatEuros(0, { signe: "toujours" })).toBe(`0,00${NBSP}€`);
    expect(formatEuros(-1250, { signe: "toujours" })).toBe(`-12,50${NBSP}€`);
  });
  it("donne le même texte qu'Intl en fr-FR", () => {
    const intl = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
    for (const c of [0, 1, 99, 100, 1250, 99999, 100000, 123456, 987654321, -1, -123456, -100000000]) {
      expect(formatEuros(c), String(c)).toBe(intl.format(c / 100));
    }
  });
  it("refuse un montant invalide", () => {
    expect(() => formatEuros(12.5)).toThrow(RangeError);
    expect(() => formatEuros(NaN)).toThrow(RangeError);
  });
});

describe("parseEuros", () => {
  const bons: [string, number][] = [
    ["12,50", 1250],
    ["12.50", 1250],
    ["12,5", 1250],
    ["12", 1200],
    ["0,05", 5],
    ["0,5", 50],
    [",5", 50],
    [".5", 50],
    ["1234,56", 123456],
    ["1 234,56", 123456],
    [`1${FINE}234,56${NBSP}€`, 123456],
    ["1 234,56 €", 123456],
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["1.234.567,89", 123456789],
    ["1 000 000", 100000000],
    ["12 €", 1200],
    ["12€", 1200],
    ["12 EUR", 1200],
    ["12 euros", 1200],
    ["-3", -300],
    ["-3,50", -350],
    ["−3,50", -350], // vrai signe moins (U+2212)
    ["+3", 300],
    ["- 3", -300],
    ["  7,25  ", 725],
    ["10000000000", MAX_CENTIMES],
  ];
  for (const [texte, attendu] of bons) {
    it(`« ${texte} » → ${attendu}`, () => expect(parseEuros(texte)).toBe(attendu));
  }
  it("« -0 » donne 0, pas −0", () => {
    expect(Object.is(parseEuros("-0"), 0)).toBe(true);
    expect(Object.is(parseEuros("-0,00"), 0)).toBe(true);
  });
  const mauvais = [
    "", " ", "abc", "12 abc", "€", "-", ",", ".", "12,", "12.", "1,2,3", "1.2.3", "1,234,567", "12,505", "12.505", "1.234", "0,001",
    "12 34", "1 23", "1  234", "1,234.567", "1.234,5,6", "--3", "+-3", "10000000000,01", "99999999999999", "1e5", "NaN", "Infinity",
    "12,50,", "(12,50)", "12,5 5", "1 2345",
  ];
  for (const texte of mauvais) {
    it(`« ${texte} » est refusé (null), jamais arrondi en silence`, () => expect(parseEuros(texte)).toBeNull());
  }
  it("refuse ce qui n'est pas du texte", () => {
    expect(parseEuros(12 as unknown as string)).toBeNull();
    expect(parseEuros(undefined as unknown as string)).toBeNull();
  });
  it("relit ce que formatEuros écrit", () => {
    for (const c of [0, 1, 99, 100, 1250, 99999, 123456, 100000000, MAX_CENTIMES, -1, -123456, -MAX_CENTIMES]) {
      expect(parseEuros(formatEuros(c))).toBe(c);
      expect(parseEuros(formatEuros(c, { symbole: false }))).toBe(c);
    }
  });
});

describe("formatTaux et parseTaux", () => {
  it("écrit les points de base en pourcentage", () => {
    expect(formatTaux(2200)).toBe(`22${NBSP}%`);
    expect(formatTaux(2250)).toBe(`22,5${NBSP}%`);
    expect(formatTaux(525)).toBe(`5,25${NBSP}%`);
    expect(formatTaux(5)).toBe(`0,05${NBSP}%`);
    expect(formatTaux(0)).toBe(`0${NBSP}%`);
    expect(formatTaux(-50)).toBe(`-0,5${NBSP}%`);
    expect(formatTaux(10000)).toBe(`100${NBSP}%`);
  });
  it("lit un pourcentage saisi", () => {
    expect(parseTaux("22")).toBe(2200);
    expect(parseTaux("22 %")).toBe(2200);
    expect(parseTaux("22,5%")).toBe(2250);
    expect(parseTaux("5.25")).toBe(525);
    expect(parseTaux("0,05")).toBe(5);
    expect(parseTaux("-0,5 %")).toBe(-50);
  });
  it("refuse plus de deux décimales (un point de base = 0,01 %) et le reste", () => {
    expect(parseTaux("12,345")).toBeNull();
    expect(parseTaux("abc")).toBeNull();
    expect(parseTaux("")).toBeNull();
  });
  it("relit ce qu'il écrit", () => {
    for (const bp of [0, 5, 50, 525, 2200, 2250, 10000, -50, 123456]) expect(parseTaux(formatTaux(bp))).toBe(bp);
  });
  it("refuse un taux non entier à l'écriture", () => {
    expect(() => formatTaux(22.5)).toThrow(RangeError);
  });
});
