// Coupes d'angle (cahier des charges, section 9.3). Chaque bout de pièce est un plan : on le décrit
// par son recul e(y, z) ≥ 0 le long de la pièce, mesuré depuis la pointe (e = 0 à la pointe).
// Deux bouts voisins sur la barre doivent être séparés d'un trait de scie partout ; s'ils sont
// complémentaires (même angle, tube retourné), ils partagent une seule coupe : ils s'emboîtent.

/** Face sur laquelle l'angle se voit (la lame traverse l'autre dimension). */
export type Plane = "grande" | "petite";
/** Sens opposé : trapèze (montant de cadre). Même sens : parallélogramme. */
export type Sens = "oppose" | "meme";

export interface PieceShape {
  angleL: number;
  angleR: number;
  planeL: Plane;
  planeR: Plane;
  sens: Sens;
}

export const STRAIGHT: PieceShape = { angleL: 0, angleR: 0, planeL: "grande", planeR: "grande", sens: "oppose" };

/** Encombrement de la section (voir profil.ts) : largeur y, hauteur z. */
export interface Bounds {
  width: number;
  height: number;
  round: boolean;
}

/** Recul d'un bout : e(y, z) = c + a·y + b·z. */
export interface Lin {
  c: number;
  a: number;
  b: number;
}

const ZERO: Lin = { c: 0, a: 0, b: 0 };
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Axe sur lequel varie le recul pour une face donnée, et la dimension de la section sur cet axe. */
function axis(plane: Plane, s: Bounds): { onY: boolean; size: number } {
  const bigOnY = s.width >= s.height;
  const onY = s.round || (plane === "grande" ? bigOnY : !bigOnY);
  return { onY, size: onY ? s.width : s.height };
}

/**
 * Bouts d'une pièce dans son sens de saisie. Les pointes sont du même côté (w = +D/2) :
 * en sens opposé, la grande longueur est ce côté-là (trapèze) ; en même sens, la pointe
 * droite passe de l'autre côté (parallélogramme).
 */
export function ends(shape: PieceShape, s: Bounds): { left: Lin; right: Lin } {
  const end = (angle: number, plane: Plane, sign: 1 | -1): Lin => {
    if (!(angle > 0)) return ZERO;
    const { onY, size } = axis(plane, s);
    const tan = Math.tan(rad(Math.min(angle, 89)));
    // e = (D/2 − sign·w)·tan
    return { c: (size / 2) * tan, a: onY ? -sign * tan : 0, b: onY ? 0 : -sign * tan };
  };
  return {
    left: end(shape.angleL, shape.planeL, 1),
    right: end(shape.angleR, shape.planeR, shape.sens === "oppose" ? 1 : -1),
  };
}

/**
 * Les quatre façons de poser une pièce sur la barre : telle quelle, retournée (tournée d'un
 * demi-tour autour de son axe), bout pour bout (demi-tour à plat), ou bout pour bout sur le côté.
 */
export const ORIENTATIONS = [0, 1, 2, 3] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

const mirror = (f: Lin, sy: number, sz: number): Lin => ({ c: f.c, a: f.a * sy, b: f.b * sz });

export function oriented(e: { left: Lin; right: Lin }, o: Orientation): { left: Lin; right: Lin } {
  switch (o) {
    case 0:
      return e;
    case 1: // demi-tour autour de l'axe de la pièce
      return { left: mirror(e.left, -1, -1), right: mirror(e.right, -1, -1) };
    case 2: // bout pour bout, à plat
      return { left: mirror(e.right, -1, 1), right: mirror(e.left, -1, 1) };
    case 3: // bout pour bout, sur le côté
      return { left: mirror(e.right, 1, -1), right: mirror(e.left, 1, -1) };
  }
}

/** Plus petite valeur de c + A·y + B·z sur la section. */
function minOver(c: number, A: number, B: number, s: Bounds): number {
  if (s.round) return c - (s.width / 2) * Math.hypot(A, B);
  return c - (Math.abs(A) * s.width) / 2 - (Math.abs(B) * s.height) / 2;
}

