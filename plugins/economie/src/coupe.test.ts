import { describe, expect, it } from "vitest";
import { STRAIGHT, arrange, ends, gap, oriented, type PieceShape } from "./coupe";

const tube40 = { width: 40, height: 40, round: false };
const rect60x40 = { width: 60, height: 40, round: false };
const trapeze45: PieceShape = { angleL: 45, angleR: 45, planeL: "grande", planeR: "grande", sens: "oppose" };

describe("ends", () => {
  it("coupe droite : aucun recul", () => {
    const e = ends(STRAIGHT, tube40);
    expect(e.left).toEqual({ c: 0, a: 0, b: 0 });
    expect(e.right).toEqual({ c: 0, a: 0, b: 0 });
  });

  it("45° sur la grande face d'un 60 × 40 : recul de 60 mm d'un bord à l'autre", () => {
    const { left } = ends({ ...trapeze45, angleR: 0 }, rect60x40);
    const at = (y: number) => left.c + left.a * y;
    expect(at(30)).toBeCloseTo(0); // pointe
    expect(at(-30)).toBeCloseTo(60);
  });

  it("45° sur la petite face : recul de 40 mm, le long de la hauteur", () => {
    const { left } = ends({ ...trapeze45, angleR: 0, planeL: "petite" }, rect60x40);
    expect(left.a).toBe(0);
    expect(left.c - (left.b * 40) / 2).toBeCloseTo(40);
  });
});

describe("gap", () => {
  it("pièces droites : un trait de scie", () => {
    const e = ends(STRAIGHT, tube40);
    expect(gap(e.right, e.left, 3, tube40).gap).toBeCloseTo(3);
  });

  it("trapèzes à 45° posés dans le même sens : les pointes se touchent, le coin est perdu", () => {
    const e = ends(trapeze45, tube40);
    const g = gap(e.right, e.left, 0, tube40);
    expect(g.gap).toBeCloseTo(0);
    expect(g.shared).toBe(false);
  });

  it("trapèze suivant retourné : les coupes s'emboîtent, une seule coupe", () => {
    const e = ends(trapeze45, tube40);
    const g = gap(e.right, oriented(e, 1).left, 0, tube40);
    expect(g.gap).toBeCloseTo(-40);
    expect(g.shared).toBe(true);
  });

  it("parallélogrammes identiques : ils s'emboîtent sans retourner le tube", () => {
    const e = ends({ ...trapeze45, sens: "meme" }, tube40);
    const g = gap(e.right, e.left, 0, tube40);
    expect(g.gap).toBeCloseTo(-40);
    expect(g.shared).toBe(true);
  });

  it("le trait de scie compte plus large le long de la barre pour une coupe d'angle", () => {
    const e = ends(trapeze45, tube40);
    expect(gap(e.right, oriented(e, 1).left, 2, tube40).gap).toBeCloseTo(-40 + 2 * Math.SQRT2);
  });

  it("tube rond : même emboîtement que le carré de même diamètre", () => {
    const round = { width: 40, height: 40, round: true };
    const e = ends(trapeze45, round);
    expect(gap(e.right, oriented(e, 1).left, 0, round).gap).toBeCloseTo(-40);
    expect(gap(e.right, e.left, 0, round).gap).toBeCloseTo(0);
  });
});

describe("arrange", () => {
  const info = (shape: PieceShape, length: number, kind = 0) => () => ({ kind, length, ends: ends(shape, tube40) });

  it("retourne un trapèze sur deux pour les emboîter", () => {
    const result = arrange([1, 2, 3, 4], info(trapeze45, 500), 0, tube40);
    // 4 × 500, trois emboîtements de 40 mm.
    expect(result.length).toBeCloseTo(2000 - 3 * 40);
    const flips = result.placed.map((p) => p.orientation === 1 || p.orientation === 3);
    expect(flips).toEqual([flips[0], !flips[0], flips[0], !flips[0]]);
    expect(result.placed.slice(1).every((p) => p.sharedWithPrevious)).toBe(true);
  });

  it("pièces droites : longueurs et traits de scie", () => {
    const result = arrange([1, 2, 3], info(STRAIGHT, 1000), 3, tube40);
    expect(result.length).toBeCloseTo(3006);
    expect(result.placed.map((p) => p.start)).toEqual([0, 1003, 2006]);
  });

  it("met un bout droit contre un bout droit plutôt que contre un angle", () => {
    const halfAngled: PieceShape = { ...trapeze45, angleL: 0 };
    const items = [
      { kind: 0, length: 500, ends: ends(halfAngled, tube40) },
      { kind: 1, length: 800, ends: ends(STRAIGHT, tube40) },
    ];
    const result = arrange(items, (x) => x, 0, tube40);
    // Au mieux, les deux bouts droits se touchent : aucune perte.
    expect(result.length).toBeCloseTo(1300);
  });
});
