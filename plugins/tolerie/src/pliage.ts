// Calculs de pliage (cahier des charges des plugins, section 4) : développé d'une pièce pliée,
// vé conseillé et effort de pliage en l'air. Dimensions en mm, angles en degrés, efforts en N.
import table from "./data/matieres.json";

export interface Matiere {
  id: string;
  nom: string;
  /** Masse volumique en kg/dm³. */
  masseVolumique: number;
  /** Résistance à la traction en MPa. */
  rm: number;
  /** Limite d'élasticité en MPa. */
  re: number;
  /** Rayon intérieur mini, en multiple de l'épaisseur. */
  rayonMini: number;
}

export const MATIERES: Matiere[] = table.matieres;
export const SOURCE_MATIERES: string = table.source;
export const matiere = (id: string): Matiere => MATIERES.find((m) => m.id === id) ?? MATIERES[0]!;

const DEG = Math.PI / 180;

/**
 * Facteur K proposé d'après la norme DIN 6935 : position de la fibre neutre dans l'épaisseur.
 * K = (0,65 + 0,5 × log(Ri / e)) / 2, plafonné à 0,5 (fibre au milieu) et limité à 0,3 pour
 * les rayons très serrés, en dessous de la plage de la norme.
 */
export function kFactor(radius: number, thickness: number): number {
  if (!(radius > 0 && thickness > 0)) return 0.3;
  return Math.min(0.5, Math.max(0.3, (0.65 + 0.5 * Math.log10(radius / thickness)) / 2));
}

export interface Bend {
  /** Angle entre les deux ailes (90° pour une équerre). L'angle de pliage vaut 180° moins cet angle. */
  angle: number;
  /** Sens du pli, pour le dessin du profil (un U plie toujours du même côté, un Z alterne). */
  up: boolean;
}

export interface UnfoldInput {
  thickness: number;
  /** Rayon intérieur. */
  radius: number;
  /** Longueur de chaque aile, d'après les cotes du plan. */
  flanges: number[];
  /** Un pli entre deux ailes : flanges.length − 1 plis. */
  bends: Bend[];
  /** Cotes du plan : extérieures (au nu extérieur) ou intérieures. */
  dims: "ext" | "int";
  method: "k" | "deduction";
  k: number;
  /** Déduction par pli, lue dans les tables de l'atelier (cotes extérieures). */
  deduction: number;
}

export interface UnfoldResult {
  developed: number;
  /** Parties du flan, de gauche à droite : parties droites et plis. */
  parts: { kind: "aile" | "pli"; index: number; length: number }[];
  /** Position de chaque ligne de pli (milieu du pli), depuis le bord gauche du flan. */
  bendLines: number[];
  bends: {
    /** Angle de pliage (180° − angle entre les ailes). */
    alpha: number;
    /** Longueur du pli sur la fibre neutre. */
    allowance: number;
    /** Déduction équivalente, à comparer aux tables de l'atelier. */
    deduction: number;
  }[];
}