const EPS = 1e-9;

/**
 * Écart entre la pointe droite d'une pièce et la pointe gauche de la suivante. Négatif quand
 * les coupes s'emboîtent : les pointes se chevauchent, une seule coupe sépare les deux pièces.
 * Le trait de scie est compté le long de la barre (plus large qu'à l'équerre pour une coupe d'angle).
 */
export function gap(right: Lin, left: Lin, kerf: number, s: Bounds): { gap: number; shared: boolean } {
  const A = right.a + left.a;
  const B = right.b + left.b;
  const c = right.c + left.c;
  const shared = Math.abs(A) < EPS && Math.abs(B) < EPS && c > EPS;
  // Pente du trait sur la barre : celle du bout le plus incliné.
  const slope = Math.max(Math.hypot(right.a, right.b), Math.hypot(left.a, left.b));
  const axialKerf = kerf * Math.sqrt(1 + slope * slope);
  return { gap: axialKerf - minOver(c, A, B, s), shared };
}

export interface Placed<T> {
  item: T;
  orientation: Orientation;
  /** Position de la pointe gauche depuis le début de la zone utile. */
  start: number;
  /** Coupe partagée avec la pièce précédente (emboîtement). */
  sharedWithPrevious: boolean;
}

export interface Arrangement<T> {
  placed: Placed<T>[];
  /** Longueur occupée, de la pointe gauche de la première pièce à la pointe droite de la dernière. */
  length: number;
}

/**
 * Ordre et sens des pièces sur une barre pour occuper le moins de longueur : à chaque pas, la pièce
 * (et sa pose) qui se colle le mieux à la précédente, en essayant chaque pièce de départ.
 * Les pièces identiques (même `kind`) ne sont essayées qu'une fois : rapide même avec beaucoup de pièces.
 */
export function arrange<T>(
  items: T[],
  info: (item: T) => { kind: number; length: number; ends: { left: Lin; right: Lin } },
  kerf: number,
  s: Bounds,
): Arrangement<T> {
  if (!items.length) return { placed: [], length: 0 };
  const data = items.map((item) => ({ item, ...info(item) }));
  const poses = data.map((d) => ORIENTATIONS.map((o) => oriented(d.ends, o)));

  let best: Arrangement<T> | null = null;
  const starts = new Map<number, number>();
  data.forEach((d, i) => {
    if (!starts.has(d.kind)) starts.set(d.kind, i);
  });

  for (const first of starts.values()) {
    for (const o0 of ORIENTATIONS) {
      const used = new Array<boolean>(data.length).fill(false);
      used[first] = true;
      const placed: Placed<T>[] = [{ item: data[first]!.item, orientation: o0, start: 0, sharedWithPrevious: false }];
      let end = data[first]!.length;
      let right = poses[first]![o0]!.right;
      for (let step = 1; step < data.length; step++) {
        let choice: { i: number; o: Orientation; gap: number; shared: boolean } | null = null;
        const seen = new Set<number>();
        for (let i = 0; i < data.length; i++) {
          if (used[i] || seen.has(data[i]!.kind)) continue;
          seen.add(data[i]!.kind);
          for (const o of ORIENTATIONS) {
            const g = gap(right, poses[i]![o]!.left, kerf, s);
            // À écart égal, la pièce la plus longue d'abord.
            if (!choice || g.gap < choice.gap - EPS || (Math.abs(g.gap - choice.gap) <= EPS && data[i]!.length > data[choice.i]!.length)) {
              choice = { i, o, gap: g.gap, shared: g.shared };
            }
          }
        }
        const { i, o, gap: g, shared } = choice!;
        used[i] = true;
        placed.push({ item: data[i]!.item, orientation: o, start: end + g, sharedWithPrevious: shared });
        end += g + data[i]!.length;
        right = poses[i]![o]!.right;
      }
      if (!best || end < best.length - EPS) best = { placed, length: end };
    }
  }
  return best!;
}
