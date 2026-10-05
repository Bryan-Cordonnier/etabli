import { describe, expect, it } from "vitest";
import { cheminAire, cheminLigne, echelle, graduations, plusProche, regrouper, secteurs } from "./charts";

describe("graduations", () => {
  it("repères ronds qui couvrent l'intervalle", () => {
    expect(graduations(0, 100)).toEqual([0, 25, 50, 75, 100]);
    expect(graduations(0, 1000, 5)).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(graduations(-50, 150)).toEqual([-50, 0, 50, 100, 150]);
    expect(graduations(12, 87, 3)).toEqual([0, 25, 50, 75, 100]);
  });
  it("couvre toujours min et max, croissant, sans doublon", () => {
    for (const [min, max] of [[0, 7], [-3.3, 12.9], [100000, 123456], [-250000, -1], [0.001, 0.009]] as const) {
      const g = graduations(min, max);
      expect(g[0]!).toBeLessThanOrEqual(min);
      expect(g[g.length - 1]!).toBeGreaterThanOrEqual(max);
      for (let i = 1; i < g.length; i++) expect(g[i]!).toBeGreaterThan(g[i - 1]!);
      expect(g.length).toBeLessThanOrEqual(8);
    }
  });
  it("intervalle réduit à un point ou valeurs absurdes", () => {
    expect(graduations(0, 0)).toEqual([0, 1]);
    expect(graduations(5, 5)).toEqual([0, 5]);
    expect(graduations(-5, -5)).toEqual([-5, 0]);
    expect(graduations(NaN, 1)).toEqual([0]);
  });
});

describe("échelle et chemins", () => {
  it("échelle linéaire, y inversé possible", () => {
    const y = echelle([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(100)).toBe(0);
    expect(y(25)).toBe(150);
    expect(echelle([5, 5], [0, 10])(5)).toBe(5);
  });
  it("chemin de ligne et d'aire", () => {
    const pts = [{ x: 0, y: 10 }, { x: 5.123, y: 4 }, { x: 10, y: 8 }];
    expect(cheminLigne(pts)).toBe("M0 10 L5.12 4 L10 8");
    expect(cheminLigne([])).toBe("");
    expect(cheminAire(pts, 20)).toBe("M0 10 L5.12 4 L10 8 L10 20 L0 20 Z");
    expect(cheminAire([], 20)).toBe("");
  });
  it("point le plus proche", () => {
    const pts = [0, 10, 20, 30].map((x) => ({ x, y: 0 }));
    expect(plusProche(pts, -5)).toBe(0);
    expect(plusProche(pts, 4)).toBe(0);
    expect(plusProche(pts, 6)).toBe(1);
    expect(plusProche(pts, 15)).toBe(1); // à égalité, le premier
    expect(plusProche(pts, 99)).toBe(3);
    expect(plusProche([], 1)).toBe(-1);
  });
});

describe("regrouper et secteurs", () => {
  it("garde les plus grandes parts et regroupe le reste", () => {
    const parts = [1, 2, 3, 4, 5].map((v, i) => ({ label: `p${i}`, value: v }));
    expect(regrouper(parts, 10).map((p) => p.value)).toEqual([5, 4, 3, 2, 1]);
    expect(regrouper(parts, 3)).toEqual([{ label: "p4", value: 5 }, { label: "p3", value: 4 }, { label: "Autres", value: 6 }]);
    expect(regrouper([{ label: "a", value: 0 }, { label: "b", value: -2 }])).toEqual([]);
  });
  it("angles : la somme fait un tour, départ en haut", () => {
    const s = secteurs([1, 1, 2], 50, 10);
    expect(s).toHaveLength(3);
    expect(s[0]!.debut).toBe(0);
    expect(s[2]!.fin).toBeCloseTo(Math.PI * 2, 10);
    expect(s[1]!.fin - s[1]!.debut).toBeCloseTo(Math.PI / 2, 10);
    expect(s.every((x) => x.d.startsWith("M") && x.d.endsWith("Z"))).toBe(true);
  });
  it("une part unique est un anneau complet ; rien sans valeur", () => {
    const [seul] = secteurs([42], 50, 10);
    expect(seul!.d.match(/A/g)).toHaveLength(4);
    expect(secteurs([], 50, 10)).toEqual([]);
    expect(secteurs([0, 0], 50, 10)).toEqual([]);
    const avecZero = secteurs([0, 5, 5], 50, 10);
    expect(avecZero[0]!.d).toBe("");
    expect(avecZero[1]!.d).not.toBe("");
  });
  it("le premier secteur (moitié) part de la verticale et finit en bas", () => {
    const [a] = secteurs([1, 1], 50, 10, 0);
    expect(a!.d.startsWith("M0 -50 A50 50 0 0 1 ")).toBe(true);
    expect(a!.d).toContain("0 50"); // arrivée en bas, au rayon extérieur
  });
});
