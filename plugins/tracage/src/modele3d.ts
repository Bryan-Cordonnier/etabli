// Pièces de traçage en volume, pour l'aperçu 3D. Calcul pur (sans three.js) : chaque forme est
// décrite par des surfaces réglées (anneaux de génératrices, fermés autour de la pièce), avec leur
// épaisseur, des lignes (génératrices, soudure, raccords) et des étiquettes (numéros du tableau de
// traçage, coins). Repère three.js : y vers le haut, mm.
import { contactPiquage, type Coude, type Cone, type Piquage, type Virole } from "./developpes";
import type { P3, Tremie } from "./tremie";

export type { P3 };

export interface Surface3D {
  /** rings[i][j] : génératrice i (autour de la pièce, fermé), point j (le long de la génératrice). */
  rings: P3[][];
  thickness: number;
  /** piece : la pièce tracée ; piece2 : segment voisin (autre teinte) ; context : tube principal. */
  role: "piece" | "piece2" | "context";
}

export interface Line3D {
  from: P3;
  to: P3;
  /** trace : génératrice ou pliage léger ; seam : soudure ; joint : raccord entre tôles ou secteurs. */
  kind: "trace" | "seam" | "joint";
}

export interface Label3D {
  at: P3;
  text: string;
  /** Côté vers lequel l'étiquette regarde : estompée quand la pièce la cache. */
  normal: P3;
  kind: "num" | "name";
}

export interface Model3D {
  surfaces: Surface3D[];
  lines: Line3D[];
  labels: Label3D[];
}

const add = (a: P3, b: P3): P3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: P3, k: number): P3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: P3): P3 => {
  const l = Math.hypot(...a);
  return l > 0 ? mul(a, 1 / l) : [0, 1, 0];
};

/** Nombre de facettes autour d'un tube : assez pour paraître rond, peu pour les PC modestes. */
const AROUND = 96;

/** Une étiquette sur `step` : 12 numéros au plus autour de la pièce, sinon ils se chevauchent. */
const labelStep = (count: number) => Math.max(1, Math.ceil(count / 12));

/** Place d'un numéro sur sa génératrice : à mi-longueur, un plus haut, un plus bas (quinconce). */
const stagger = (from: P3, to: P3, k: number, outward: P3): P3 => add(add(from, mul(sub(to, from), k % 2 ? 0.64 : 0.36)), outward);

/** Point d'un cylindre ou d'un cône d'axe vertical : rayon, angle depuis la soudure (vers l'avant), hauteur. */
const around = (radius: number, phi: number, y: number): P3 => [radius * Math.sin(phi), y, radius * Math.cos(phi)];
const radial = (phi: number): P3 => [Math.sin(phi), 0, Math.cos(phi)];

// ——— Virole ———

export function viroleModel(v: Virole, thickness: number, numbered: boolean): Model3D {
  const r = v.dm / 2;
  const h = (v.maxHeight + v.minHeight) / 2;
  const rise = (v.maxHeight - v.minHeight) / 2;
  const top = (phi: number) => h - rise * Math.cos(phi);
  const out = r + thickness / 2;
  const rings = Array.from({ length: AROUND }, (_, i) => {
    const phi = (2 * Math.PI * i) / AROUND;
    return [around(r, phi, 0), around(r, phi, top(phi))];
  });
  const lines: Line3D[] = [{ from: around(out, 0, 0), to: around(out, 0, top(0)), kind: "seam" }];
  for (let p = 1; p < v.pieces; p++) {
    const phi = (2 * Math.PI * p) / v.pieces;
    lines.push({ from: around(out, phi, 0), to: around(out, phi, top(phi)), kind: "joint" });
  }
  const labels: Label3D[] = [];
  const rows = v.table.slice(0, -1);
  const step = labelStep(rows.length);
  rows.forEach((row, k) => {
    const phi = (row.angle * Math.PI) / 180;
    const [from, to] = [around(out, phi, 0), around(out, phi, top(phi))];
    if (numbered && k > 0) lines.push({ from, to, kind: "trace" });
    if (numbered && k % step === 0) labels.push({ at: stagger(from, to, k / step, mul(radial(phi), r * 0.04)), text: String(row.n), normal: radial(phi), kind: "num" });
  });
  if (!numbered) labels.push({ at: around(out * 1.06, 0, top(0)), text: "soudure", normal: radial(0), kind: "name" });
  return { surfaces: [{ rings, thickness, role: "piece" }], lines, labels };
}

// ——— Tronçon de cône ———

