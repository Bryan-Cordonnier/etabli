import { describe, expect, it } from "vitest";
import { cone, coude, meanDiameter, piquage, virole, type Point } from "./developpes";
import { tremie } from "./tremie";

const ok = <T>(value: T | string): T => {
  if (typeof value === "string") throw new Error(value);
  return value;
};

describe("virole", () => {
  const base = { diameter: 500, kind: "int" as const, thickness: 5, height: 1000, bevel: 0, sheetLength: 0, divisions: 12 };

  it("Ø intérieur 500, épaisseur 5 : Dm 505, développé 1 586,5 mm (cas du cahier)", () => {
    const v = ok(virole(base));
    expect(v.dm).toBe(505);
    expect(v.developed).toBeCloseTo(1586.504, 3); // π × 505
    expect(v.pieces).toBe(1);
  });

  it("développé plus long que la tôle : deux tôles égales", () => {
    const v = ok(virole({ ...base, sheetLength: 1000 }));
    expect(v.pieces).toBe(2);
    expect(v.pieceLength).toBeCloseTo(793.252, 3);
  });

  it("bout coupé en biais à 30° : génératrices de h − r·tan 30 à h + r·tan 30", () => {
    const v = ok(virole({ ...base, diameter: 200, kind: "moy", bevel: 30, height: 300 }));
    expect(v.minHeight).toBeCloseTo(300 - 100 * Math.tan(Math.PI / 6), 6);
    expect(v.maxHeight).toBeCloseTo(300 + 57.735, 3);
    expect(v.table[6]!.y).toBeCloseTo(v.maxHeight, 6); // à 180° de la soudure
  });

  it("refuse les saisies impossibles", () => {
    expect(typeof virole({ ...base, height: 0 })).toBe("string");
    expect(typeof virole({ ...base, diameter: 200, kind: "moy", bevel: 60, height: 100 })).toBe("string");
  });
});

describe("cone", () => {
  const base = { big: 400, small: 200, kind: "moy" as const, thickness: 0, height: 300, slant: 0, halfAngle: 0, sectors: 1, divisions: 12 };

  it("Ø 200 et Ø 400 moyens, H 300 : génératrice 316,23, ρ 632,46, ρ' 316,23, θ 113,84° (cas du cahier)", () => {
    const c = ok(cone(base));
    expect(c.slant).toBeCloseTo(316.228, 3);
    expect(c.rho).toBeCloseTo(632.456, 3);
    expect(c.rhoSmall).toBeCloseTo(316.228, 3);
    expect(c.theta).toBeCloseTo(113.842, 3);
  });

  it("même cône donné par la génératrice ou le demi-angle", () => {
    expect(ok(cone({ ...base, height: 0, slant: 316.228 })).rho).toBeCloseTo(632.456, 2);
    expect(ok(cone({ ...base, height: 0, halfAngle: Math.atan(100 / 300) * (180 / Math.PI) })).theta).toBeCloseTo(113.842, 3);
  });

  it("deux secteurs : chacun la moitié de l'angle, corde et flèche du grand arc", () => {
    const c = ok(cone({ ...base, sectors: 2 }));
    expect(c.sectorAngle).toBeCloseTo(56.921, 3);
    expect(c.chord).toBeCloseTo(2 * 632.456 * Math.sin((56.921 / 2) * (Math.PI / 180)), 2);
  });

  it("refuse une virole déguisée en cône", () => {
    expect(typeof cone({ ...base, small: 400 })).toBe("string");
  });
});