/** Développé d'une pièce pliée. Renvoie un message si la saisie est impossible. */
export function unfold(input: UnfoldInput): UnfoldResult | string {
  const { thickness: e, radius: ri, flanges, bends } = input;
  if (!(e > 0)) return "L'épaisseur doit être positive.";
  if (!(ri >= 0)) return "Le rayon intérieur ne peut pas être négatif.";
  if (flanges.length < 2) return "Il faut au moins deux ailes.";
  if (bends.length !== flanges.length - 1) return "Il faut un pli entre chaque aile.";
  for (const [i, length] of flanges.entries()) if (!(length > 0)) return `L'aile ${i + 1} doit avoir une longueur positive.`;
  for (const [i, b] of bends.entries()) {
    if (!(b.angle > 0 && b.angle < 180)) return `L'angle du pli ${i + 1} doit être compris entre 0 et 180°.`;
  }

  const alphas = bends.map((b) => 180 - b.angle);
  const halfTan = alphas.map((a) => Math.tan((a / 2) * DEG));
  // Retrait de chaque pli jusqu'à l'arête fictive (au nu extérieur ou intérieur).
  const setbackExt = halfTan.map((t) => (ri + e) * t);
  const setbackInt = halfTan.map((t) => ri * t);
  const setback = input.dims === "ext" ? setbackExt : setbackInt;

  if (input.method === "deduction") {
    if (!(input.deduction >= 0)) return "La déduction par pli doit être positive ou nulle.";
    // Les tables de déduction s'appliquent aux cotes extérieures : conversion si le plan est coté à l'intérieur.
    const ext = flanges.map((l, i) => l + (input.dims === "int" ? [i - 1, i].reduce((s, b) => s + (b >= 0 && b < bends.length ? e * halfTan[b]! : 0), 0) : 0));
    const developed = ext.reduce((s, l) => s + l, 0) - input.deduction * bends.length;
    let position = 0;
    const bendLines = bends.map((_, i) => {
      position += ext[i]! - (i === 0 ? input.deduction / 2 : input.deduction);
      return position;
    });
    const parts: UnfoldResult["parts"] = [];
    ext.forEach((l, i) => {
      const cut = (i > 0 ? input.deduction / 2 : 0) + (i < bends.length ? input.deduction / 2 : 0);
      parts.push({ kind: "aile", index: i, length: l - cut });
    });
    if (parts.some((p) => p.length <= 0)) return "Une aile est plus courte que la déduction de ses plis.";
    return { developed, parts, bendLines, bends: alphas.map((alpha) => ({ alpha, allowance: NaN, deduction: input.deduction })) };
  }

  const k = input.k;
  if (!(k >= 0 && k <= 1)) return "Le facteur K doit être compris entre 0 et 1.";
  const allowances = alphas.map((a) => a * DEG * (ri + k * e));
  const flats = flanges.map((l, i) => l - (i > 0 ? setback[i - 1]! : 0) - (i < bends.length ? setback[i]! : 0));
  const short = flats.findIndex((f) => f <= 0);
  if (short >= 0) return `L'aile ${short + 1} est trop courte pour ses plis (plus courte que le retrait du rayon).`;

  const parts: UnfoldResult["parts"] = [];
  const bendLines: number[] = [];
  let position = 0;
  flats.forEach((flat, i) => {
    parts.push({ kind: "aile", index: i, length: flat });
    position += flat;
    if (i < bends.length) {
      parts.push({ kind: "pli", index: i, length: allowances[i]! });
      bendLines.push(position + allowances[i]! / 2);
      position += allowances[i]!;
    }
  });
  return {
    developed: position,
    parts,
    bendLines,
    bends: alphas.map((alpha, i) => ({ alpha, allowance: allowances[i]!, deduction: 2 * setbackExt[i]! - allowances[i]! })),
  };
}

// ——— Vé et effort de pliage en l'air ———

/** Ouvertures de vé courantes chez les fabricants d'outillage de presse plieuse. */
export const STANDARD_VEES = [4, 6, 8, 10, 12, 16, 20, 24, 25, 30, 32, 35, 40, 45, 50, 55, 60, 63, 70, 80, 90, 100, 120, 125, 140, 150, 160, 180, 200, 250, 300];

/** Vé conseillé : 8 × e jusqu'à 8 mm, 10 × e de 8 à 20 mm, 12 × e au-delà, arrondi au vé courant le plus proche. */
export function recommendedVee(thickness: number): number {
  const factor = thickness <= 8 ? 8 : thickness <= 20 ? 10 : 12;
  const target = factor * thickness;
  let best = STANDARD_VEES[0]!;
  for (const v of STANDARD_VEES) {
    const [d, bestD] = [Math.abs(v - target), Math.abs(best - target)];
    // À égale distance, le plus grand : un vé plus ouvert demande moins d'effort.
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && v > best)) best = v;
  }
  return best;
}

/** Effort de pliage en l'air : F = 1,33 × Rm × e² × L / V, en newtons. */
export const bendingForce = (rm: number, thickness: number, length: number, vee: number): number =>
  (1.33 * rm * thickness * thickness * length) / vee;

/** Newtons en tonnes-force. */
export const toTonnes = (newtons: number): number => newtons / 9806.65;

/** Rayon intérieur obtenu en pliage en l'air : environ V / 6. */
export const airBendRadius = (vee: number): number => vee / 6;

/** Aile minimale pour qu'elle porte encore sur le vé : environ 0,7 × V. */
export const minFlange = (vee: number): number => 0.7 * vee;
