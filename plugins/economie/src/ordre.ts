// Coupes à faire sur chaque barre et ordre conseillé (cahier des charges, section 9.3) : on
// regroupe les coupes par angle de scie, pour régler la machine le moins souvent possible.
import type { BarPlan, Cut } from "./debit";

export interface SawOp {
  /** Angle de la scie, depuis la coupe d'équerre (0 = coupe droite). */
  angle: number;
  /** « dressage » : bout de barre neuve ; « bout » : première coupe d'angle en bout de barre ;
   *  « recoupe » : nouvelle coupe avant la pièce suivante (coupes qui ne s'emboîtent pas) ;
   *  « piece » : la coupe qui détache une pièce. */
  kind: "dressage" | "bout" | "recoupe" | "piece";
  /** Indice de la pièce détachée dans `bar.cuts` (coupe « piece »). */
  cut: number | null;
  /** Le tube change de position par rapport à la pièce précédente : le retourner avant de couper. */
  flip: boolean;
  /** Coupe partagée avec la pièce précédente (emboîtement) : une seule coupe pour deux pièces. */
  shared: boolean;
}

/** Angles gauche et droit d'une pièce telle qu'elle est posée (bout pour bout : ils s'échangent). */
export function placedAngles(cut: Cut, angles: (piece: number) => [number, number]): [number, number] {
  const [left, right] = angles(cut.piece);
  return cut.orientation === 2 || cut.orientation === 3 ? [right, left] : [left, right];
}

/** Coupes d'une barre, dans l'ordre où on les fait en avançant le long de la barre. */
export function barOps(bar: BarPlan, angles: (piece: number) => [number, number], trim: number): SawOp[] {
  const ops: SawOp[] = [];
  const first = bar.cuts[0];
  if (!first) return ops;
  const [firstLeft] = placedAngles(first, angles);
  if (firstLeft > 0) ops.push({ angle: firstLeft, kind: "bout", cut: null, flip: false, shared: false });
  else if (bar.source === "barre" && trim > 0) ops.push({ angle: 0, kind: "dressage", cut: null, flip: false, shared: false });

  bar.cuts.forEach((cut, i) => {
    const [left, right] = placedAngles(cut, angles);
    const previous = bar.cuts[i - 1];
    if (previous && !cut.shared) {
      const [, previousRight] = placedAngles(previous, angles);
      // La coupe précédente a laissé une face à son angle : sauf si les deux sont droites, il faut
      // recouper le bout de la barre à l'angle de la nouvelle pièce.
      if (left > 0 || previousRight > 0) ops.push({ angle: left, kind: "recoupe", cut: null, flip: false, shared: false });
    }
    ops.push({
      angle: right,
      kind: "piece",
      cut: i,
      flip: !!previous && previous.orientation !== cut.orientation,
      shared: cut.shared,
    });
  });
  return ops;
}

export interface OrderStep {
  angle: number;
  /** Pour chaque barre concernée : son indice et les coupes (indices dans ses opérations) faites à cet angle. */
  bars: { bar: number; from: number; to: number }[];
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.01;

/**
 * Ordre conseillé : à chaque réglage de la scie, on avance sur chaque barre tant que les coupes
 * suivantes sont à cet angle. On choisit à chaque fois l'angle qui fait le plus de coupes d'affilée
 * (à égalité, le plus petit : on commence par les coupes droites).
 */
export function sawOrder(opsPerBar: SawOp[][]): OrderStep[] {
  const position = opsPerBar.map(() => 0);
  const steps: OrderStep[] = [];
  const run = (b: number, angle: number) => {
    let end = position[b]!;
    while (end < opsPerBar[b]!.length && same(opsPerBar[b]![end]!.angle, angle)) end++;
    return end - position[b]!;
  };
  for (;;) {
    const heads = opsPerBar.map((ops, b) => ops[position[b]!]?.angle).filter((a): a is number => a !== undefined);
    if (!heads.length) break;
    const candidates = [...new Set(heads.map((a) => Math.round(a * 100) / 100))];
    const scored = candidates.map((angle) => ({ angle, count: opsPerBar.reduce((sum, _, b) => sum + run(b, angle), 0) }));
    scored.sort((a, b) => b.count - a.count || a.angle - b.angle);
    const angle = scored[0]!.angle;
    const step: OrderStep = { angle, bars: [] };
    opsPerBar.forEach((_, b) => {
      const count = run(b, angle);
      if (!count) return;
      step.bars.push({ bar: b, from: position[b]!, to: position[b]! + count - 1 });
      position[b]! += count;
    });
    steps.push(step);
  }
  return steps;
}
