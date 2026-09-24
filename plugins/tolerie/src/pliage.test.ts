import { describe, expect, it } from "vitest";
import {
  MATIERES,
  airBendRadius,
  bendingForce,
  kFactor,
  matiere,
  minFlange,
  recommendedVee,
  toTonnes,
  unfold,
  type UnfoldInput,
} from "./pliage";

const base: UnfoldInput = {
  thickness: 2,
  radius: 2,
  flanges: [50, 50],
  bends: [{ angle: 90, up: true }],
  dims: "ext",
  method: "k",
  k: 0.44,
  deduction: 0,
};

const ok = (input: Partial<UnfoldInput>) => {
  const r = unfold({ ...base, ...input });
  if (typeof r === "string") throw new Error(r);
  return r;
};

describe("unfold", () => {
  it("équerre 50 × 50, e 2, Ri 2, K 0,44 : développé 96,52 (cas du cahier des charges)", () => {
    const r = ok({});
    expect(r.bends[0]!.allowance).toBeCloseTo(4.5239, 4);
    expect(r.developed).toBeCloseTo(96.524, 3);
    expect(r.parts.map((p) => p.length)).toEqual([46, r.bends[0]!.allowance, 46]);
    // Déduction équivalente : 2 × 4 − 4,524.
    expect(r.bends[0]!.deduction).toBeCloseTo(3.476, 3);
    expect(r.bendLines[0]).toBeCloseTo(48.262, 3);
  });

  it("U 30 / 50 / 30 : 103,05 mm", () => {
    const r = ok({ flanges: [30, 50, 30], bends: [{ angle: 90, up: true }, { angle: 90, up: true }] });
    expect(r.developed).toBeCloseTo(103.048, 3);
    expect(r.bendLines).toHaveLength(2);
  });

  it("pli ouvert à 135° entre les ailes (pliage de 45°)", () => {
    const r = ok({ bends: [{ angle: 135, up: true }] });
    expect(r.bends[0]!.alpha).toBe(45);
    expect(r.developed).toBeCloseTo(98.9482, 3);
  });

  it("cotes intérieures : équivaut aux cotes extérieures augmentées de l'épaisseur", () => {
    expect(ok({ dims: "int" }).developed).toBeCloseTo(100.524, 3);
    expect(ok({ dims: "int" }).developed).toBeCloseTo(ok({ flanges: [52, 52] }).developed, 9);
  });

  it("déduction de pli lue dans les tables de l'atelier", () => {
    const r = ok({ method: "deduction", deduction: 3.5 });
    expect(r.developed).toBeCloseTo(96.5, 9);
    expect(r.bendLines[0]).toBeCloseTo(48.25, 9);
    expect(ok({ method: "deduction", deduction: 3.5, dims: "int" }).developed).toBeCloseTo(100.5, 9);
  });

  it("refuse les saisies impossibles", () => {
    expect(typeof unfold({ ...base, thickness: 0 })).toBe("string");
    expect(typeof unfold({ ...base, flanges: [3, 50] })).toBe("string"); // plus courte que le retrait de 4 mm
    expect(typeof unfold({ ...base, bends: [{ angle: 180, up: true }] })).toBe("string");
    expect(typeof unfold({ ...base, bends: [] })).toBe("string");
    expect(typeof unfold({ ...base, k: 1.5 })).toBe("string");
  });
});

describe("kFactor (DIN 6935)", () => {
  it("proposé selon le rapport Ri / e", () => {
    expect(kFactor(2, 2)).toBeCloseTo(0.325, 9);
    // (0,65 + 0,5 × log(5)) / 2 = (0,65 + 0,3495) / 2.
    expect(kFactor(10, 2)).toBeCloseTo(0.4997, 4);
    expect(kFactor(40, 2)).toBe(0.5);
    expect(kFactor(0.2, 2)).toBe(0.3);
  });
});

describe("vé et effort", () => {
  it("vé conseillé arrondi au vé courant", () => {
    expect(recommendedVee(3)).toBe(24);
    expect(recommendedVee(1.5)).toBe(12);
    expect(recommendedVee(10)).toBe(100);
    expect(recommendedVee(25)).toBe(300);
  });

  it("S235, e 3, L 1 000, V 24 : 199,5 kN, environ 20,3 t (cas du cahier des charges)", () => {
    const force = bendingForce(matiere("s235").rm, 3, 1000, 24);
    expect(force).toBeCloseTo(199500, 6);
    expect(toTonnes(force)).toBeCloseTo(20.34, 2);
  });

  it("rayon obtenu et aile mini", () => {
    expect(airBendRadius(24)).toBe(4);
    expect(minFlange(24)).toBeCloseTo(16.8, 9);
  });

  it("table des matières complète", () => {
    expect(MATIERES.length).toBeGreaterThanOrEqual(10);
    for (const m of MATIERES) {
      expect(m.rm).toBeGreaterThan(m.re);
      expect(m.masseVolumique).toBeGreaterThan(2);
      expect(m.rayonMini).toBeGreaterThan(0);
    }
  });
});
