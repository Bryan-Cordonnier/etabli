// Calculs de géométrie du plugin Maths. Angles en degrés côté utilisateur, radians en interne.

const DEG = Math.PI / 180;
const EPS = 1e-9;

// ——— Triangle quelconque ———

/** Côtés a, b, c et angles A, B, C : l'angle A est opposé au côté a, etc. */
export interface Triangle {
  a: number;
  b: number;
  c: number;
  A: number;
  B: number;
  C: number;
  area: number;
  perimeter: number;
  /** Hauteurs issues de A, B et C (perpendiculaires aux côtés a, b et c). */
  ha: number;
  hb: number;
  hc: number;
}

export type TriangleInput = Partial<Record<"a" | "b" | "c" | "A" | "B" | "C", number>>;

export type TriangleResult = { solutions: Triangle[] } | { error: string };

const SIDES = ["a", "b", "c"] as const;
const ANGLES = ["A", "B", "C"] as const;

function fromSides(a: number, b: number, c: number): Triangle | null {
  if (a + b <= c + EPS || a + c <= b + EPS || b + c <= a + EPS) return null;
  const A = Math.acos(Math.min(1, Math.max(-1, (b * b + c * c - a * a) / (2 * b * c)))) / DEG;
  const B = Math.acos(Math.min(1, Math.max(-1, (a * a + c * c - b * b) / (2 * a * c)))) / DEG;
  const C = 180 - A - B;
  const area = 0.5 * b * c * Math.sin(A * DEG);
  return { a, b, c, A, B, C, area, perimeter: a + b + c, ha: (2 * area) / a, hb: (2 * area) / b, hc: (2 * area) / c };
}

/** Résout un triangle à partir de 3 valeurs dont au moins un côté. Le cas « deux côtés et un
 *  angle non compris entre eux » peut avoir 0, 1 ou 2 solutions : toutes sont renvoyées. */
export function solveTriangle(input: TriangleInput): TriangleResult {
  const known = [...SIDES, ...ANGLES].filter((k) => input[k] !== undefined && Number.isFinite(input[k]));
  if (known.length < 3) return { error: "Renseignez 3 valeurs, dont au moins un côté." };
  if (known.length > 3) return { error: "Renseignez seulement 3 valeurs : les autres sont calculées." };
  for (const k of known) {
    if (!(input[k]! > 0)) return { error: "Les côtés et les angles doivent être positifs." };
  }
  const sides = SIDES.map((k) => input[k]);
  const angles = ANGLES.map((k) => input[k]);
  const knownSides = [0, 1, 2].filter((i) => sides[i] !== undefined);
  const knownAngles = [0, 1, 2].filter((i) => angles[i] !== undefined);

  if (knownSides.length === 0) return { error: "Avec trois angles, la taille est inconnue : ajoutez au moins un côté." };
  if (knownAngles.reduce((sum, i) => sum + angles[i]!, 0) >= 180) {
    return { error: "La somme des angles doit rester inférieure à 180°." };
  }

  const ok = (t: Triangle | null): TriangleResult =>
    t ? { solutions: [t] } : { error: "Ces valeurs ne forment pas un triangle." };

  // Trois côtés.
  if (knownSides.length === 3) return ok(fromSides(sides[0]!, sides[1]!, sides[2]!));

  // Un côté et deux angles : le troisième angle, puis la loi des sinus.
  if (knownSides.length === 1) {
    const missing = [0, 1, 2].find((i) => angles[i] === undefined)!;
    angles[missing] = 180 - knownAngles.reduce((sum, i) => sum + angles[i]!, 0);
    const i = knownSides[0]!;
    const k = sides[i]! / Math.sin(angles[i]! * DEG);
    return ok(fromSides(k * Math.sin(angles[0]! * DEG), k * Math.sin(angles[1]! * DEG), k * Math.sin(angles[2]! * DEG)));
  }

  // Deux côtés et un angle.
  const angleIndex = knownAngles[0]!;
  const missingSide = [0, 1, 2].find((i) => sides[i] === undefined)!;
  if (angleIndex === missingSide) {
    // Angle compris entre les deux côtés : loi des cosinus.
    const [i, j] = knownSides as [number, number];
    const x = sides[i]!;
    const y = sides[j]!;
    sides[missingSide] = Math.sqrt(x * x + y * y - 2 * x * y * Math.cos(angles[angleIndex]! * DEG));
    return ok(fromSides(sides[0]!, sides[1]!, sides[2]!));
  }

  // Angle opposé à un côté connu : cas ambigu (0, 1 ou 2 triangles).
  const opposite = sides[angleIndex]!;
  const other = knownSides.find((i) => i !== angleIndex)!;
  const sinOther = (sides[other]! * Math.sin(angles[angleIndex]! * DEG)) / opposite;
  if (sinOther > 1 + EPS) return { error: "Aucun triangle possible : le côté opposé à l'angle est trop court." };
  const candidates = [Math.asin(Math.min(1, sinOther)) / DEG];
  if (sinOther < 1 - EPS) candidates.push(180 - candidates[0]!);

  const solutions: Triangle[] = [];
  for (const otherAngle of candidates) {
    const third = 180 - angles[angleIndex]! - otherAngle;
    if (third <= EPS) continue;
    const k = opposite / Math.sin(angles[angleIndex]! * DEG);
    const s = [...sides];
    s[missingSide] = k * Math.sin(third * DEG);
    const t = fromSides(s[0]!, s[1]!, s[2]!);
    if (t) solutions.push(t);
  }
  return solutions.length ? { solutions } : { error: "Aucun triangle possible avec ces valeurs." };
}