export function coneModel(c: Cone, thickness: number, sectors: number): Model3D {
  const radius = (t: number) => c.R + (c.r - c.R) * t;
  const point = (phi: number, t: number, extra = 0) => around(radius(t) + extra, phi, c.height * t);
  const rings = Array.from({ length: AROUND }, (_, i) => {
    const phi = (2 * Math.PI * i) / AROUND;
    return [point(phi, 0), point(phi, 1)];
  });
  const out = thickness / 2;
  const lines: Line3D[] = [];
  const s = Math.max(1, Math.round(sectors));
  for (let k = 0; k < s; k++) {
    const phi = (2 * Math.PI * k) / s;
    lines.push({ from: point(phi, 0, out), to: point(phi, 1, out), kind: k === 0 ? "seam" : "joint" });
  }
  // Génératrices de roulage, comme les lignes rouges du flan.
  const perSector = Math.max(4, Math.round(24 / s));
  for (let k = 0; k < s * perSector; k++) {
    if (k % perSector === 0) continue;
    const phi = (2 * Math.PI * k) / (s * perSector);
    lines.push({ from: point(phi, 0, out), to: point(phi, 1, out), kind: "trace" });
  }
  const labels: Label3D[] = [{ at: point(0, 0.5, out + c.R * 0.08), text: "soudure", normal: radial(0), kind: "name" }];
  return { surfaces: [{ rings, thickness, role: "piece" }], lines, labels };
}

// ——— Piquage ———

export interface PiquageModelInput {
  angle: number;
  offset: number;
  length: number;
  thickness: number;
  mainThickness: number;
}

export function piquageModel(p: Piquage, input: PiquageModelInput): Model3D {
  const beta = ((input.angle || 90) * Math.PI) / 180;
  const R = p.mainRadius;
  const r = p.contactRadius;
  const rm = p.dm / 2;
  // Repère du calcul (x le long du tube principal, z vers le haut) → three.js (y vers le haut),
  // tourné pour que la soudure (φ = 0) soit face à la caméra.
  const toThree = ([x, y, z]: P3): P3 => [-x, z, y];
  const axis: P3 = [Math.cos(beta), 0, Math.sin(beta)];
  const across: P3 = [0, 1, 0];
  const side: P3 = [-Math.sin(beta), 0, Math.cos(beta)];
  // Génératrice d'angle φ du piquage, à la distance ρ de son axe, à la hauteur t le long de l'axe.
  const branch = (phi: number, rho: number, t: number): P3 =>
    add(add(add(mul(axis, t), mul(across, input.offset)), mul(across, rho * Math.cos(phi))), mul(side, rho * Math.sin(phi)));
  const cut = (phi: number) => contactPiquage(R, r, input.offset, beta, phi).t;
  const rings = Array.from({ length: AROUND }, (_, i) => {
    const phi = (2 * Math.PI * i) / AROUND;
    return [toThree(branch(phi, rm, cut(phi))), toThree(branch(phi, rm, input.length))];
  });

  // Tube principal : assez long pour dépasser le trou de chaque côté.
  const xs = p.hole.map((h) => h[1]);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const half = (maxX - minX) / 2 + 1.2 * Math.max(R, rm);
  const cx = (minX + maxX) / 2;
  const Rm = R - input.mainThickness / 2;
  const main = Array.from({ length: AROUND }, (_, i) => {
    const a = (2 * Math.PI * i) / AROUND;
    return [toThree([cx - half, Rm * Math.cos(a), Rm * Math.sin(a)]), toThree([cx + half, Rm * Math.cos(a), Rm * Math.sin(a)])];
  });

  const out = rm + input.thickness / 2;
  const lines: Line3D[] = [];
  const labels: Label3D[] = [];
  const rows = p.table.slice(0, -1);
  const step = labelStep(rows.length);
  const normal = (phi: number) => toThree(add(mul(across, Math.cos(phi)), mul(side, Math.sin(phi))));
  rows.forEach((row, k) => {
    const phi = (row.angle * Math.PI) / 180;
    const [from, to] = [toThree(branch(phi, out, cut(phi))), toThree(branch(phi, out, input.length))];
    lines.push({ from, to, kind: k === 0 ? "seam" : "trace" });
    if (k % step === 0) labels.push({ at: stagger(from, to, k / step, mul(normal(phi), rm * 0.06)), text: String(row.n), normal: normal(phi), kind: "num" });
  });
  return {
    surfaces: [
      { rings: main, thickness: input.mainThickness, role: "context" },
      { rings, thickness: input.thickness, role: "piece" },
    ],
    lines,
    labels,
  };
}

