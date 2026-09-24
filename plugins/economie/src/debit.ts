// Débit de barres (cahier des charges, sections 9.3 et 11.2) : découper une liste de longueurs dans
// des barres en utilisant le moins de barres possible, et en gardant des chutes longues, réutilisables.
//
// Méthode : chaque barre est remplie au mieux par une recherche exhaustive des combinaisons de
// pièces (sac à dos, résolution 1 mm), en commençant par les chutes déjà en stock. Remplir chaque
// barre au maximum laisse les pertes regroupées sur la dernière barre : la chute y est longue,
// donc réutilisable. Pour les tailles d'atelier (quelques centaines de pièces), c'est quasi optimal.
//
// Coupes d'angle : la combinaison est d'abord choisie en comptant un trait de scie complet entre
// chaque pièce (toujours faisable). Les pièces sont ensuite rangées et retournées pour emboîter
// leurs coupes (voir coupe.ts) ; la place gagnée sert à ajouter d'autres pièces sur la même barre.
import { STRAIGHT, arrange, ends, oriented, type Bounds, type Lin, type Orientation, type PieceShape } from "./coupe";

export interface StockBar {
  length: number;
  /** null : quantité illimitée. */
  quantity: number | null;
}

export interface CutPiece {
  mark: string;
  /** Longueur pointe à pointe. */
  length: number;
  quantity: number;
  /** Angles des bouts ; absent : coupes droites. */
  shape?: PieceShape;
}

export interface CutSettings {
  /** Épaisseur du trait de scie. */
  kerf: number;
  /** Longueur perdue en début de barre (dressage). */
  trim: number;
  /** En dessous, une chute est comptée comme perte. */
  keepMin: number;
  /** Encombrement de la section du profilé : nécessaire pour les coupes d'angle. */
  section?: Bounds;
}

export interface Cut {
  mark: string;
  length: number;
  /** Ligne de la pièce dans la liste (pour sa couleur). */
  piece: number;
  /** Position de la pointe gauche depuis le bout de la barre (dressage compris). */
  start: number;
  orientation: Orientation;
  /** Coupe partagée avec la pièce précédente : les deux coupes s'emboîtent. */
  shared: boolean;
  /** Recul des bouts, en haut et en bas de la vue de la barre (schéma 2D). */
  draw: { left: [number, number]; right: [number, number] };
}

export interface BarPlan {
  /** Longueur de la barre (ou de la chute) utilisée. */
  length: number;
  source: "barre" | "chute";
  cuts: Cut[];
  /** Longueur restante après la dernière coupe. */
  remnant: number;
  reusable: boolean;
}

export interface CutPlan {
  bars: BarPlan[];
  /** Pièces impossibles à couper (plus longues que toute barre disponible) ou en manque de barres. */
  unplaced: Pick<Cut, "mark" | "length" | "piece">[];
  /** Longueur totale des pièces placées. */
  piecesLength: number;
  /** Longueur totale des barres et chutes utilisées. */
  usedLength: number;
  /** Chutes trop courtes pour servir, traits de scie et dressages. */
  waste: number;
}

/** Au plus une barre et sa quantité de la même longueur : regroupe les barres identiques pour l'affichage. */
export interface BarGroup {
  bar: BarPlan;
  count: number;
}

interface Item {
  mark: string;
  length: number;
  piece: number;
  /** Bouts de la pièce, dans son sens de saisie (voir coupe.ts). */
  ends: { left: Lin; right: Lin };
  straight: boolean;
  /** Longueur occupée au pire, trait de scie compris, en mm entiers (arrondi au-dessus). */
  weight: number;
}

const NO_SECTION: Bounds = { width: 0, height: 0, round: false };

/**
 * Meilleure combinaison de pièces pour une barre de longueur utile `available` : la plus grande
 * longueur de pièces possible. n pièces demandent n traits de scie, sauf si la dernière tombe
 * pile au bout de la barre : la capacité est donc « disponible + un trait ».
 */
function bestFill(items: Item[], available: number, kerf: number): Item[] {
  const capacity = Math.floor(available + kerf);
  if (capacity <= 0) return [];
  // reached[s] : indice + 1 de la dernière pièce ajoutée pour atteindre la somme s (0 : non atteinte).
  const reached = new Int32Array(capacity + 1);
  const from = new Int32Array(capacity + 1);
  reached[0] = -1;
  for (let i = 0; i < items.length; i++) {
    const w = items[i]!.weight;
    if (w > capacity) continue;
    for (let s = capacity; s >= w; s--) {
      if (reached[s] === 0 && reached[s - w] !== 0) {
        reached[s] = i + 1;
        from[s] = s - w;
      }
    }
  }
  let best = capacity;
  while (best > 0 && reached[best] === 0) best--;
  const chosen: Item[] = [];
  for (let s = best; s > 0; s = from[s]!) chosen.push(items[reached[s]! - 1]!);
  return chosen.sort((a, b) => b.length - a.length);
}

