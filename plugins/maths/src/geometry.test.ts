import { describe, expect, it } from "vitest";
import { evaluate } from "@etabli/ui";
import { parseInches, slopeFromDegrees, solveArc, solveTriangle, toDegrees, toFraction } from "./geometry";

const solutions = (r: ReturnType<typeof solveTriangle>) => ("solutions" in r ? r.solutions : []);

describe("solveTriangle", () => {
  it("trois côtés (3-4-5)", () => {
    const [t] = solutions(solveTriangle({ a: 3, b: 4, c: 5 }));
    expect(t!.C).toBeCloseTo(90, 9);
    expect(t!.A).toBeCloseTo(36.8699, 3);
    expect(t!.area).toBeCloseTo(6, 9);
    expect(t!.perimeter).toBe(12);
    expect(t!.hc).toBeCloseTo(2.4, 9);
  });

  it("deux côtés et l'angle compris", () => {
    const [t] = solutions(solveTriangle({ a: 3, b: 4, C: 90 }));
    expect(t!.c).toBeCloseTo(5, 9);
  });

  it("un côté et deux angles", () => {
    const [t] = solutions(solveTriangle({ c: 10, A: 30, B: 60 }));
    expect(t!.C).toBeCloseTo(90, 9);
    expect(t!.a).toBeCloseTo(5, 9);
    expect(t!.b).toBeCloseTo(8.6603, 3);
  });

  it("cas ambigu : deux triangles possibles", () => {
    const list = solutions(solveTriangle({ a: 6, b: 8, A: 30 }));
    expect(list).toHaveLength(2);
    expect(list[0]!.B).toBeCloseTo(41.81, 2);
    expect(list[1]!.B).toBeCloseTo(138.19, 2);
  });

  it("refuse les cas impossibles", () => {
    expect(solveTriangle({ a: 1, b: 2, c: 5 })).toHaveProperty("error");
    expect(solveTriangle({ A: 60, B: 60, C: 60 })).toHaveProperty("error");
    expect(solveTriangle({ a: 3, b: 4 })).toHaveProperty("error");
    expect(solveTriangle({ a: 2, b: 8, A: 60 })).toHaveProperty("error");
    expect(solveTriangle({ a: 5, A: 100, B: 90 })).toHaveProperty("error");
  });
});

describe("solveArc", () => {
  const reference = solveArc({ radius: 500, angle: 60 });

  it("à partir du rayon et de l'angle", () => {
    if (typeof reference === "string") throw new Error(reference);
    expect(reference.chord).toBeCloseTo(500, 9);
    expect(reference.sagitta).toBeCloseTo(66.987, 3);
    expect(reference.length).toBeCloseTo(523.599, 3);
  });

  it("retrouve le même arc depuis n'importe quelle paire", () => {
    if (typeof reference === "string") throw new Error(reference);
    const pairs = [
      { chord: reference.chord, sagitta: reference.sagitta },
      { chord: reference.chord, length: reference.length },
      { sagitta: reference.sagitta, length: reference.length },
      { radius: 500, chord: reference.chord },
      { radius: 500, sagitta: reference.sagitta },
      { radius: 500, length: reference.length },
      { chord: reference.chord, angle: 60 },
      { sagitta: reference.sagitta, angle: 60 },
      { length: reference.length, angle: 60 },
    ];
    for (const pair of pairs) {
      const arc = solveArc(pair);
      if (typeof arc === "string") throw new Error(arc);
      expect(arc.radius).toBeCloseTo(500, 6);
      expect(arc.angle).toBeCloseTo(60, 6);
    }
  });

  it("gère un arc plus grand qu'un demi-cercle (corde et flèche)", () => {
    const arc = solveArc({ chord: 800, sagitta: 800 });
    if (typeof arc === "string") throw new Error(arc);
    expect(arc.radius).toBeCloseTo(500, 9);
    expect(arc.angle).toBeGreaterThan(180);
  });

  it("refuse les valeurs incohérentes", () => {
    expect(typeof solveArc({ radius: 100, chord: 300 })).toBe("string");
    expect(typeof solveArc({ chord: 300, length: 200 })).toBe("string");
    expect(typeof solveArc({ radius: 100 })).toBe("string");
  });
});

describe("conversions", () => {
  it("fractions de pouce", () => {
    expect(toFraction(34.925 / 25.4)).toBe('1 3/8"');
    expect(toFraction(0.5)).toBe('1/2"');
    expect(toFraction(2)).toBe('2"');
    expect(toFraction(0.999)).toBe('1"');
    expect(parseInches("1 3/8", evaluate)).toBe(1.375);
    expect(parseInches('3/4"', evaluate)).toBe(0.75);
    expect(parseInches("2,5", evaluate)).toBe(2.5);
  });

  it("pentes et angles", () => {
    expect(slopeFromDegrees(45).percent).toBeCloseTo(100, 9);
    expect(slopeFromDegrees(45).ratio).toBeCloseTo(1, 9);
    expect(toDegrees(100, "percent")).toBeCloseTo(45, 9);
    expect(toDegrees(20, "mmPerM")).toBeCloseTo(1.1458, 3);
    expect(toDegrees(Math.PI, "rad")).toBeCloseTo(180, 9);
  });
});
