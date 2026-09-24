import { describe, expect, it } from "vitest";
import { groupPlates, planPlates, type PlatePiece, type Rect, type SheetPlan } from "./cisaille";

const shear = { bladeLength: 2050, gaugeMax: 750, trim: 5, keep: [100, 200] as [number, number] };
const sheet2500 = { length: 2500, width: 1250, quantity: null, tolMinus: 0, tolPlus: 5 };

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.length - 1e-6 && b.x < a.x + a.length - 1e-6 && a.y < b.y + b.width - 1e-6 && b.y < a.y + a.width - 1e-6;

function checkSheet(sheet: SheetPlan): void {
  for (const p of sheet.pieces) {
    expect(p.x).toBeGreaterThanOrEqual(-1e-6);
    expect(p.y).toBeGreaterThanOrEqual(-1e-6);
    expect(p.x + p.length).toBeLessThanOrEqual(sheet.length + 1e-6);
    expect(p.y + p.width).toBeLessThanOrEqual(sheet.width + 1e-6);
  }
  const all = [...sheet.pieces, ...sheet.chutes];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i]!, all[j]!)).toBe(false);
}

// L'exemple de la fiche validée : une tôle de 2 500 × 1 250, cisaille de 2 050.
const armoire: PlatePiece[] = [
  { mark: "A", length: 600, width: 400, quantity: 6, grain: false },
  { mark: "B", length: 700, width: 300, quantity: 2, grain: false },
  { mark: "D", length: 450, width: 450, quantity: 2, grain: false },
  { mark: "E", length: 700, width: 200, quantity: 2, grain: true },
];

describe("planPlates", () => {
  it("place toute l'armoire sur une seule tôle, sans chevauchement", () => {
    const plan = planPlates([sheet2500], [], armoire, shear);
    expect(plan.unplaced).toEqual([]);
    expect(plan.sheets).toHaveLength(1);
    expect(plan.sheets[0]!.pieces).toHaveLength(12);
    checkSheet(plan.sheets[0]!);
  });

  it("coupe les bandes dans la largeur : 2 500 ne passe pas dans une lame de 2 050", () => {
    const plan = planPlates([sheet2500], [], armoire, shear);
    const sheet = plan.sheets[0]!;
    expect(sheet.axis).toBe("x");
    // Les coupes de bande traversent la largeur (1 250).
    for (const cut of sheet.cuts.filter((c) => c.stage === 1)) expect(cut.overBlade).toBe(false);
  });

  it("respecte le sens imposé (longueur le long du laminage)", () => {
    const plan = planPlates([sheet2500], [], armoire, shear);
    for (const p of plan.sheets[0]!.pieces.filter((p) => p.mark === "E")) {
      expect(p.rotated).toBe(false);
      expect(p.length).toBe(700);
    }
  });

  it("règle la butée du plus grand au plus petit, et numérote les coupes", () => {
    const plan = planPlates([sheet2500], [], armoire, shear);
    const cuts = plan.sheets[0]!.cuts;
    expect(cuts[0]!.stage).toBe(0); // dressage
    expect(cuts.map((c) => c.n)).toEqual(cuts.map((_, i) => i));
    const bands = cuts.filter((c) => c.stage === 1).map((c) => c.gauge);
    expect(bands).toEqual([...bands].sort((a, b) => b - a));
  });

  it("utilise les chutes du stock d'abord, sans dressage", () => {
    const plan = planPlates([sheet2500], [{ length: 800, width: 600 }], [{ mark: "F", length: 750, width: 280, quantity: 2, grain: false }], shear);
    expect(plan.sheets).toHaveLength(1);
    expect(plan.sheets[0]!.source).toBe("chute");
    expect(plan.sheets[0]!.trim).toBe(0);
    checkSheet(plan.sheets[0]!);
  });

  it("calcule sur la plus petite tôle possible et signale les restes qui grandissent avec la tolérance", () => {
    const plan = planPlates([{ ...sheet2500, tolMinus: 5 }], [], [{ mark: "A", length: 1000, width: 1245, quantity: 1, grain: false }], shear);
    const sheet = plan.sheets[0]!;
    expect(sheet.length).toBe(2495);
    expect(sheet.chutes.some((c) => c.grow[0] > 0 || c.grow[1] > 0)).toBe(true);
  });

  it("signale les pièces trop grandes", () => {
    const plan = planPlates([sheet2500], [], [{ mark: "X", length: 3000, width: 500, quantity: 1, grain: false }], shear);
    expect(plan.unplaced).toHaveLength(1);
    expect(plan.sheets).toHaveLength(0);
  });

  it("signale une cote au-delà de la course de la butée", () => {
    const plan = planPlates([sheet2500], [], [{ mark: "G", length: 1200, width: 1000, quantity: 1, grain: false }], shear);
    expect(plan.sheets[0]!.cuts.some((c) => c.overGauge)).toBe(true);
  });

  it("garde les grandes chutes, jette les petites", () => {
    const plan = planPlates([sheet2500], [], [{ mark: "A", length: 1000, width: 1250, quantity: 1, grain: false }], { ...shear, trim: 0 });
    const sheet = plan.sheets[0]!;
    expect(sheet.chutes.filter((c) => c.keep).length).toBeGreaterThan(0);
    expect(plan.keptArea).toBeCloseTo(1500 * 1250);
  });

  it("regroupe les tôles identiques", () => {
    const plan = planPlates([sheet2500], [], [{ mark: "A", length: 1200, width: 1250, quantity: 6, grain: false }], { ...shear, trim: 0 });
    expect(groupPlates(plan.sheets)).toEqual([{ sheet: plan.sheets[0], count: 3 }]);
  });

  it("reste rapide sur 150 pièces", () => {
    const pieces: PlatePiece[] = Array.from({ length: 15 }, (_, i) => ({ mark: `P${i}`, length: 150 + i * 37, width: 90 + i * 23, quantity: 10, grain: i % 4 === 0 }));
    const start = performance.now();
    const plan = planPlates([sheet2500], [], pieces, shear);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(plan.unplaced).toHaveLength(0);
    for (const sheet of plan.sheets) checkSheet(sheet);
  });
});