// ——— Arc de cercle ———

export interface Arc {
  radius: number;
  /** Angle au centre, en degrés. */
  angle: number;
  chord: number;
  /** Flèche : hauteur de l'arc au milieu de la corde. */
  sagitta: number;
  length: number;
  /** Aire du segment (entre l'arc et la corde). */
  segmentArea: number;
}

export type ArcInput = Partial<Record<"chord" | "sagitta" | "radius" | "angle" | "length", number>>;

function arcFrom(radius: number, theta: number): Arc {
  return {
    radius,
    angle: theta / DEG,
    chord: 2 * radius * Math.sin(theta / 2),
    sagitta: radius * (1 - Math.cos(theta / 2)),
    length: radius * theta,
    segmentArea: (radius * radius * (theta - Math.sin(theta))) / 2,
  };
}

/** Racine de f sur [lo, hi] par dichotomie (f change de signe sur l'intervalle). */
function bisect(f: (x: number) => number, lo: number, hi: number): number {
  let flo = f(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (flo * fm <= 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

/** Calcule l'arc à partir de deux valeurs parmi corde, flèche, rayon, angle et longueur. */
export function solveArc(input: ArcInput): Arc | string {
  const keys = (["chord", "sagitta", "radius", "angle", "length"] as const).filter(
    (k) => input[k] !== undefined && Number.isFinite(input[k]),
  );
  if (keys.length < 2) return "Renseignez deux valeurs : les autres sont calculées.";
  if (keys.length > 2) return "Renseignez seulement deux valeurs.";
  for (const k of keys) if (!(input[k]! > 0)) return "Les valeurs doivent être positives.";

  const { chord: c, sagitta: f, radius: R, length: s } = input;
  const theta = input.angle !== undefined ? input.angle * DEG : undefined;
  const has = (a: keyof ArcInput, b: keyof ArcInput) => keys.includes(a) && keys.includes(b);

  if (theta !== undefined && theta >= 2 * Math.PI) return "L'angle doit être inférieur à 360°.";

  if (has("radius", "angle")) return arcFrom(R!, theta!);
  if (has("radius", "chord")) {
    if (c! > 2 * R!) return "La corde ne peut pas dépasser le diamètre.";
    return arcFrom(R!, 2 * Math.asin(c! / (2 * R!)));
  }
  if (has("radius", "sagitta")) {
    if (f! > 2 * R!) return "La flèche ne peut pas dépasser le diamètre.";
    return arcFrom(R!, 2 * Math.acos(1 - f! / R!));
  }
  if (has("radius", "length")) {
    if (s! >= 2 * Math.PI * R!) return "L'arc ne peut pas dépasser le tour complet.";
    return arcFrom(R!, s! / R!);
  }
  if (has("chord", "sagitta")) {
    const radius = (c! * c!) / (8 * f!) + f! / 2;
    return arcFrom(radius, 2 * Math.atan2(c! / 2, radius - f!));
  }
  if (has("chord", "angle")) return arcFrom(c! / (2 * Math.sin(theta! / 2)), theta!);
  if (has("sagitta", "angle")) return arcFrom(f! / (1 - Math.cos(theta! / 2)), theta!);
  if (has("length", "angle")) return arcFrom(s! / theta!, theta!);
  if (has("chord", "length")) {
    // c / s = sin(θ/2) / (θ/2), qui décroît de 1 à 0 quand θ va de 0 à 2π.
    if (s! <= c!) return "L'arc doit être plus long que la corde.";
    const t = bisect((x) => Math.sin(x / 2) / (x / 2) - c! / s!, 1e-9, 2 * Math.PI - 1e-9);
    return arcFrom(s! / t, t);
  }
  // Flèche et longueur : f / s = (1 − cos(θ/2)) / θ, maximum vers θ ≈ 2,33 rad. On retient l'arc
  // le plus plat (la solution avant ce maximum).
  const ratio = f! / s!;
  const g = (x: number) => (1 - Math.cos(x / 2)) / x;
  let peak = 0;
  for (let x = 0.01; x < 2 * Math.PI; x += 0.001) if (g(x) > g(peak || 0.01)) peak = x;
  if (ratio > g(peak)) return "La flèche est trop grande pour cette longueur d'arc.";
  const t = bisect((x) => g(x) - ratio, 1e-9, peak);
  return arcFrom(s! / t, t);
}

// ——— Conversions ———

export type LengthUnit = "mm" | "cm" | "m" | "in" | "ft";

export const LENGTH_TO_MM: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

/** Lit une longueur en pouces, fractions comprises : « 1 3/8 », « 3/4 », « 2,5 ». */
export function parseInches(text: string, evaluate: (s: string) => number): number {
  const t = text.trim().replace(/["″]$/, "").trim();
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  return evaluate(t);
}

/** Pouces en fraction au 1/64 près, simplifiée : 34,925 mm → « 1 3/8" ». */
export function toFraction(inches: number, denominator = 64): string {
  if (!Number.isFinite(inches)) return "—";
  const sign = inches < 0 ? "-" : "";
  let whole = Math.floor(Math.abs(inches));
  let num = Math.round((Math.abs(inches) - whole) * denominator);
  let den = denominator;
  if (num === den) {
    whole += 1;
    num = 0;
  }
  while (num > 0 && num % 2 === 0 && den % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  if (num === 0) return `${sign}${whole}"`;
  return whole ? `${sign}${whole} ${num}/${den}"` : `${sign}${num}/${den}"`;
}

export type SlopeUnit = "deg" | "rad" | "percent" | "mmPerM" | "ratio";

/** Angle en degrés depuis une pente ou un angle exprimé dans une autre unité. */
export function toDegrees(value: number, unit: SlopeUnit): number {
  switch (unit) {
    case "deg":
      return value;
    case "rad":
      return value / DEG;
    case "percent":
      return Math.atan(value / 100) / DEG;
    case "mmPerM":
      return Math.atan(value / 1000) / DEG;
    case "ratio":
      // Pente « 1 : n » : on monte de 1 pour n de long.
      return Math.atan(1 / value) / DEG;
  }
}

export function slopeFromDegrees(degrees: number): Record<SlopeUnit, number> & { ratio: number } {
  const t = Math.tan(degrees * DEG);
  return { deg: degrees, rad: degrees * DEG, percent: t * 100, mmPerM: t * 1000, ratio: 1 / t };
}
