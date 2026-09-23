// Calepinage de pièces rectangulaires sur des tôles (cahier des charges, section 11.3).
//
// Deux familles d'algorithmes classiques, essayées avec plusieurs règles ; la meilleure solution
// gagne (le moins de pièces non placées, puis le moins de surface de tôle, puis la plus grande chute) :
// - « MaxRects » (placement libre) : garde la liste des plus grands rectangles libres ;
// - « Guillotine » : chaque placement coupe la tôle de bord à bord, donc la découpe est possible
//   à la cisaille, en coupes traversantes successives.
// L'espacement entre pièces est géré en agrandissant chaque pièce (et la zone utile) de l'espacement.

export interface SheetType {
  length: number;
  width: number;
  /** null : quantité illimitée. */
  quantity: number | null;
}

export interface RectPiece {
  mark: string;
  length: number;
  width: number;
  quantity: number;
  /** Rotation d'un quart de tour autorisée (non si le sens de laminage compte). */
  rotate: boolean;
}

export interface NestSettings {
  /** Espace entre deux pièces (saignée, pince…). */
  spacing: number;
  /** Marge au bord de la tôle. */
  margin: number;
  /** Uniquement des coupes traversantes (cisaille). */
  guillotine: boolean;
}

export interface Placement {
  mark: string;
  /** Ligne de la pièce dans la liste (pour sa couleur). */
  piece: number;
  /** Position depuis le coin de la tôle, le long de sa longueur (x) et de sa largeur (y). */
  x: number;
  y: number;
  /** Dimensions posées (échangées si la pièce est tournée). */
  length: number;
  width: number;
  rotated: boolean;
}

export interface SheetLayout {
  length: number;
  width: number;
  placements: Placement[];
  /** Surface des pièces posées. */
  usedArea: number;
  /** Plus grand rectangle libre restant (chute récupérable), ou null. */
  offcut: { length: number; width: number } | null;
}

export interface NestResult {
  sheets: SheetLayout[];
  unplaced: { mark: string; piece: number; length: number; width: number }[];
  piecesArea: number;
  sheetsArea: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Item {
  mark: string;
  piece: number;
  w: number;
  h: number;
  rotate: boolean;
}

interface Candidate extends Rect {
  rotated: boolean;
  score: number;
  score2: number;
  /** Rectangle libre utilisé (algorithme guillotine). */
  free: number;
}

type Rule = "short-side" | "area" | "bottom-left";

interface Packer {
  find(w: number, h: number, rotate: boolean): Candidate | null;
  place(c: Candidate): void;
  freeRects(): Rect[];
}

function score(rule: Rule, free: Rect, w: number, h: number): [number, number] {
  const dw = free.w - w;
  const dh = free.h - h;
  switch (rule) {
    case "short-side":
      return [Math.min(dw, dh), Math.max(dw, dh)];
    case "area":
      return [free.w * free.h - w * h, Math.min(dw, dh)];
    case "bottom-left":
      return [free.y + h, free.x];
  }
}

function better(a: Candidate | null, b: Candidate): boolean {
  return !a || b.score < a.score - 1e-9 || (Math.abs(b.score - a.score) <= 1e-9 && b.score2 < a.score2 - 1e-9);
}

function candidates(free: Rect[], w: number, h: number, rotate: boolean, rule: Rule): Candidate | null {
  let best: Candidate | null = null;
  free.forEach((f, index) => {
    for (const [cw, ch, rotated] of rotate && w !== h ? ([[w, h, false], [h, w, true]] as const) : ([[w, h, false]] as const)) {
      if (cw > f.w + 1e-9 || ch > f.h + 1e-9) continue;
      const [s1, s2] = score(rule, f, cw, ch);
      const c = { x: f.x, y: f.y, w: cw, h: ch, rotated, score: s1, score2: s2, free: index };
      if (better(best, c)) best = c;
    }
  });
  return best;
}

/** Placement libre : liste des rectangles libres maximaux (ils peuvent se chevaucher). */
class MaxRects implements Packer {
  #free: Rect[];
  constructor(
    width: number,
    height: number,
    private rule: Rule,
  ) {
    this.#free = [{ x: 0, y: 0, w: width, h: height }];
  }