// ——— Coude à segments ———

export interface CoudeModelInput {
  bendRadius: number;
  angle: number;
  joints: number;
  straight: number;
  thickness: number;
}

/** Axe et plans de coupe de chaque segment : demi-segment, segments entiers, demi-segment. */
export function coudeSegments(input: CoudeModelInput): { start: P3; dir: P3; out: P3; cutStart: [P3, P3]; cutEnd: [P3, P3] }[] {
  const joints = Math.max(1, Math.round(input.joints));
  const beta = ((input.angle / (2 * joints)) * Math.PI) / 180;
  const tan = Math.tan(beta);
  const straight = Math.max(0, input.straight || 0);
  // Le coude part vers le haut et tourne vers +x ; « out » pointe vers l'extrados.
  const dir = (k: number): P3 => [Math.sin(2 * beta * k), Math.cos(2 * beta * k), 0];
  const outOf = (k: number): P3 => [-Math.cos(2 * beta * k), Math.sin(2 * beta * k), 0];
  const lengths = Array.from({ length: joints + 1 }, (_, k) => (k === 0 || k === joints ? input.bendRadius * tan + straight : 2 * input.bendRadius * tan));
  const points: P3[] = [[0, 0, 0]];
  lengths.forEach((l, k) => points.push(add(points[k]!, mul(dir(k), l))));
  return lengths.map((_, k) => ({
    start: points[k]!,
    dir: dir(k),
    out: outOf(k),
    // Plan de coupe : un point et sa normale. Joint : plan bissecteur entre deux segments.
    cutStart: [points[k]!, k === 0 ? dir(0) : unit(add(dir(k - 1), dir(k)))],
    cutEnd: [points[k + 1]!, k === joints ? dir(joints) : unit(add(dir(k), dir(k + 1)))],
  }));
}

export function coudeModel(c: Coude, input: CoudeModelInput): Model3D {
  const r = c.dm / 2;
  const segments = coudeSegments(input);
  const binormal: P3 = [0, 0, 1];
  // Génératrice d'angle φ (0 à l'extrados) d'un segment, coupée par ses deux plans.
  const generatrix = (seg: (typeof segments)[number], phi: number, rho: number): [P3, P3] => {
    const w = add(mul(seg.out, Math.cos(phi)), mul(binormal, Math.sin(phi)));
    const base = add(seg.start, mul(w, rho));
    const at = ([point, normal]: [P3, P3]) => add(base, mul(seg.dir, dot(sub(point, base), normal) / dot(seg.dir, normal)));
    return [at(seg.cutStart), at(seg.cutEnd)];
  };
  const out = r + input.thickness / 2;
  const surfaces: Surface3D[] = segments.map((seg, k) => ({
    rings: Array.from({ length: AROUND }, (_, i) => generatrix(seg, (2 * Math.PI * i) / AROUND, r)),
    thickness: input.thickness,
    role: k % 2 === 0 ? "piece" : "piece2",
  }));
  const lines: Line3D[] = segments.map((seg) => {
    const [from, to] = generatrix(seg, 0, out);
    return { from, to, kind: "seam" };
  });
  // Numéros du tableau sur le premier segment entier (ou le premier demi-segment s'il n'y en a pas).
  const numbered = segments[segments.length > 2 ? 1 : 0]!;
  const rows = c.table.slice(0, -1);
  const step = labelStep(rows.length);
  const labels: Label3D[] = [];
  rows.forEach((row, k) => {
    const phi = (row.angle * Math.PI) / 180;
    const [from, to] = generatrix(numbered, phi, out);
    if (k > 0) lines.push({ from, to, kind: "trace" });
    if (k % step === 0) {
      const w = add(mul(numbered.out, Math.cos(phi)), mul(binormal, Math.sin(phi)));
      labels.push({ at: stagger(from, to, k / step, mul(w, r * 0.06)), text: String(row.n), normal: w, kind: "num" });
    }
  });
  return { surfaces, lines, labels };
}

// ——— Trémie carré-rond ———

