// Calepinage à la cisaille guillotine (cahier des charges, section 9.4).
//
// Une cisaille ne fait que des coupes droites, de bord à bord. On découpe donc la tôle en
// bandes (1er passage), puis chaque bande en colonnes (2e passage) ; une colonne contient une
// pièce, ou plusieurs pièces de même longueur empilées, séparées au 3e passage. Pas de trait
// de coupe (cisaillage), seul le premier bord de la tôle est dressé.
//
// Contraintes de la machine : une coupe ne dépasse pas la longueur de lame (une tôle de 2 500
// se coupe dans sa largeur sur une cisaille de 2 050) ; une cote au-delà de la course de la butée
// arrière se trace à la main (signalée). Objectif : le moins de tôles, puis les plus grandes
// chutes réutilisables, puis le moins de réglages de butée.
//
// Repère : x le long de la longueur de la tôle (sens de laminage), y le long de sa largeur.
// Les bandes s'empilent le long de l'axe U (x ou y) ; elles traversent la tôle le long de V.

export interface SheetStock {
  length: number;
  width: number;
  /** null : quantité illimitée. */
  quantity: number | null;
  /** Tolérance du format : le calcul se fait sur la plus petite tôle possible. */
  tolMinus: number;
  tolPlus: number;
}

export interface StockOffcut {
  length: number;
  width: number;
}

export interface PlatePiece {
  mark: string;
  /** Longueur : le long du sens de laminage si `grain`. */
  length: number;
  width: number;
  quantity: number;
  /** Sens imposé : la pièce ne pivote pas (pliage parallèle au laminage, inox brossé…). */
  grain: boolean;
}

export interface ShearSettings {
  /** Longueur de coupe maxi ; 0 : pas de limite connue. */
  bladeLength: number;
  /** Course de la butée arrière ; 0 : pas de limite connue. */
  gaugeMax: number;
  /** Dressage du premier bord des tôles neuves. */
  trim: number;
  /** Une chute est gardée si ses deux côtés atteignent ces dimensions (dans un sens ou dans l'autre). */
  keep: [number, number];
}

export type Axis = "x" | "y";

export interface Rect {
  x: number;
  y: number;
  /** Côté le long de x. */
  length: number;
  /** Côté le long de y. */
  width: number;
}

export interface PlacedPiece extends Rect {
  mark: string;
  piece: number;
  /** Tournée d'un quart de tour par rapport à la saisie. */
  rotated: boolean;
}

export interface Chute extends Rect {
  keep: boolean;
  /** Ce que la tolérance de la tôle peut ajouter, le long de x et de y. */
  grow: [number, number];
}

export interface CutOp {
  n: number;
  /** 0 : dressage ; 1 : bande ; 2 : colonne ; 3 : pièce dans une colonne. */
  stage: 0 | 1 | 2 | 3;
  /** Réglage de la butée arrière (cote mesurée). */
  gauge: number;
  /** Ce qu'on présente à la cisaille : « Tôle », « Bande 2 », « Colonne B2-1 ». */
  on: string;
  /** Ce que la coupe détache : repères des pièces, ou nom de la bande. */
  gives: string[];
  /** Le reste qui tombe avec la dernière coupe (chute à garder ou perte), s'il y en a un. */
  rest: Chute | null;
  /** Trait de coupe sur le schéma. */
  line: [number, number, number, number];
  /** Cote au-delà de la course de la butée : à tracer. */
  overGauge: boolean;
  /** Coupe plus longue que la lame : impossible sur cette cisaille. */
  overBlade: boolean;
}

export interface SheetPlan {
  source: "tole" | "chute";
  /** Dimensions de calcul (plus petite tôle possible). */
  length: number;
  width: number;
  /** Format commandé et sa tolérance (tôles neuves). */
  nominal: [number, number];
  tol: [number, number];
  axis: Axis;
  trim: number;
  bands: { label: string; offset: number; size: number }[];
  pieces: PlacedPiece[];
  chutes: Chute[];
  cuts: CutOp[];
  piecesArea: number;
}