interface Layout {
  placed: { item: Item; orientation: Orientation; start: number; shared: boolean }[];
  /** Longueur occupée, de la première pointe à la dernière. */
  length: number;
}

/** Pièces rangées sur la barre : dans l'ordre pour des coupes droites, emboîtées sinon. */
function layout(items: Item[], s: CutSettings): Layout {
  if (items.every((i) => i.straight)) {
    let end = 0;
    const placed = items.map((item, i) => {
      const start = i === 0 ? 0 : end + s.kerf;
      end = start + item.length;
      return { item, orientation: 0 as Orientation, start, shared: false };
    });
    return { placed, length: end };
  }
  const result = arrange(items, (i) => ({ kind: i.piece, length: i.length, ends: i.ends }), s.kerf, s.section ?? NO_SECTION);
  return {
    placed: result.placed.map((p) => ({ item: p.item, orientation: p.orientation, start: p.start, shared: p.sharedWithPrevious })),
    length: result.length,
  };
}

/**
 * Remplit une barre : la meilleure combinaison, vérifiée une fois les pièces rangées (on retire la
 * plus courte tant que ça déborde), puis complétée grâce à la place gagnée par les emboîtements.
 */
function fillBar(pool: Item[], available: number, s: CutSettings): { chosen: Item[]; layout: Layout } {
  const chosen = bestFill(pool, available, s.kerf);
  let result = layout(chosen, s);
  while (chosen.length && result.length > available + 1e-9) {
    chosen.pop();
    result = layout(chosen, s);
  }
  if (!chosen.length || chosen.every((i) => i.straight)) return { chosen, layout: result };

  // Un emboîtement ne fait jamais gagner plus que les deux reculs qu'il met en contact.
  const maxRecul = Math.max(0, ...pool.map((i) => Math.max(i.ends.left.c, i.ends.right.c)));
  const taken = new Set(chosen);
  for (let added = true; added; ) {
    added = false;
    const tried = new Set<number>();
    for (const candidate of pool) {
      if (taken.has(candidate) || tried.has(candidate.piece)) continue;
      tried.add(candidate.piece);
      if (candidate.length > available - result.length + 4 * maxRecul) continue;
      const attempt = layout([...chosen, candidate], s);
      if (attempt.length <= available + 1e-9) {
        chosen.push(candidate);
        taken.add(candidate);
        result = attempt;
        added = true;
        break;
      }
    }
  }
  return { chosen, layout: result };
}

/** Recul d'un bout en haut et en bas du schéma de la barre. */
function drawn(e: Lin, b: Bounds): [number, number] {
  if (e.a !== 0) return [e.c + (e.a * b.width) / 2, e.c - (e.a * b.width) / 2];
  if (e.b !== 0) return [e.c + (e.b * b.height) / 2, e.c - (e.b * b.height) / 2];
  return [e.c, e.c];
}

function makeBar(length: number, source: BarPlan["source"], placed: Layout, s: CutSettings): BarPlan {
  const available = length - s.trim;
  const used = placed.length;
  // Il reste de la matière : un dernier trait la sépare de la dernière pièce.
  const remnant = Math.max(0, available - used - (available - used > 0 ? s.kerf : 0));
  const bounds = s.section ?? NO_SECTION;
  return {
    length,
    source,
    cuts: placed.placed.map(({ item, orientation, start, shared }) => {
      const e = oriented(item.ends, orientation);
      return {
        mark: item.mark,
        length: item.length,
        piece: item.piece,
        start: s.trim + start,
        orientation,
        shared,
        draw: { left: drawn(e.left, bounds), right: drawn(e.right, bounds) },
      };
    }),
    remnant,
    reusable: remnant >= s.keepMin && remnant > 0,
  };
}

/** Temps de recherche maximal : au-delà, on garde le meilleur plan trouvé. */
const SEARCH_BUDGET_MS = 250;

/**
 * Plan de débit. Le remplissage barre par barre est relancé plusieurs fois en changeant l'ordre
 * des pièces (qui départage les combinaisons de même longueur) ; le meilleur plan est gardé :
 * le moins de pièces non placées, puis le moins de longueur de barres, puis la plus grande chute.
 */