export function tremieModel(t: Tremie, thickness: number): Model3D {
  // Repère du calcul (z vers le haut) → three.js.
  const toThree = ([x, y, z]: P3): P3 => [x, z, -y];
  const rings = t.solid.rulings.map(([bottom, top]) => [toThree(bottom), toThree(top)]);
  const lines: Line3D[] = [];
  const labels: Label3D[] = [];
  const center: P3 = [0, 0, 0];
  const horizontal = (p: P3, c: P3): P3 => unit(toThree([p[0] - c[0], p[1] - c[1], 0]));
  // Pliage léger : génératrices qui partent des coins.
  t.solid.rulings.forEach(([bottom, top], i) => {
    if (i === 0) return;
    lines.push({ from: toThree(bottom), to: toThree(top), kind: "trace" });
  });
  lines.push({ from: toThree(t.solid.seam), to: toThree(t.solid.circle[0]!), kind: "seam" });
  const height = t.solid.circle[0]![2];
  const circleCenter: P3 = [t.solid.circle.reduce((s, p) => s + p[0], 0) / t.solid.circle.length, t.solid.circle.reduce((s, p) => s + p[1], 0) / t.solid.circle.length, height];
  for (const [name, corner] of Object.entries(t.solid.corners)) {
    const n = horizontal(corner, center);
    labels.push({ at: add(toThree(corner), mul(n, Math.max(t.mean.length, t.mean.width) * 0.06)), text: name, normal: n, kind: "name" });
  }
  const step = labelStep(t.solid.circle.length);
  t.solid.circle.forEach((p, k) => {
    if (k % step !== 0) return;
    const n = horizontal(p, circleCenter);
    labels.push({ at: add(toThree(p), add(mul(n, t.mean.diameter * 0.08), [0, t.mean.diameter * 0.04, 0])), text: String(k), normal: n, kind: "num" });
  });
  labels.push({ at: add(toThree(t.solid.seam), mul(horizontal(t.solid.seam, center), t.mean.length * 0.08)), text: "soudure", normal: horizontal(t.solid.seam, center), kind: "name" });
  return { surfaces: [{ rings, thickness, role: "piece" }], lines, labels };
}

// ——— Coque épaisse ———

export interface ShellGeometry {
  /** Faces intérieure et extérieure, indexées (normales lissées par three.js). */
  surface: { positions: number[]; indices: number[] };
  /** Chants aux deux bouts des génératrices, en triangles séparés (arêtes vives). */
  caps: number[];
}

/**
 * Épaissit une surface réglée : chaque point est décalé d'une demi-épaisseur de part et d'autre,
 * le long de la normale moyenne des facettes voisines. Épaisseur nulle : la surface seule.
 */
export function shell(rings: P3[][], thickness: number): ShellGeometry {
  const n = rings.length;
  const m = rings[0]?.length ?? 0;
  const normals = rings.map((ring) => ring.map((): P3 => [0, 0, 0]));
  // Normale d'une facette : produit vectoriel de ses diagonales (juste aussi pour les facettes
  // réduites à un triangle, en éventail autour d'un coin de trémie), ajoutée à ses quatre sommets.
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j + 1 < m; j++) {
      const corners: [number, number][] = [[i, j], [i2, j], [i2, j + 1], [i, j + 1]];
      const [a, b, c, d] = corners.map(([x, y]) => rings[x]![y]!) as [P3, P3, P3, P3];
      const face = cross(sub(c, a), sub(d, b));
      for (const [x, y] of corners) normals[x]![y] = add(normals[x]![y]!, face);
    }
  }
  const half = Math.max(0, thickness) / 2;
  const layers = half > 0 ? [half, -half] : [0];
  const positions: number[] = [];
  for (const offset of layers) {
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) positions.push(...add(rings[i]![j]!, mul(unit(normals[i]![j]!), offset)));
  }
  const index = (layer: number, i: number, j: number) => layer * n * m + (i % n) * m + j;
  const indices: number[] = [];
  layers.forEach((_, layer) => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j + 1 < m; j++) {
        const [a, b, c, d] = [index(layer, i, j), index(layer, i + 1, j), index(layer, i + 1, j + 1), index(layer, i, j + 1)];
        // Face intérieure tournée de l'autre côté.
        if (layer === 0) indices.push(a, b, c, a, c, d);
        else indices.push(a, c, b, a, d, c);
      }
    }
  });
  const caps: number[] = [];
  if (layers.length === 2) {
    const at = (layer: number, i: number, j: number) => positions.slice(index(layer, i, j) * 3, index(layer, i, j) * 3 + 3);
    for (const j of [0, m - 1]) {
      for (let i = 0; i < n; i++) {
        const [a, b, c, d] = [at(0, i, j), at(0, i + 1, j), at(1, i + 1, j), at(1, i, j)];
        caps.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
  }
  return { surface: { positions, indices }, caps };
}