export interface PlatePlan {
  sheets: SheetPlan[];
  unplaced: { mark: string; piece: number; length: number; width: number }[];
  piecesArea: number;
  /** Surface des tôles et chutes utilisées (dimensions de calcul). */
  sheetsArea: number;
  keptArea: number;
}

const EPS = 1e-6;

interface Instance {
  id: number;
  piece: number;
  mark: string;
  length: number;
  width: number;
  grain: boolean;
}

/** Une pose possible dans le repère des bandes : h le long de U, s le long de V. */
interface Pose {
  h: number;
  s: number;
  rotated: boolean;
}

function poses(inst: Instance, axis: Axis): Pose[] {
  const [l, w] = [inst.length, inst.width];
  const straight: Pose = axis === "x" ? { h: l, s: w, rotated: false } : { h: w, s: l, rotated: false };
  const turned: Pose = axis === "x" ? { h: w, s: l, rotated: true } : { h: l, s: w, rotated: true };
  return inst.grain || Math.abs(l - w) < EPS ? [straight] : [straight, turned];
}

interface Item {
  inst: Instance;
  pose: Pose;
}

interface Column {
  s: number;
  items: Item[];
}

interface Band {
  b: number;
  columns: Column[];
}

const area = (items: Item[]) => items.reduce((sum, i) => sum + i.pose.h * i.pose.s, 0);

/**
 * Remplit une bande de largeur b (le long de U) et de longueur V : des colonnes côte à côte,
 * chacune une pile de pièces de même longueur. D'abord les colonnes qui remplissent toute la
 * largeur de la bande (aucune recoupe), puis les mieux remplies, les plus longues d'abord.
 */
