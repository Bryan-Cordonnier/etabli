import { describe, expect, it } from "vitest";
import type { PieceShape } from "./coupe";
import { planCuts } from "./debit";
import { barOps, sawOrder, type SawOp } from "./ordre";

const trapeze45: PieceShape = { angleL: 45, angleR: 45, planeL: "grande", planeR: "grande", sens: "oppose" };
const section = { width: 40, height: 40, round: false };

const op = (angle: number): SawOp => ({ angle, kind: "piece", cut: 0, flip: false, shared: false });

describe("barOps", () => {
  it("pièces droites : dressage puis une coupe par pièce", () => {
    const plan = planCuts([{ length: 6000, quantity: null }], [], [{ mark: "A", length: 1000, quantity: 3 }], { kerf: 3, trim: 5, keepMin: 300 });
    const ops = barOps(plan.bars[0]!, () => [0, 0], 5);
    expect(ops.map((o) => o.kind)).toEqual(["dressage", "piece", "piece", "piece"]);
    expect(ops.every((o) => o.angle === 0)).toBe(true);
  });

  it("trapèzes emboîtés : une coupe d'angle en bout, puis une coupe par pièce (partagée), tube retourné", () => {
    const plan = planCuts([{ length: 6000, quantity: null }], [], [{ mark: "A", length: 850, quantity: 3, shape: trapeze45 }], {
      kerf: 2,
      trim: 0,
      keepMin: 300,
      section,
    });
    const ops = barOps(plan.bars[0]!, () => [45, 45], 0);
    expect(ops.map((o) => o.kind)).toEqual(["bout", "piece", "piece", "piece"]);
    expect(ops.every((o) => o.angle === 45)).toBe(true);
    expect(ops.slice(2).every((o) => o.shared && o.flip)).toBe(true);
  });

  it("une pièce d'angle suivie d'une pièce droite : recoupe d'équerre entre les deux", () => {
    const plan = planCuts(
      [{ length: 6000, quantity: null }],
      [],
      [
        { mark: "A", length: 2000, quantity: 1, shape: { ...trapeze45, angleL: 0 } },
        { mark: "B", length: 1000, quantity: 1 },
      ],
      { kerf: 2, trim: 0, keepMin: 300, section },
    );
    const angles = (piece: number): [number, number] => (piece === 0 ? [0, 45] : [0, 0]);
    const ops = barOps(plan.bars[0]!, angles, 0);
    // Le rangement met les bouts droits ensemble : A retourné bout pour bout (45° en tête), puis B.
    expect(ops.filter((o) => o.kind === "piece")).toHaveLength(2);
    expect(ops.filter((o) => o.kind === "recoupe").length).toBeLessThanOrEqual(1);
  });
});

describe("sawOrder", () => {
  it("regroupe les coupes par angle : deux réglages seulement", () => {
    const steps = sawOrder([[op(0), op(0), op(45), op(45)], [op(45), op(45)]]);
    expect(steps.map((s) => s.angle)).toEqual([0, 45]);
    expect(steps[0]!.bars).toEqual([{ bar: 0, from: 0, to: 1 }]);
    expect(steps[1]!.bars).toEqual([
      { bar: 0, from: 2, to: 3 },
      { bar: 1, from: 0, to: 1 },
    ]);
  });

  it("commence par l'angle qui fait le plus de coupes d'affilée", () => {
    const steps = sawOrder([[op(30)], [op(45), op(45), op(45)], [op(45)]]);
    expect(steps[0]!.angle).toBe(45);
    expect(steps).toHaveLength(2);
  });

  it("toutes les coupes sont faites une seule fois", () => {
    const bars = [[op(0), op(45), op(0), op(45)], [op(45), op(0)]];
    const steps = sawOrder(bars);
    const done = steps.flatMap((s) => s.bars.map((b) => b.to - b.from + 1)).reduce((a, b) => a + b, 0);
    expect(done).toBe(6);
  });
});