  find(w: number, h: number, rotate: boolean) {
    return candidates(this.#free, w, h, rotate, this.rule);
  }

  place(node: Candidate): void {
    const next: Rect[] = [];
    for (const f of this.#free) {
      const overlaps = node.x < f.x + f.w && node.x + node.w > f.x && node.y < f.y + f.h && node.y + node.h > f.y;
      if (!overlaps) {
        next.push(f);
        continue;
      }
      if (node.x > f.x) next.push({ x: f.x, y: f.y, w: node.x - f.x, h: f.h });
      if (node.x + node.w < f.x + f.w) next.push({ x: node.x + node.w, y: f.y, w: f.x + f.w - node.x - node.w, h: f.h });
      if (node.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: node.y - f.y });
      if (node.y + node.h < f.y + f.h) next.push({ x: f.x, y: node.y + node.h, w: f.w, h: f.y + f.h - node.y - node.h });
    }
    // Retire les rectangles contenus dans un autre.
    this.#free = next.filter(
      (a, i) =>
        a.w > 1e-9 &&
        a.h > 1e-9 &&
        !next.some(
          (b, j) =>
            i !== j &&
            a.x >= b.x - 1e-9 &&
            a.y >= b.y - 1e-9 &&
            a.x + a.w <= b.x + b.w + 1e-9 &&
            a.y + a.h <= b.y + b.h + 1e-9 &&
            (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h || i > j),
        ),
    );
  }

  freeRects(): Rect[] {
    return this.#free;
  }
}

/** Placement « guillotine » : chaque rectangle libre est coupé en deux par une coupe traversante. */
class Guillotine implements Packer {
  #free: Rect[];
  constructor(
    width: number,
    height: number,
    private rule: Rule,
  ) {
    this.#free = [{ x: 0, y: 0, w: width, h: height }];
  }

