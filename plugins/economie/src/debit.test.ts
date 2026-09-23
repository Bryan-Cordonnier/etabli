import { describe, expect, it } from "vitest";
import { groupBars, planCuts, type CutPiece } from "./debit";

const settings = { kerf: 3, trim: 0, keepMin: 300 };
const count = (plan: ReturnType<typeof planCuts>) => plan.bars.length;

describe("planCuts", () => {
  it("coupe pile une barre quand les pièces tombent juste (sans trait final)", () => {
    const plan = planCuts([{ length: 6000, quantity: null }], [], [{ mark: "A", length: 1500, quantity: 4 }], {
      ...settings,
      kerf: 0,
    });
    expect(count(plan)).toBe(1);
    expect(plan.bars[0]!.remnant).toBe(0);
  });

  it("tient compte du trait de scie", () => {
    // 4 × 1500 + 3 traits de 3 mm = 6009 > 6000 : seulement 3 pièces par barre.
    const plan = planCuts([{ length: 6000, quantity: null }], [], [{ mark: "A", length: 1500, quantity: 4 }], settings);
    expect(count(plan)).toBe(2);
    expect(plan.bars[0]!.cuts).toHaveLength(3);
  });

  it("combine les longueurs mieux qu'un rangement naïf", () => {
    // Optimum : 2 barres (4000+2000, 3000+3000). Un rangement « premier qui rentre » en fait 3.
    const pieces: CutPiece[] = [
      { mark: "A", length: 4000, quantity: 1 },
      { mark: "B", length: 3000, quantity: 2 },
      { mark: "C", length: 2000, quantity: 1 },
    ];
    const plan = planCuts([{ length: 6000, quantity: null }], [], pieces, { ...settings, kerf: 0 });
    expect(count(plan)).toBe(2);
    expect(plan.bars.every((b) => b.remnant === 0)).toBe(true);
  });

  it("utilise les chutes en stock avant les barres neuves", () => {
    const plan = planCuts([{ length: 6000, quantity: null }], [1300], [{ mark: "A", length: 1200, quantity: 2 }], settings);
    expect(plan.bars[0]!.source).toBe("chute");
    expect(plan.bars[0]!.cuts).toHaveLength(1);
    expect(plan.bars[1]!.source).toBe("barre");
  });

  it("déduit le dressage en bout de barre", () => {
    const plan = planCuts([{ length: 6000, quantity: null }], [], [{ mark: "A", length: 3000, quantity: 2 }], {
      ...settings,
      kerf: 0,
      trim: 5,
    });
    expect(count(plan)).toBe(2);
  });

  it("choisit la longueur de barre la mieux remplie", () => {
    const plan = planCuts(
      [
        { length: 6000, quantity: null },
        { length: 4000, quantity: null },
      ],
      [],
      [{ mark: "A", length: 1995, quantity: 2 }],
      { ...settings, kerf: 5 },
    );
    expect(count(plan)).toBe(1);
    expect(plan.bars[0]!.length).toBe(4000);
  });

  it("respecte les quantités de barres disponibles", () => {
    const plan = planCuts([{ length: 6000, quantity: 1 }], [], [{ mark: "A", length: 5000, quantity: 3 }], settings);
    expect(count(plan)).toBe(1);
    expect(plan.unplaced).toHaveLength(2);
  });

  it("signale les pièces trop longues", () => {
    const plan = planCuts([{ length: 6000, quantity: null }], [], [{ mark: "X", length: 7000, quantity: 1 }], settings);
    expect(plan.unplaced).toHaveLength(1);
    expect(count(plan)).toBe(0);
  });

  it("classe les chutes : réutilisables ou perte", () => {
    const plan = planCuts([{ length: 6000, quantity: null }], [], [{ mark: "A", length: 5000, quantity: 1 }], settings);
    expect(plan.bars[0]!.remnant).toBe(997);
    expect(plan.bars[0]!.reusable).toBe(true);
    expect(plan.waste).toBe(3);
  });

  it("reste rapide sur 200 pièces", () => {
    const pieces: CutPiece[] = Array.from({ length: 20 }, (_, i) => ({ mark: `P${i}`, length: 300 + i * 97, quantity: 10 }));
    const start = performance.now();
    const plan = planCuts([{ length: 6000, quantity: null }], [], pieces, settings);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(plan.unplaced).toHaveLength(0);
    // Borne basse : longueur totale / longueur d'une barre.
    const total = pieces.reduce((s, p) => s + (p.length + 3) * p.quantity, 0);
    expect(plan.bars.length).toBeLessThanOrEqual(Math.ceil(total / 6000) + 1);
  });
});

describe("groupBars", () => {
  it("regroupe les barres identiques", () => {
    const plan = planCuts([{ length: 6000, quantity: null }], [], [{ mark: "A", length: 2000, quantity: 9 }], {
      ...settings,
      kerf: 0,
    });
    expect(groupBars(plan.bars)).toEqual([{ bar: plan.bars[0], count: 3 }]);
  });
});
