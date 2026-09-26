// Couple de serrage et précharge d'une vis (cahier des charges des plugins, section 5.4), par la
// méthode simplifiée de la VDI 2230. Dimensions en mm, efforts en N, couples en N·m.
import table from "./data/couples.json";
import { diametreFlancs, filetage, noyauVis } from "./filetage";

export interface Classe {
  id: string;
  nom: string;
  /** Limite élastique Rp0,2 en MPa. */
  rp: number;
}

export const CLASSES: Classe[] = table.classes;
export const FROTTEMENTS: { mu: number; nom: string }[] = table.frottements;
export const SOURCE_COUPLES: string = table.source;
export const classe = (id: string): Classe => CLASSES.find((c) => c.id === id) ?? CLASSES[0]!;

/** Diamètres couverts : ceux dont on connaît la clé. */
export const DIAMETRES: number[] = Object.keys(table.cles)
  .map(Number)
  .sort((a, b) => a - b);

/** Ouverture de clé d'une vis à tête hexagonale ISO 4017 (NaN si le diamètre n'est pas couvert). */
export function cle(d: number): number {
  const cles: Record<string, number> = table.cles;
  return cles[String(d)] ?? NaN;
}

/** Taux d'utilisation de la limite élastique au serrage. */
const NU = 0.9;

export interface Serrage {
  /** Précharge de montage FM, en N. */
  precharge: number;
  /** Couple de serrage MA, en N·m. */
  couple: number;
  /** Part du couple perdue sous la tête, dans les filets et utile (pas), en fractions de 1. */
  parts: { tete: number; filets: number; pas: number };
}

/**
 * Précharge de montage et couple de serrage d'une vis à pas gros.
 *   FM = ν × Rp0,2 × A0 / √(1 + 3 × [3/2 × d2/d0 × (P/(π d2) + 1,155 µ)]²), A0 = π d0²/4, d0 = (d2 + d3)/2
 *   MA = FM × (0,16 P + 0,58 d2 µ + Dkm/2 × µ), Dkm = (clé + passage moyen)/2
 * Le même µ sert dans les filets et sous la tête.
 */
export function serrage(d: number, rp: number, mu: number): Serrage | undefined {
  const f = filetage(d);
  const s = cle(d);
  if (!f || !(s > 0) || !(rp > 0) || !(mu > 0)) return undefined;
  const p = f.pas;
  const d2 = diametreFlancs(d, p);
  const d0 = (d2 + noyauVis(d, p)) / 2;
  const a0 = (Math.PI * d0 * d0) / 4;
  const torsion = 1.5 * (d2 / d0) * (p / (Math.PI * d2) + 1.155 * mu);
  const precharge = (NU * rp * a0) / Math.sqrt(1 + 3 * torsion * torsion);
  const dkm = (s + f.passage[1]!) / 2;
  const pas = 0.16 * p;
  const filets = 0.58 * d2 * mu;
  const tete = (dkm / 2) * mu;
  const total = pas + filets + tete;
  return {
    precharge,
    couple: (precharge * total) / 1000,
    parts: { tete: tete / total, filets: filets / total, pas: pas / total },
  };
}
