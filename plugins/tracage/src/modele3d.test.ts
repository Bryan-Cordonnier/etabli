import { describe, expect, it } from "vitest";
import { cone, coude, piquage, virole } from "./developpes";
import { coneModel, coudeModel, coudeSegments, piquageModel, shell, tremieModel, viroleModel, type P3 } from "./modele3d";
import { tremie } from "./tremie";

const ok = <T>(value: T | string): T => {
  if (typeof value === "string") throw new Error(value);
  return value;
};
const radiusY = ([x, , z]: P3) => Math.hypot(x, z);
const close = (a: P3, b: P3, digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

describe("coque épaisse", () => {
  const ring = (radius: number) =>
    Array.from({ length: 24 }, (_, i) => {
      const a = (2 * Math.PI * i) / 24;
      return [[radius * Math.sin(a), 0, radius * Math.cos(a)], [radius * Math.sin(a), 100, radius * Math.cos(a)]] as P3[];
    });

  it("décale d'une demi-épaisseur de part et d'autre de la surface", () => {
    const { surface, caps } = shell(ring(100), 10);
    const points = Array.from({ length: surface.positions.length / 3 }, (_, i) => surface.positions.slice(i * 3, i * 3 + 3) as P3);
    const radii = points.map(radiusY);
    expect(radii.slice(0, 48).every((r) => Math.abs(r - 105) < 1e-9 || Math.abs(r - 95) < 1e-9)).toBe(true);
    expect(new Set(radii.map((r) => Math.round(r))).size).toBe(2);
    // Deux chants (haut et bas), 24 quadrilatères de 2 triangles.
    expect(caps.length).toBe(2 * 24 * 6 * 3);
    // Faces extérieure et intérieure : 24 × 1 quadrilatère chacune.
    expect(surface.indices.length).toBe(2 * 24 * 6);
  });

  it("épaisseur nulle : la surface seule, sans chant", () => {
    const { surface, caps } = shell(ring(100), 0);
    expect(caps.length).toBe(0);
    expect(surface.positions.length).toBe(24 * 2 * 3);
  });
});

describe("modèles 3D", () => {
  it("virole en biais : rayon moyen, hauteurs du tableau de traçage", () => {
    const v = ok(virole({ diameter: 200, kind: "moy", thickness: 4, height: 300, bevel: 30, sheetLength: 0, divisions: 12 }));
    const m = viroleModel(v, 4, true);
    const rings = m.surfaces[0]!.rings;
    expect(rings.every((r) => Math.abs(radiusY(r[0]!) - 100) < 1e-9)).toBe(true);
    expect(rings[0]![1]![1]).toBeCloseTo(v.minHeight, 9); // soudure : génératrice la plus courte
    expect(rings[48]![1]![1]).toBeCloseTo(v.maxHeight, 9); // à 180°
    expect(m.labels.map((l) => l.text)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    expect(m.lines.filter((l) => l.kind === "seam")).toHaveLength(1);
  });

  it("cône : grand rayon en bas, petit en haut, un raccord par secteur", () => {
    const c = ok(cone({ big: 400, small: 200, bigKind: "moy", smallKind: "moy", thickness: 0, height: 300, slant: 0, halfAngle: 0, sectors: 3, divisions: 24 }));
    const m = coneModel(c, 3, 3);
    const [bottom, top] = m.surfaces[0]!.rings[10]!;
    expect(radiusY(bottom!)).toBeCloseTo(200, 9);
    expect(radiusY(top!)).toBeCloseTo(100, 9);
    expect(top![1]).toBeCloseTo(300, 9);
    expect(m.lines.filter((l) => l.kind === "joint")).toHaveLength(2);
  });

  it("piquage : tube principal au rayon moyen, génératrices numérotées de la coupe au bout libre", () => {
    const p = ok(piquage({ mainDiameter: 200, mainKind: "ext", mainThickness: 6, diameter: 100, kind: "ext", thickness: 4, angle: 90, offset: 0, length: 200, divisions: 12 }));
    const m = piquageModel(p, { angle: 90, offset: 0, length: 200, thickness: 4, mainThickness: 6 });
    const main = m.surfaces.find((s) => s.role === "context")!;
    // Tube principal le long de x : distance à l'axe = rayon moyen (100 − 3).
    expect(main.rings.every((r) => Math.abs(Math.hypot(r[0]![1], r[0]![2]) - 97) < 1e-9)).toBe(true);
    const branch = m.surfaces.find((s) => s.role === "piece")!;
    // Piquage droit : bout libre à 200 mm de l'axe principal, en haut.
    expect(branch.rings.every((r) => Math.abs(r[1]![1] - 200) < 1e-9)).toBe(true);
    expect(m.labels).toHaveLength(12);
  });

  it("coude : les segments voisins se rejoignent exactement sur le plan de joint", () => {
    const input = { bendRadius: 300, angle: 90, joints: 3, straight: 50, thickness: 3 };
    const c = ok(coude({ diameter: 100, kind: "moy", thickness: 3, bendRadius: 300, angle: 90, joints: 3, straight: 50, divisions: 12 }));
    const m = coudeModel(c, input);
    expect(m.surfaces).toHaveLength(4); // 2 demi-segments + 2 segments entiers
    for (let k = 0; k + 1 < m.surfaces.length; k++) {
      m.surfaces[k]!.rings.forEach((ring, i) => close(ring[1]!, m.surfaces[k + 1]!.rings[i]![0]!));
    }
    // Extrados d'un segment entier : la longueur calculée pour le traçage.
    const [from, to] = m.surfaces[1]!.rings[0]!;
    expect(Math.hypot(to![0] - from![0], to![1] - from![1], to![2] - from![2])).toBeCloseTo(c.full.extrados, 9);
    // Le dernier segment part à 90° du premier.
    const segments = coudeSegments(input);
    close(segments.at(-1)!.dir, [1, 0, 0]);
  });

  it("trémie : bas sur le rectangle, haut sur le cercle, coins étiquetés", () => {
    const t = ok(
      tremie({ length: 600, width: 400, diameter: 300, lengthKind: "moy", widthKind: "moy", diameterKind: "moy", thickness: 0, height: 400, offsetX: 0, offsetY: 0, divisions: 24 }),
    );
    const m = tremieModel(t, 3);
    const rings = m.surfaces[0]!.rings;
    expect(rings).toHaveLength(1 + 4 * 7);
    expect(rings.every(([bottom, top]) => bottom![1] === 0 && Math.abs(top![1] - 400) < 1e-9)).toBe(true);
    expect(rings.every(([, top]) => Math.abs(radiusY(top!) - 150) < 1e-9)).toBe(true);
    expect(m.labels.filter((l) => l.kind === "name").map((l) => l.text)).toEqual(["C1", "C2", "C3", "C4", "soudure"]);
  });
});
