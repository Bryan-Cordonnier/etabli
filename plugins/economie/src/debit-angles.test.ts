import { describe, expect, it } from "vitest";
import type { PieceShape } from "./coupe";
import { planCuts } from "./debit";

const section = { width: 40, height: 40, round: false };
const trapeze45: PieceShape = { angleL: 45, angleR: 45, planeL: "grande", planeR: "grande", sens: "oppose" };

describe("planCuts avec des coupes d'angle", () => {
  it("emboîte les montants à 45° pour en mettre un de plus par barre", () => {
    // 7 × 850 = 5 950 : sans emboîtement (6 traits) ça ne tient pas dans 6 000 avec 5 mm de trait,
    // mais chaque emboîtement rend 40 mm.
    const plan = planCuts([{ length: 6000, quantity: null }], [], [{ mark: "A", length: 850, quantity: 7, shape: trapeze45 }], {
      kerf: 5,
      trim: 0,
      keepMin: 300,
      section,
    });
    expect(plan.bars).toHaveLength(1);
    expect(plan.bars[0]!.cuts).toHaveLength(7);
    // Un tube sur deux est retourné, chaque coupe sert aux deux pièces voisines.
    expect(plan.bars[0]!.cuts.slice(1).every((c) => c.shared)).toBe(true);
  });

  it("sans section connue, les angles sont ignorés", () => {
    const plan = planCuts([{ length: 6000, quantity: null }], [], [{ mark: "A", length: 1000, quantity: 3, shape: trapeze45 }], {
      kerf: 3,
      trim: 0,
      keepMin: 300,
    });
    expect(plan.bars[0]!.cuts.map((c) => c.start)).toEqual([0, 1003, 2006]);
  });

  it("dessine le recul des bouts pour le schéma", () => {
    const plan = planCuts([{ length: 6000, quantity: null }], [], [{ mark: "A", length: 1000, quantity: 1, shape: trapeze45 }], {
      kerf: 3,
      trim: 0,
      keepMin: 300,
      section,
    });
    const { left, right } = plan.bars[0]!.cuts[0]!.draw;
    // Trapèze : les deux pointes du même côté, 40 mm de recul de l'autre.
    expect(Math.min(...left)).toBeCloseTo(0);
    expect(Math.max(...left)).toBeCloseTo(40);
    expect(left[0]).toBeCloseTo(right[0]);
    expect(left[1]).toBeCloseTo(right[1]);
  });

  it("ne met pas de dressage sur les chutes du stock", () => {
    const plan = planCuts([{ length: 6000, quantity: null }], [1000], [{ mark: "A", length: 1000, quantity: 1 }], {
      kerf: 3,
      trim: 5,
      keepMin: 300,
    });
    expect(plan.bars[0]!.source).toBe("chute");
  });
});