function fillBand(b: number, V: number, pool: Instance[], taken: Set<number>, axis: Axis): Band {
  const columns: Column[] = [];
  let v = 0;
  for (;;) {
    const rest = V - v;
    const free = pool.filter((i) => !taken.has(i.id));
    let best: { column: Column; used: number } | null = null;
    const seen = new Set<string>();
    for (const inst of free) {
      for (const pose of poses(inst, axis)) {
        if (pose.h > b + EPS || pose.s > rest + EPS) continue;
        const key = `${inst.piece}|${pose.rotated}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const column = buildColumn(inst, pose, b, free, axis);
        const used = column.items.reduce((sum, i) => sum + i.pose.h, 0);
        if (!best) {
          best = { column, used };
          continue;
        }
        // Colonne pleine d'abord (aucune recoupe), puis la mieux remplie, puis la plus longue.
        const full = used >= b - EPS;
        const bestFull = best.used >= b - EPS;
        const better =
          full !== bestFull ? full : used > best.used + EPS || (Math.abs(used - best.used) <= EPS && column.s > best.column.s + EPS);
        if (better) best = { column, used };
      }
    }
    if (!best) break;
    for (const item of best.column.items) taken.add(item.inst.id);
    columns.push(best.column);
    v += best.column.s;
  }
  return { b, columns };
}

/** Pile de pièces de même longueur s dans une bande de largeur b : la pièce de départ, puis d'autres. */
function buildColumn(start: Instance, pose: Pose, b: number, free: Instance[], axis: Axis): Column {
  const items: Item[] = [];
  const used = new Set<number>();
  let height = 0;
  const add = (inst: Instance, p: Pose) => {
    items.push({ inst, pose: p });
    used.add(inst.id);
    height += p.h;
  };
  add(start, pose);
  // Même pièce, même pose, tant qu'il reste de la place.
  for (const inst of free) {
    if (used.has(inst.id) || inst.piece !== start.piece) continue;
    if (height + pose.h > b + EPS) break;
    add(inst, pose);
  }
  // Puis d'autres pièces de même longueur, les plus grandes d'abord.
  for (;;) {
    let choice: Item | null = null;
    for (const inst of free) {
      if (used.has(inst.id)) continue;
      for (const p of poses(inst, axis)) {
        if (Math.abs(p.s - pose.s) > EPS || height + p.h > b + EPS) continue;
        if (!choice || p.h > choice.pose.h) choice = { inst, pose: p };
      }
    }
    if (!choice) break;
    add(choice.inst, choice.pose);
  }
  return { s: pose.s, items };
}

type Strategy = "plus-large" | "plus-etroite" | "mieux-remplie";
const STRATEGIES: Strategy[] = ["plus-large", "plus-etroite", "mieux-remplie"];

/** Bandes d'une tôle (dimensions utiles U × V) selon une stratégie de choix de la largeur des bandes. */
function fillSheet(U: number, V: number, pool: Instance[], axis: Axis, strategy: Strategy): { bands: Band[]; taken: Set<number> } {
  const taken = new Set<number>();
  const bands: Band[] = [];
  let u = 0;
  for (;;) {
    const rest = U - u;
    const free = pool.filter((i) => !taken.has(i.id));
    // Largeurs de bande possibles : un côté d'une pièce qui tient encore.
    const perPiece = free
      .map((i) => poses(i, axis).filter((p) => p.h <= rest + EPS && p.s <= V + EPS))
      .filter((list) => list.length);
    if (!perPiece.length) break;
    let widths: number[];
    if (strategy === "plus-large") widths = [Math.max(...perPiece.flat().map((p) => p.h))];
    else if (strategy === "plus-etroite") widths = [Math.max(...perPiece.map((list) => Math.min(...list.map((p) => p.h))))];
    else widths = [...new Set(perPiece.flat().map((p) => p.h))];

    let best: { band: Band; fill: number; taken: Set<number> } | null = null;
    for (const b of widths) {
      const trial = new Set(taken);
      const band = fillBand(b, V, pool, trial, axis);
      const placed = band.columns.flatMap((c) => c.items);
      if (!placed.length) continue;
      const fill = area(placed) / (b * V);
      if (!best || fill > best.fill + EPS || (Math.abs(fill - best.fill) <= EPS && b > best.band.b)) best = { band, fill, taken: trial };
    }
    if (!best) break;
    bands.push(best.band);
    for (const id of best.taken) taken.add(id);
    u += best.band.b;
  }
  return { bands, taken };
}

const fitsKeep = (a: number, b: number, keep: [number, number]) => {
  const [small, big] = [Math.min(a, b), Math.max(a, b)];
  const [ks, kb] = [Math.min(...keep), Math.max(...keep)];
  return small >= ks - EPS && big >= kb - EPS && small > EPS;
};

/**
 * Remplit une tôle (ou une chute) : chaque axe possible et chaque stratégie sont essayés,
 * on garde la surface placée la plus grande, puis le moins de bandes (moins de réglages).
 */
function bestSheet(
  length: number,
  width: number,
  trim: number,
  pool: Instance[],
  s: ShearSettings,
): { bands: Band[]; taken: Set<number>; axis: Axis } | null {
  const axes: Axis[] = (["x", "y"] as Axis[]).filter((axis) => {
    // Les bandes traversent la tôle le long de V : cette coupe doit tenir dans la lame.
    const V = axis === "x" ? width : length;
    return !s.bladeLength || V <= s.bladeLength + EPS;
  });
  // Tôle plus grande que la lame dans les deux sens : on coupe quand même, la fiche le signalera.
  if (!axes.length) axes.push(width <= length ? "x" : "y");

  let best: { bands: Band[]; taken: Set<number>; axis: Axis; placed: number } | null = null;
  for (const axis of axes) {
    const [U, V] = axis === "x" ? [length - trim, width] : [width - trim, length];
    if (U <= EPS || V <= EPS) continue;
    for (const strategy of STRATEGIES) {
      const { bands, taken } = fillSheet(U, V, pool, axis, strategy);
      const placed = area(bands.flatMap((b) => b.columns.flatMap((c) => c.items)));
      if (!placed) continue;
      if (!best || placed > best.placed + EPS || (Math.abs(placed - best.placed) <= EPS && bands.length < best.bands.length)) {
        best = { bands, taken, axis, placed };
      }
    }
  }
  return best && { bands: best.bands, taken: best.taken, axis: best.axis };
}

/** Mise en page d'une tôle : position des bandes, pièces, chutes, coupes numérotées. */
function layoutSheet(
  source: SheetPlan["source"],
  dims: { length: number; width: number; nominal: [number, number]; tol: [number, number]; trim: number },
  axis: Axis,
  rawBands: Band[],
  s: ShearSettings,
): SheetPlan {
  const { length, width, trim } = dims;
  const [U, V] = axis === "x" ? [length, width] : [width, length];
  const growRange = dims.tol[0] + dims.tol[1];
  // Rectangle dans le repère des bandes (u, v) → repère de la tôle (x, y).
  const rect = (u: number, v: number, du: number, dv: number): Rect =>
    axis === "x" ? { x: u, y: v, length: du, width: dv } : { x: v, y: u, length: dv, width: du };
  const line = (u1: number, v1: number, u2: number, v2: number): [number, number, number, number] =>
    axis === "x" ? [u1, v1, u2, v2] : [v1, u1, v2, u2];
  const chute = (u: number, v: number, du: number, dv: number, touchesU: boolean, touchesV: boolean): Chute => {
    const r = rect(u, v, du, dv);
    const [gu, gv] = [touchesU ? growRange : 0, touchesV ? growRange : 0];
    return { ...r, keep: fitsKeep(du, dv, s.keep), grow: axis === "x" ? [gu, gv] : [gv, gu] };
  };

  // Les plus larges d'abord, partout : la butée se règle du plus grand au plus petit.
  const bands = [...rawBands].sort((a, b) => b.b - a.b).map((band) => ({
    b: band.b,
    columns: [...band.columns].sort((a, b) => b.s - a.s).map((c) => ({ s: c.s, items: [...c.items].sort((a, b) => b.pose.h - a.pose.h) })),
  }));

  const pieces: PlacedPiece[] = [];
  const chutes: Chute[] = [];
  const ops: (Omit<CutOp, "n"> & { after: number[] })[] = [];
  const bandInfo: SheetPlan["bands"] = [];
  const over = (gauge: number, lineLength: number) => ({
    overGauge: s.gaugeMax > 0 && gauge > s.gaugeMax + EPS,
    overBlade: s.bladeLength > 0 && lineLength > s.bladeLength + EPS,
  });

  if (trim > 0) {
    ops.push({ stage: 0, gauge: trim, on: "Tôle", gives: [], rest: null, line: line(trim, 0, trim, V), after: [], ...over(0, V) });
  }

  let u = trim;
  let previousBandOp = trim > 0 ? 0 : -1;
  bands.forEach((band, bi) => {
    const label = `Bande ${bi + 1}`;
    bandInfo.push({ label, offset: u, size: band.b });
    const lastBand = bi === bands.length - 1;
    const stripRest = lastBand && U - (u + band.b) > EPS ? chute(u + band.b, 0, U - u - band.b, V, true, true) : null;
    ops.push({
      stage: 1,
      gauge: band.b,
      on: "Tôle",
      gives: [label],
      rest: stripRest,
      line: line(u + band.b, 0, u + band.b, V),
      after: previousBandOp >= 0 ? [previousBandOp] : [],
      ...over(band.b, V),
    });
    const bandOp = ops.length - 1;
    previousBandOp = bandOp;
    if (stripRest) chutes.push(stripRest);

    let v = 0;
    let previousColumnOp = bandOp;
    band.columns.forEach((column, ci) => {
      const lastColumn = ci === band.columns.length - 1;
      const height = column.items.reduce((sum, i) => sum + i.pose.h, 0);
      const single = column.items.length === 1 && height >= band.b - EPS;
      const columnLabel = `Colonne ${bi + 1}-${ci + 1}`;
      const endRest = lastColumn && V - (v + column.s) > EPS ? chute(u, v + column.s, band.b, V - v - column.s, false, true) : null;
      ops.push({
        stage: 2,
        gauge: column.s,
        on: label,
        gives: single ? [column.items[0]!.inst.mark] : [columnLabel],
        rest: endRest,
        line: line(u, v + column.s, u + band.b, v + column.s),
        after: [previousColumnOp],
        ...over(column.s, band.b),
      });
      const columnOp = ops.length - 1;
      previousColumnOp = columnOp;
      if (endRest) chutes.push(endRest);

      // 3e passage : une coupe par pièce de la pile ; la dernière détache aussi le reste de la colonne.
      let w = u;
      let previousPieceOp = columnOp;
      column.items.forEach((item, ii) => {
        pieces.push({
          ...rect(w, v, item.pose.h, column.s),
          mark: item.inst.mark,
          piece: item.inst.piece,
          rotated: item.pose.rotated,
        });
        if (!single) {
          const lastItem = ii === column.items.length - 1;
          const leftover = lastItem && band.b - (w - u + item.pose.h) > EPS ? chute(w + item.pose.h, v, band.b - (w - u + item.pose.h), column.s, false, false) : null;
          // La dernière pièce qui remplit exactement la bande n'a pas besoin de coupe.
          if (!(lastItem && !leftover)) {
            ops.push({
              stage: 3,
              gauge: item.pose.h,
              on: columnLabel,
              gives: [item.inst.mark],
              rest: leftover,
              line: line(w + item.pose.h, v, w + item.pose.h, v + column.s),
              after: [previousPieceOp],
              ...over(item.pose.h, column.s),
            });
            previousPieceOp = ops.length - 1;
          } else {
            // La pièce restante est obtenue par la coupe précédente.
            const last = ops[ops.length - 1];
            if (last && last.stage === 3 && last.on === columnLabel) last.gives.push(item.inst.mark);
          }
          if (leftover) chutes.push(leftover);
        }
        w += item.pose.h;
      });
      v += column.s;
    });
    u += band.b;
  });

  // Ordre de coupe : on garde le même réglage de butée tant qu'une coupe possible l'utilise,
  // sinon on passe au plus grand réglage disponible.
  type Pending = { op: (typeof ops)[number]; i: number };
  const done = new Set<number>();
  const cuts: CutOp[] = [];
  let gauge: number | null = null;
  while (done.size < ops.length) {
    const current: number | null = gauge;
    const ready: Pending[] = ops.map((op, i) => ({ op, i })).filter(({ op, i }) => !done.has(i) && op.after.every((a) => done.has(a)));
    const same: Pending | undefined = current === null ? undefined : ready.find(({ op }) => Math.abs(op.gauge - current) < EPS && op.stage !== 0);
    const next: Pending = ready.find(({ op }) => op.stage === 0) ?? same ?? ready.sort((a, b) => b.op.gauge - a.op.gauge || a.i - b.i)[0]!;
    done.add(next.i);
    const { after: _after, ...cut } = next.op;
    cuts.push({ ...cut, n: cuts.length + (trim > 0 ? 0 : 1) });
    if (cut.stage !== 0) gauge = cut.gauge;
  }

  return {
    source,
    length,
    width,
    nominal: dims.nominal,
    tol: dims.tol,
    axis,
    trim,
    bands: bandInfo,
    pieces,
    chutes,
    cuts,
    piecesArea: pieces.reduce((sum, p) => sum + p.length * p.width, 0),
  };
}

/** Plan de calepinage : les chutes du stock d'abord, puis les tôles neuves, la mieux remplie à chaque fois. */
export function planPlates(stock: SheetStock[], offcuts: StockOffcut[], pieces: PlatePiece[], s: ShearSettings): PlatePlan {
  let pool: Instance[] = [];
  let id = 0;
  pieces.forEach((p, piece) => {
    if (!(p.length > 0 && p.width > 0)) return;
    for (let q = 0; q < Math.floor(p.quantity); q++) {
      pool.push({ id: id++, piece, mark: p.mark, length: p.length, width: p.width, grain: p.grain });
    }
  });
  // Les plus grandes d'abord : à remplissage égal, on place les pièces difficiles.
  pool.sort((a, b) => b.length * b.width - a.length * a.width);
  const remove = (taken: Set<number>) => (pool = pool.filter((i) => !taken.has(i.id)));

  const sheets: SheetPlan[] = [];
  // Chutes du stock : mesurées, sans tolérance ni dressage.
  for (const offcut of [...offcuts].filter((o) => o.length > 0 && o.width > 0).sort((a, b) => b.length * b.width - a.length * a.width)) {
    if (!pool.length) break;
    const found = bestSheet(offcut.length, offcut.width, 0, pool, s);
    if (!found) continue;
    remove(found.taken);
    sheets.push(
      layoutSheet("chute", { length: offcut.length, width: offcut.width, nominal: [offcut.length, offcut.width], tol: [0, 0], trim: 0 }, found.axis, found.bands, s),
    );
  }

  const formats = stock.filter((f) => f.length > 0 && f.width > 0).map((f) => ({ ...f }));
  while (pool.length) {
    let best: { format: (typeof formats)[number]; found: NonNullable<ReturnType<typeof bestSheet>>; ratio: number } | null = null;
    for (const format of formats) {
      if (format.quantity !== null && format.quantity <= 0) continue;
      const [length, width] = [format.length - format.tolMinus, format.width - format.tolMinus];
      const found = bestSheet(length, width, s.trim, pool, s);
      if (!found) continue;
      const placed = area(found.bands.flatMap((b) => b.columns.flatMap((c) => c.items)));
      const ratio = placed / (length * width);
      if (!best || ratio > best.ratio + EPS) best = { format, found, ratio };
    }
    if (!best) break;
    if (best.format.quantity !== null) best.format.quantity--;
    remove(best.found.taken);
    const f = best.format;
    sheets.push(
      layoutSheet(
        "tole",
        { length: f.length - f.tolMinus, width: f.width - f.tolMinus, nominal: [f.length, f.width], tol: [f.tolMinus, f.tolPlus], trim: s.trim },
        best.found.axis,
        best.found.bands,
        s,
      ),
    );
  }

  const piecesArea = sheets.reduce((sum, sh) => sum + sh.piecesArea, 0);
  return {
    sheets,
    unplaced: pool.map(({ mark, piece, length, width }) => ({ mark, piece, length, width })),
    piecesArea,
    sheetsArea: sheets.reduce((sum, sh) => sum + sh.length * sh.width, 0),
    keptArea: sheets.reduce((sum, sh) => sum + sh.chutes.filter((c) => c.keep).reduce((t, c) => t + c.length * c.width, 0), 0),
  };
}

/** Regroupe les tôles identiques (« 3 × tôle 2 500 × 1 250 »), dans l'ordre du plan. */
export function groupPlates(sheets: SheetPlan[]): { sheet: SheetPlan; count: number }[] {
  const key = (sh: SheetPlan) =>
    `${sh.source}|${sh.nominal.join("x")}|${sh.axis}|${sh.pieces.map((p) => `${p.piece}:${p.x}:${p.y}:${p.rotated}`).join(",")}`;
  const groups: { sheet: SheetPlan; count: number }[] = [];
  for (const sheet of sheets) {
    const group = groups.find((g) => key(g.sheet) === key(sheet));
    if (group) group.count++;
    else groups.push({ sheet, count: 1 });
  }
  return groups;
}
