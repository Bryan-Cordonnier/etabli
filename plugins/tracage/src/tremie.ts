// Trémie carré-rond (transition rectangle → cercle) par triangulation (cahier des charges des
// plugins, section 6.5). Le rectangle est en bas (z = 0), le cercle en haut (z = H), décalé si
// besoin. Chaque coin du rectangle est relié à un quart des points du cercle (triangles en
// éventail, « pliage léger ») ; chaque côté forme un triangle plan avec le point du cercle en face.
// On calcule la vraie grandeur de chaque arête, puis on déplie les triangles un à un, en partant
// d'une soudure au milieu d'un côté. Dimensions à la fibre moyenne, en mm.
import type { FlatPattern, Point } from "./developpes";

export interface TremieInput {
  /** Rectangle du bas : longueur (le long de x) et largeur (le long de y). */
  length: number;
  width: number;
  /** Cercle du haut : diamètre. */
  diameter: number;
  height: number;
  /** Décalage du centre du cercle par rapport au centre du rectangle. */
  offsetX: number;
  offsetY: number;
  /** Nombre de divisions du cercle (multiple de 4). */
  divisions: number;
}

type P3 = [number, number, number];

export interface Tremie {
  /** Vraies grandeurs : pour chaque coin, la longueur vers chacun de ses points du cercle. */
  trueLengths: { corner: string; point: number; length: number }[];
  /** Longueur de la soudure (du milieu du côté au cercle). */
  seam: number;
  /** Surface de tôle (somme des triangles), mm². */
  area: number;
  divisions: number;
  pattern: FlatPattern;
}

const dist = (a: P3, b: P3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const cross2 = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Troisième sommet d'un triangle déplié : à dA de A, à dB de B, du côté `side` de la droite AB. */
function place(A: Point, B: Point, dA: number, dB: number, side: 1 | -1): Point {
  const d = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const along = (dA * dA - dB * dB + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, dA * dA - along * along));
  const [ux, uy] = [(B[0] - A[0]) / d, (B[1] - A[1]) / d];
  // Normale à gauche de AB : (−uy, ux).
  return [A[0] + along * ux - side * h * uy, A[1] + along * uy + side * h * ux];
}

export function tremie(input: TremieInput): Tremie | string {
  const { length: a, width: b, diameter, height: H } = input;
  if (![a, b, diameter, H].every((v) => v > 0 && Number.isFinite(v))) return "Les dimensions du rectangle, le diamètre et la hauteur doivent être positifs.";
  const n = Math.max(8, Math.round(input.divisions / 4) * 4);
  const q = n / 4;
  const r = diameter / 2;
  const [dx, dy] = [input.offsetX || 0, input.offsetY || 0];

  const corners: Record<string, P3> = {
    C1: [a / 2, b / 2, 0],
    C2: [-a / 2, b / 2, 0],
    C3: [-a / 2, -b / 2, 0],
    C4: [a / 2, -b / 2, 0],
  };
  const M: P3 = [a / 2, 0, 0];
  const P = (k: number): P3 => {
    const t = (2 * Math.PI * (k % n)) / n;
    return [dx + r * Math.cos(t), dy + r * Math.sin(t), H];
  };

  // Dépliage : chaque nouveau point est placé à ses vraies distances de deux points déjà placés,
  // du côté opposé au triangle précédent (les triangles ne se replient pas les uns sur les autres).
  const flat = new Map<string, Point>();
  const area = { value: 0 };
  const put = (name: string, p: Point) => flat.set(name, p);
  const get = (name: string) => flat.get(name)!;
  const unfold = (A: string, B: string, X: string, a3: P3, b3: P3, x3: P3, previous: string) => {
    const pA = get(A);
    const pB = get(B);
    const side = cross2(pA, pB, get(previous)) > 0 ? -1 : 1;
    put(X, place(pA, pB, dist(a3, x3), dist(b3, x3), side));
    // Aire du triangle en vraie grandeur (formule de Héron via le produit vectoriel 3D).
    const [u, v] = [b3.map((c, i) => c - a3[i]!), x3.map((c, i) => c - a3[i]!)] as [number[], number[]];
    area.value += Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
  };

  put("M", [0, 0]);
  put("P0", [0, dist(M, P(0))]);
  // Premier triangle : M, P0, C1, déplié vers la droite.
  put("C1", place(get("M"), get("P0"), dist(M, corners.C1!), dist(P(0), corners.C1!), -1));
  {
    const [u, v] = [corners.C1!.map((c, i) => c - M[i]!), P(0).map((c, i) => c - M[i]!)];
    area.value += Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
  }

  const trueLengths: Tremie["trueLengths"] = [];
  const order = ["C1", "C2", "C3", "C4"] as const;
  let previousThird = "M";
  const fold: [string, string][] = [];
  order.forEach((corner, ci) => {
    const c3 = corners[corner]!;
    // Éventail du coin : points ci·q à (ci + 1)·q.
    for (let k = ci * q; k <= (ci + 1) * q; k++) {
      trueLengths.push({ corner, point: k % n, length: dist(c3, P(k)) });
      fold.push([corner, `P${k}`]);
      if (k === ci * q) continue;
      unfold(corner, `P${k - 1}`, `P${k}`, c3, P(k - 1), P(k), previousThird);
      previousThird = `P${k - 1}`;
    }
    const last = `P${(ci + 1) * q}`;
    if (ci < 3) {
      // Triangle plan du côté : coin suivant, placé depuis (coin, point du cercle en face).
      const next = order[ci + 1]!;
      unfold(corner, last, next, c3, P((ci + 1) * q), corners[next]!, `P${(ci + 1) * q - 1}`);
      previousThird = corner;
    }
  });
  // Dernier demi-triangle : du coin C4 à l'autre bord de la soudure (M').
  unfold("C4", `P${n}`, "M'", corners.C4!, P(n), M, `P${n - 1}`);

  const top = Array.from({ length: n + 1 }, (_, k) => get(`P${n - k}`));
  const contour: Point[] = [get("M"), get("C1"), get("C2"), get("C3"), get("C4"), get("M'"), ...top];
  return {
    trueLengths,
    seam: dist(M, P(0)),
    area: area.value,
    divisions: n,
    pattern: {
      contour,
      lines: fold.map(([c, p]) => ({ from: get(c), to: get(p), kind: "pli" as const })),
      labels: [
        ...order.map((c) => ({ at: get(c), text: c })),
        { at: get("M"), text: "soudure" },
      ],
    },
  };
}
