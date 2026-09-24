import { describe, expect, it } from "vitest";
import { gaugeTable, volume, type ShapeInput } from "./volumes";

const base: ShapeInput = { kind: "cylindre", d1: 0, d2: 0, a: 0, b: 0, a2: 0, b2: 0, h: 0, horizontal: false, fill: NaN };

const ok = (input: Partial<ShapeInput>) => {
  const v = volume({ ...base, ...input });
  if (typeof v === "string") throw new Error(v);
  return v;
};

describe("volume", () => {
  it("cylindre Ø 1 000 × 2 000 : 1 570,8 L, virole de 6,28 m²", () => {
    const v = ok({ d1: 1000, h: 2000 });
    expect(v.total).toBeCloseTo(1570.796, 3);
    expect(v.wall).toBeCloseTo(6.2832, 4);
    expect(v.bottom).toBeCloseTo(0.7854, 4);
  });

  it("cylindre couché à moitié plein : 785,4 L ; au quart du diamètre : 307,1 L", () => {
    expect(ok({ d1: 1000, h: 2000, horizontal: true, fill: 500 }).filled).toBeCloseTo(785.398, 3);
    // Segment : R² acos(0,5) − 250 × √(250 000 − 62 500) = 153 546,2 mm², × 2 000 mm.
    expect(ok({ d1: 1000, h: 2000, horizontal: true, fill: 250 }).filled).toBeCloseTo(307.092, 2);
  });

  it("cylindre debout rempli à 500 mm", () => {
    expect(ok({ d1: 1000, h: 2000, fill: 500 }).filled).toBeCloseTo(392.699, 3);
  });

  it("bac 1 000 × 500 × 400 : 200 L", () => {
    const v = ok({ kind: "bac", a: 1000, b: 500, h: 400 });
    expect(v.total).toBe(200);
    expect(v.wall).toBeCloseTo(1.2, 9);
  });

  it("tronc de cône Ø 400 / Ø 200, hauteur 300 : 21,99 L", () => {
    expect(ok({ kind: "cone", d1: 400, d2: 200, h: 300 }).total).toBeCloseTo(21.9911, 4);
  });

  it("trémie 200 × 200 en bas, 1 000 × 1 000 en haut, hauteur 500 : 206,67 L", () => {
    // Même valeur que la formule du tronc de pyramide : h/3 × (S1 + S2 + √(S1 × S2)).
    expect(ok({ kind: "tremie", a: 200, b: 200, a2: 1000, b2: 1000, h: 500 }).total).toBeCloseTo(206.667, 3);
  });

  it("sphère Ø 1 000 : 523,6 L ; à moitié pleine : 261,8 L", () => {
    expect(ok({ kind: "sphere", d1: 1000 }).total).toBeCloseTo(523.599, 3);
    expect(ok({ kind: "sphere", d1: 1000, fill: 500 }).filled).toBeCloseTo(261.799, 3);
  });

  it("refuse les saisies impossibles", () => {
    expect(typeof volume({ ...base, d1: 1000, h: 0 })).toBe("string");
    expect(typeof volume({ ...base, d1: 1000, h: 500, fill: 600 })).toBe("string");
    expect(typeof volume({ ...base, kind: "cone", d1: 200, d2: 400, h: 300 })).toBe("string");
  });
});

describe("gaugeTable", () => {
  it("barème d'un cylindre couché tous les 100 mm, jusqu'au plein", () => {
    const rows = gaugeTable({ ...base, d1: 1000, h: 2000, horizontal: true }, 100);
    expect(rows).toHaveLength(10);
    expect(rows[4]!.litres).toBeCloseTo(785.398, 3);
    expect(rows[9]!.litres).toBeCloseTo(1570.796, 3);
    // Le volume croît avec la hauteur.
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.litres).toBeGreaterThan(rows[i - 1]!.litres);
  });
});
