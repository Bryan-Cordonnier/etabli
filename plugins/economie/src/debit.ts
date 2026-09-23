// Débit de barres (cahier des charges, section 11.2) : découper une liste de longueurs dans des
// barres en utilisant le moins de barres possible, et en gardant des chutes longues, réutilisables.
//
// Méthode : chaque barre est remplie au mieux par une recherche exhaustive des combinaisons de
// pièces (sac à dos, résolution 1 mm), en commençant par les chutes déjà en stock. Remplir chaque
// barre au maximum laisse les pertes regroupées sur la dernière barre : la chute y est longue,
// donc réutilisable. Pour les tailles d'atelier (quelques centaines de pièces), c'est quasi optimal.

export interface StockBar {
  length: number;
  /** null : quantité illimitée. */
  quantity: number | null;
}

export interface CutPiece {
  mark: string;
  length: number;
  quantity: number;
}

export interface CutSettings {
  /** Épaisseur du trait de scie. */
  kerf: number;
  /** Longueur perdue en début de barre (dressage). */
  trim: number;
  /** En dessous, une chute est comptée comme perte. */
  keepMin: number;
}

export interface Cut {
  mark: string;
  length: number;
  /** Ligne de la pièce dans la liste (pour sa couleur). */
  piece: number;
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
  unplaced: Cut[];
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

interface Item extends Cut {
  /** Longueur occupée, trait de scie compris, en mm entiers (arrondi au-dessus). */
  weight: number;
}

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

  // Vérification exacte (le calcul se fait au millimètre supérieur) : on retire la plus petite
  // pièce tant que la combinaison déborde.
  chosen.sort((a, b) => b.length - a.length);
  while (chosen.length && usage(chosen, kerf) > available + 1e-9) chosen.pop();
  return chosen;
}

/** Longueur consommée par des pièces : les pièces + un trait entre chacune. */
const usage = (cuts: Cut[], kerf: number) =>
  cuts.reduce((sum, c) => sum + c.length, 0) + Math.max(0, cuts.length - 1) * kerf;

function makeBar(length: number, source: BarPlan["source"], cuts: Cut[], s: CutSettings): BarPlan {
  const available = length - s.trim;
  const used = usage(cuts, s.kerf);
  // Il reste de la matière : un dernier trait la sépare de la dernière pièce.
  const remnant = Math.max(0, available - used - (available - used > 0 ? s.kerf : 0));
  return {
    length,
    source,
    cuts: cuts.map(({ mark, length: l, piece }) => ({ mark, length: l, piece })),
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
    for (let q = 0; q < Math.floor(p.quantity); q++) {
      items.push({ mark: p.mark, length: p.length, piece, weight: Math.ceil(p.length + s.kerf - 1e-9) });
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
  for (const length of [...offcuts].filter((l) => l > 0).sort((a, b) => b - a)) {
    if (!items.length) break;
    const chosen = bestFill(items, length - s.trim, s.kerf);
    if (!chosen.length) continue;
    remove(chosen);
    bars.push(makeBar(length, "chute", chosen, s));
  }

  // 2. Puis des barres neuves : à chaque barre, la longueur la mieux remplie.
  const remaining = stock.filter((b) => b.length > 0).map((b) => ({ ...b }));
  while (items.length) {
    let best: { bar: (typeof remaining)[number]; chosen: Item[]; ratio: number } | null = null;
    for (const bar of remaining) {
      if (bar.quantity !== null && bar.quantity <= 0) continue;
      const chosen = bestFill(items, bar.length - s.trim, s.kerf);
      if (!chosen.length) continue;
      const ratio = chosen.reduce((sum, c) => sum + c.length, 0) / bar.length;
      if (!best || ratio > best.ratio + 1e-9) best = { bar, chosen, ratio };
    }
    if (!best) break;
    if (best.bar.quantity !== null) best.bar.quantity--;
    remove(best.chosen);
    bars.push(makeBar(best.bar.length, "barre", best.chosen, s));
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
  for (const bar of bars) {
    const key = `${bar.source}|${bar.length}|${bar.cuts.map((c) => `${c.piece}:${c.length}`).join(",")}`;
    const group = groups.find((g) => `${g.bar.source}|${g.bar.length}|${g.bar.cuts.map((c) => `${c.piece}:${c.length}`).join(",")}` === key);
    if (group) group.count++;
    else groups.push({ bar, count: 1 });
  }
  return groups;
}
