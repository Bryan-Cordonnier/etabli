import { describe, expect, it } from "vitest";
import { boltCircle, solvePolygon, type BoltCircleInput } from "./formes";

const base: BoltCircleInput = { count: 6, diameter: 200, startAngle: 0, span: 360, clockwise: false, cx: 0, cy: 0 };

const circle = (input: Partial<BoltCircleInput>) => {
  const result = boltCircle({ ...base, ...input });
  if (typeof result === "string") throw new Error(result);
  return result;
};

describe("boltCircle", () => {
  it("6 trous sur Ø 200 : entraxe 100 mm (cas du cahier des charges)", () => {
    const c = circle({});
    expect(c.pitch).toBeCloseTo(100, 9);
    expect(c.step).toBe(60);
    expect(c.holes[1]).toEqual({ n: 2, angle: 60, x: 50, y: 86.60254 });
  });

  it("4 trous sur Ø 100, premier trou à 45°", () => {
    const c = circle({ count: 4, diameter: 100, startAngle: 45 });
    expect(c.holes.map((h) => [h.x, h.y])).toEqual([
      [35.355339, 35.355339],
      [-35.355339, 35.355339],
      [-35.355339, -35.355339],
      [35.355339, -35.355339],
    ]);
    expect(c.pitch).toBeCloseTo(70.7107, 4);
  });

  it("8 trous sur Ø 150 : entraxe 57,40 mm", () => {
    expect(circle({ count: 8, diameter: 150 }).pitch).toBeCloseTo(57.4025, 4);
  });

  it("sur un arc : le premier et le dernier trou aux extrémités", () => {
    const c = circle({ count: 5, diameter: 200, startAngle: 90, span: 120 });
    expect(c.step).toBe(30);
    expect(c.holes.map((h) => h.angle)).toEqual([90, 120, 150, 180, 210]);
  });

  it("sens horaire et centre décalé (cotes depuis un coin de la pièce)", () => {
    const c = circle({ count: 4, diameter: 100, startAngle: 90, clockwise: true, cx: 150, cy: 80 });
    expect(c.holes.map((h) => h.angle)).toEqual([90, 0, 270, 180]);
    expect(c.holes[1]).toMatchObject({ x: 200, y: 80 });
  });

  it("refuse les saisies impossibles", () => {
    expect(typeof boltCircle({ ...base, count: 1 })).toBe("string");
    expect(typeof boltCircle({ ...base, count: 2.5 })).toBe("string");
    expect(typeof boltCircle({ ...base, diameter: 0 })).toBe("string");
    expect(typeof boltCircle({ ...base, span: 400 })).toBe("string");
  });
});

describe("solvePolygon", () => {
  const ok = (n: number, key: Parameters<typeof solvePolygon>[1], value: number) => {
    const p = solvePolygon(n, key, value);
    if (typeof p === "string") throw new Error(p);
    return p;
  };

  it("hexagone sur plats 30 : côté 17,32, sur angles 34,64 (cas du cahier des charges)", () => {
    const p = ok(6, "flats", 30);
    expect(p.side).toBeCloseTo(17.3205, 4);
    expect(p.corners).toBeCloseTo(34.641, 3);
    expect(p.miter).toBe(30);
    expect(p.interiorAngle).toBe(120);
  });

  it("carré de 10 : diagonale 14,14, aire 100, onglets à 45°", () => {
    const p = ok(4, "side", 10);
    expect(p.corners).toBeCloseTo(14.1421, 4);
    expect(p.flats).toBeCloseTo(10, 9);
    expect(p.area).toBeCloseTo(100, 9);
    expect(p.miter).toBe(45);
  });

  it("triangle équilatéral de 10 : hauteur 8,66, aire 43,30", () => {
    const p = ok(3, "side", 10);
    expect(p.height).toBeCloseTo(8.6603, 4);
    expect(p.area).toBeCloseTo(43.3013, 4);
    expect(p.corners).toBeCloseTo(11.547, 3);
  });

  it("retrouve le même polygone depuis chaque dimension", () => {
    const ref = ok(8, "side", 25);
    for (const key of ["flats", "corners", "area"] as const) {
      expect(ok(8, key, ref[key]).side).toBeCloseTo(25, 9);
    }
  });

  it("refuse les saisies impossibles", () => {
    expect(typeof solvePolygon(2, "side", 10)).toBe("string");
    expect(typeof solvePolygon(5, "side", 0)).toBe("string");
  });
});