export function planCuts(stock: StockBar[], offcuts: number[], pieces: CutPiece[], s: CutSettings): CutPlan {
  const items: Item[] = [];
  pieces.forEach((p, piece) => {
    if (!(p.length > 0)) return;
    // Sans section connue, les angles ne changent rien au calcul : coupes droites.
    const e = ends(s.section ? (p.shape ?? STRAIGHT) : STRAIGHT, s.section ?? NO_SECTION);
    const straight = [e.left, e.right].every((f) => f.c === 0 && f.a === 0 && f.b === 0);
    // Au pire (rien ne s'emboîte), un trait de scie compté le long de la barre au bout le plus incliné.
    const slope = Math.max(Math.hypot(e.left.a, e.left.b), Math.hypot(e.right.a, e.right.b));
    const weight = Math.ceil(p.length + s.kerf * Math.sqrt(1 + slope * slope) - 1e-9);
    for (let q = 0; q < Math.floor(p.quantity); q++) {
      items.push({ mark: p.mark, length: p.length, piece, ends: e, straight, weight });
    }
  });
  // Les plus longues d'abord : à remplissage égal, on préfère placer les pièces difficiles.
  items.sort((a, b) => b.length - a.length);

  let best = planOnce(stock, offcuts, items, s);
  const start = Date.now();
  let seed = 1;
  // Mélange reproductible (même saisie, même plan) : générateur pseudo-aléatoire simple.
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let round = 0; round < 60 && Date.now() - start < SEARCH_BUDGET_MS; round++) {
    // Petit mélange : des pièces de longueurs voisines échangent leur place.
    const shuffled = items.map((item, i) => ({ item, key: i + random() * 6 })).sort((a, b) => a.key - b.key);
    const plan = planOnce(stock, offcuts, shuffled.map((x) => x.item), s);
    if (comparePlans(plan, best) < 0) best = plan;
  }
  return best;
}

/** Négatif si `a` est meilleur que `b`. */
function comparePlans(a: CutPlan, b: CutPlan): number {
  const biggest = (p: CutPlan) => Math.max(0, ...p.bars.map((bar) => (bar.reusable ? bar.remnant : 0)));
  return a.unplaced.length - b.unplaced.length || a.usedLength - b.usedLength || biggest(b) - biggest(a);
}

function planOnce(stock: StockBar[], offcuts: number[], sorted: Item[], s: CutSettings): CutPlan {
  let items = [...sorted];

  const bars: BarPlan[] = [];
  const remove = (chosen: Item[]) => {
    const set = new Set(chosen);
    items = items.filter((i) => !set.has(i));
  };

  // 1. Les chutes en stock d'abord, des plus longues aux plus courtes.
  // Les chutes du stock sont déjà coupées proprement : pas de dressage.
  const offcutSettings = { ...s, trim: 0 };
  for (const length of [...offcuts].filter((l) => l > 0).sort((a, b) => b - a)) {
    if (!items.length) break;
    const { chosen, layout: placed } = fillBar(items, length, offcutSettings);
    if (!chosen.length) continue;
    remove(chosen);
    bars.push(makeBar(length, "chute", placed, offcutSettings));
  }

  // 2. Puis des barres neuves : à chaque barre, la longueur la mieux remplie.
  const remaining = stock.filter((b) => b.length > 0).map((b) => ({ ...b }));
  while (items.length) {
    let best: { bar: (typeof remaining)[number]; chosen: Item[]; placed: Layout; ratio: number } | null = null;
    for (const bar of remaining) {
      if (bar.quantity !== null && bar.quantity <= 0) continue;
      const { chosen, layout: placed } = fillBar(items, bar.length - s.trim, s);
      if (!chosen.length) continue;
      const ratio = chosen.reduce((sum, c) => sum + c.length, 0) / bar.length;
      if (!best || ratio > best.ratio + 1e-9) best = { bar, chosen, placed, ratio };
    }
    if (!best) break;
    if (best.bar.quantity !== null) best.bar.quantity--;
    remove(best.chosen);
    bars.push(makeBar(best.bar.length, "barre", best.placed, s));
  }

  const piecesLength = bars.reduce((sum, b) => sum + b.cuts.reduce((t, c) => t + c.length, 0), 0);
  const usedLength = bars.reduce((sum, b) => sum + b.length, 0);
  const kept = bars.reduce((sum, b) => sum + (b.reusable ? b.remnant : 0), 0);
  return {
    bars,
    unplaced: items.map(({ mark, length, piece }) => ({ mark, length, piece })),
    piecesLength,
    usedLength,
    waste: usedLength - piecesLength - kept,
  };
}

/** Regroupe les barres identiques (« 3 × barre de 6 000 »), dans l'ordre du plan. */
export function groupBars(bars: BarPlan[]): BarGroup[] {
  const groups: BarGroup[] = [];
  const keyOf = (bar: BarPlan) =>
    `${bar.source}|${bar.length}|${bar.cuts.map((c) => `${c.piece}:${c.length}:${c.orientation}:${c.start}`).join(",")}`;
  for (const bar of bars) {
    const key = keyOf(bar);
    const group = groups.find((g) => keyOf(g.bar) === key);
    if (group) group.count++;
    else groups.push({ bar, count: 1 });
  }
  return groups;
}
