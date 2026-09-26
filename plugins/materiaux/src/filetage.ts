// Filetages métriques ISO : perçage avant taraudage, trous de passage, lamages
// (cahier des charges des plugins, section 5.2). Dimensions en mm.
import table from "./data/filetages.json";

export interface Filetage {
  /** Diamètre nominal. */
  d: number;
  /** Pas gros. */
  pas: number;
  /** Pas fins courants. */
  fins: number[];
  /** Foret de taraudage au pas gros (DIN 336). */
  foret: number;
  /** Trous de passage ISO 273 : série fine, moyenne, large. */
  passage: number[];
  /** Lamage pour vis CHC ISO 4762 : diamètre et profondeur. */
  lamage: number[];
}

export const FILETAGES: Filetage[] = table.filetages;
export const SOURCE_FILETAGES: string = table.source;

export const filetage = (d: number): Filetage | undefined => FILETAGES.find((f) => f.d === d);

/** « M8 », « M8 × 1 » (pas fin), « M1,6 ». */
export function designation(d: number, pas: number): string {
  const f = filetage(d);
  const nom = `M${String(d).replace(".", ",")}`;
  return f && pas !== f.pas ? `${nom} × ${String(pas).replace(".", ",")}` : nom;
}

/** Foret de taraudage : celui de la table au pas gros, d − P au pas fin. */
export function foretTaraudage(d: number, pas: number): number {
  const f = filetage(d);
  if (f && pas === f.pas) return f.foret;
  return round(d - pas, 0.01);
}

/** Foret pour taraud à refouler (sans copeau) : ≈ d − P/2, arrondi au 0,05 mm. */
export const foretRefouler = (d: number, pas: number): number => round(d - pas / 2, 0.05);

/** Diamètre sur flancs d2 (ISO 724). */
export const diametreFlancs = (d: number, pas: number): number => d - 0.649519 * pas;

/** Diamètre du noyau de la vis d3 (ISO 724). */
export const noyauVis = (d: number, pas: number): number => d - 1.226869 * pas;

/** Diamètre intérieur du taraudage D1 (ISO 724). */
export const interieurTaraudage = (d: number, pas: number): number => d - 1.082532 * pas;

/** Section résistante As de la vis (ISO 898-1), en mm². */
export function sectionResistante(d: number, pas: number): number {
  const ds = (diametreFlancs(d, pas) + noyauVis(d, pas)) / 2;
  return (Math.PI * ds * ds) / 4;
}

function round(value: number, step: number): number {
  return Math.round(value / step + 1e-9) * step;
}