describe("piquage", () => {
  const base = { mainDiameter: 200, diameter: 100, kind: "int" as const, thickness: 0, angle: 90, offset: 0, length: 200, divisions: 12 };

  it("Ø 100 sur Ø 200 à 90° : 13,40 mm entre le point le plus haut et le plus bas de la coupe (cas du cahier)", () => {
    const p = ok(piquage(base));
    expect(Math.max(...p.table.map((r) => r.rise))).toBeCloseTo(13.397, 3);
    expect(p.table[3]!.rise).toBeCloseTo(13.397, 3); // à 90° (génératrice 4 sur 12)
  });

  it("piquage de même diamètre : la selle descend jusqu'à l'axe", () => {
    const p = ok(piquage({ ...base, diameter: 200 }));
    expect(Math.max(...p.table.map((r) => r.rise))).toBeCloseTo(100, 6);
  });

  it("piquage incliné à 45° : la coupe est plus longue que le piquage droit", () => {
    const droit = ok(piquage(base));
    const incline = ok(piquage({ ...base, angle: 45, length: 400 }));
    const span = (p: typeof droit) => Math.max(...p.table.map((r) => r.rise));
    expect(span(incline)).toBeGreaterThan(span(droit));
  });

  it("refuse un piquage qui déborde du tube principal", () => {
    expect(typeof piquage({ ...base, offset: 60 })).toBe("string");
  });
});

describe("coude", () => {
  const base = { diameter: 100, kind: "moy" as const, thickness: 0, bendRadius: 300, angle: 90, joints: 2, straight: 0, divisions: 12 };

  it("coude à 90° avec 2 joints : coupe à 22,5° (cas du cahier)", () => {
    expect(ok(coude(base)).cutAngle).toBe(22.5);
  });

  it("segment entier : extrados 2·(Rc + r)·tan β, intrados 2·(Rc − r)·tan β", () => {
    const c = ok(coude(base));
    const tan = Math.tan(Math.PI / 8);
    expect(c.full.extrados).toBeCloseTo(700 * tan, 6);
    expect(c.full.intrados).toBeCloseTo(500 * tan, 6);
    expect(c.full.count).toBe(1);
    expect(c.half.count).toBe(2);
    expect(c.tubeLength).toBeCloseTo(600 * tan + 2 * 300 * tan, 6);
  });

  it("refuse un rayon de cintrage plus petit que le tube", () => {
    expect(typeof coude({ ...base, bendRadius: 40 })).toBe("string");
  });
});

describe("trémie carré-rond", () => {
  const length = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const base = { length: 600, width: 400, diameter: 300, height: 400, offsetX: 0, offsetY: 0, divisions: 24 };

  it("le bas déplié mesure le périmètre du rectangle, le haut celui du cercle (en cordes)", () => {
    const t = ok(tremie(base));
    const c = t.pattern.contour;
    const bottom = [0, 1, 2, 3, 4].reduce((sum, i) => sum + length(c[i]!, c[i + 1]!), 0);
    expect(bottom).toBeCloseTo(2 * (600 + 400), 6);
    const topPoints = c.slice(6);
    const top = topPoints.slice(1).reduce((sum, p, i) => sum + length(topPoints[i]!, p), 0);
    expect(top).toBeCloseTo(24 * 300 * Math.sin(Math.PI / 24), 6);
  });

  it("les deux bords de la soudure ont la même longueur", () => {
    const t = ok(tremie(base));
    const c = t.pattern.contour;
    expect(length(c[0]!, c.at(-1)!)).toBeCloseTo(t.seam, 6);
    expect(length(c[5]!, c[6]!)).toBeCloseTo(t.seam, 6);
  });

  it("trémie symétrique : même vraie grandeur aux quatre coins", () => {
    const t = ok(tremie(base));
    const first = (corner: string) => t.trueLengths.filter((l) => l.corner === corner).map((l) => l.length);
    const c1 = first("C1");
    expect(first("C3")).toEqual(c1.map((v) => expect.closeTo(v, 6)));
  });

  it("décalage du cercle et refus des saisies impossibles", () => {
    expect(ok(tremie({ ...base, offsetX: 100 })).area).toBeGreaterThan(0);
    expect(typeof tremie({ ...base, height: 0 })).toBe("string");
    expect(meanDiameter(500, 5, "ext")).toBe(495);
  });
});