  find(w: number, h: number, rotate: boolean) {
    return candidates(this.#free, w, h, rotate, this.rule);
  }

  place(node: Candidate): void {
    const f = this.#free[node.free]!;
    this.#free.splice(node.free, 1);
    const right = f.w - node.w;
    const below = f.h - node.h;
    // Coupe le long de l'axe où il reste le moins : la grande chute reste d'un seul tenant.
    const horizontal = right < below;
    const a: Rect = horizontal
      ? { x: f.x + node.w, y: f.y, w: right, h: node.h }
      : { x: f.x + node.w, y: f.y, w: right, h: f.h };
    const b: Rect = horizontal
      ? { x: f.x, y: f.y + node.h, w: f.w, h: below }
      : { x: f.x, y: f.y + node.h, w: node.w, h: below };
    for (const r of [a, b]) if (r.w > 1e-9 && r.h > 1e-9) this.#free.push(r);
  }

  freeRects(): Rect[] {
    return this.#free;
  }
}

interface Strategy {
  guillotine: boolean;
  rule: Rule;
}

/** Remplit une tôle : à chaque étape, la pièce et la position les mieux notées parmi toutes. */
function fillSheet(width: number, height: number, items: Item[], strategy: Strategy) {
  const packer: Packer = strategy.guillotine
    ? new Guillotine(width, height, strategy.rule)
    : new MaxRects(width, height, strategy.rule);
  const placed: { item: Item; node: Candidate }[] = [];
  let rest = [...items];
  for (;;) {
    // Les pièces identiques ne sont évaluées qu'une fois.
    let best: { index: number; node: Candidate } | null = null;
    const seen = new Set<string>();
    rest.forEach((item, index) => {
      const key = `${item.w}x${item.h}x${item.rotate}`;
      if (seen.has(key)) return;
      seen.add(key);
      const node = packer.find(item.w, item.h, item.rotate);
      if (node && (!best || better(best.node, node))) best = { index, node };
    });
    if (!best) break;
    const { index, node } = best as { index: number; node: Candidate };
    packer.place(node);
    placed.push({ item: rest[index]!, node });
    rest = rest.filter((_, i) => i !== index);
  }
  return { placed, rest, free: packer.freeRects() };
}

const STRATEGIES: Record<"free" | "guillotine", Strategy[]> = {
  free: [
    { guillotine: false, rule: "short-side" },
    { guillotine: false, rule: "area" },
    { guillotine: false, rule: "bottom-left" },
    { guillotine: true, rule: "area" },
    { guillotine: true, rule: "short-side" },
  ],
  guillotine: [
    { guillotine: true, rule: "area" },
    { guillotine: true, rule: "short-side" },
    { guillotine: true, rule: "bottom-left" },
  ],
};

function solve(sheets: SheetType[], items: Item[], s: NestSettings, strategy: Strategy): NestResult {
  const stock = sheets.filter((t) => t.length > 0 && t.width > 0).map((t) => ({ ...t }));
  const layouts: SheetLayout[] = [];
  let rest = items;

  while (rest.length) {
    // Nouvelle tôle : parmi les formats disponibles, celui qui sera le mieux rempli.
    let best: { type: (typeof stock)[number]; fill: ReturnType<typeof fillSheet>; ratio: number } | null = null;
    for (const type of stock) {
      if (type.quantity !== null && type.quantity <= 0) continue;
      const usableW = type.length - 2 * s.margin + s.spacing;
      const usableH = type.width - 2 * s.margin + s.spacing;
      if (usableW <= 0 || usableH <= 0) continue;
      const fill = fillSheet(usableW, usableH, rest, strategy);
      if (!fill.placed.length) continue;
      const area = fill.placed.reduce((sum, p) => sum + (p.item.w - s.spacing) * (p.item.h - s.spacing), 0);
      const ratio = area / (type.length * type.width);
      if (!best || ratio > best.ratio + 1e-9) best = { type, fill, ratio };
    }
    if (!best) break;
    if (best.type.quantity !== null) best.type.quantity--;
    rest = best.fill.rest;

    const placements: Placement[] = best.fill.placed.map(({ item, node }) => ({
      mark: item.mark,
      piece: item.piece,
      x: s.margin + node.x,
      y: s.margin + node.y,
      length: node.w - s.spacing,
      width: node.h - s.spacing,
      rotated: node.rotated,
    }));
    const largest = [...best.fill.free].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const maxW = best.type.length - 2 * s.margin;
    const maxH = best.type.width - 2 * s.margin;
    layouts.push({
      length: best.type.length,
      width: best.type.width,
      placements,
      usedArea: placements.reduce((sum, p) => sum + p.length * p.width, 0),
      offcut: largest ? { length: Math.min(largest.w, maxW), width: Math.min(largest.h, maxH) } : null,
    });
  }

  return {
    sheets: layouts,
    unplaced: rest.map((i) => ({ mark: i.mark, piece: i.piece, length: i.w - s.spacing, width: i.h - s.spacing })),
    piecesArea: layouts.reduce((sum, l) => sum + l.usedArea, 0),
    sheetsArea: layouts.reduce((sum, l) => sum + l.length * l.width, 0),
  };
}

export function nest(sheets: SheetType[], pieces: RectPiece[], s: NestSettings): NestResult {
  const items: Item[] = [];
  pieces.forEach((p, piece) => {
    if (!(p.length > 0 && p.width > 0)) return;
    for (let q = 0; q < Math.floor(p.quantity); q++) {
      items.push({ mark: p.mark, piece, w: p.length + s.spacing, h: p.width + s.spacing, rotate: p.rotate });
    }
  });
  items.sort((a, b) => b.w * b.h - a.w * a.h);

  let best: NestResult | null = null;
  for (const strategy of STRATEGIES[s.guillotine ? "guillotine" : "free"]) {
    const result = solve(sheets, items, s, strategy);
    if (!best || compare(result, best) < 0) best = result;
  }
  return best!;
}

/** Négatif si `a` est meilleur que `b`. */
function compare(a: NestResult, b: NestResult): number {
  const offcut = (r: NestResult) => {
    const last = r.sheets[r.sheets.length - 1]?.offcut;
    return last ? last.length * last.width : 0;
  };
  return a.unplaced.length - b.unplaced.length || a.sheetsArea - b.sheetsArea || offcut(b) - offcut(a);
}

/** Regroupe les tôles de même disposition (« 2 × tôle 2500 × 1250 »). */
export function groupSheets(sheets: SheetLayout[]): { sheet: SheetLayout; count: number }[] {
  const key = (l: SheetLayout) =>
    `${l.length}x${l.width}|${l.placements.map((p) => `${p.piece}@${p.x},${p.y},${p.rotated}`).join(";")}`;
  const groups: { sheet: SheetLayout; count: number; key: string }[] = [];
  for (const sheet of sheets) {
    const k = key(sheet);
    const group = groups.find((g) => g.key === k);
    if (group) group.count++;
    else groups.push({ sheet, count: 1, key: k });
  }
  return groups.map(({ sheet, count }) => ({ sheet, count }));
}
