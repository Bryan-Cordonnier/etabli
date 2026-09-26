import { describe, expect, it } from "vitest";
import {
  FILETAGES,
  designation,
  filetage,
  foretRefouler,
  foretTaraudage,
  interieurTaraudage,
  noyauVis,
  sectionResistante,
} from "./filetage";
import { ACIER, FAMILLES, aireFromKgPerM, kgPerM, pesee, profileKgPerM, section, tailles } from "./masse";
import { CLASSES, DIAMETRES, classe, cle, serrage } from "./serrage";
import { MATIERES_USINAGE, OPERATIONS, OUTILS, avance, avanceConseillee, rotation, temps, vcConseillee, vitesseCoupe, vitesseMachine } from "./vitesse";

describe("masse", () => {
  it("tube carré 40 × 40 × 2 acier, 6 m (cas du cahier des charges)", () => {
    const s = section("tube-rect", { a: 40, b: 40, e: 2 });
    if (typeof s === "string") throw new Error(s);
    expect(s.aire).toBeCloseTo(304, 6);
    const kgm = kgPerM(s.aire, ACIER);
    expect(kgm).toBeCloseTo(2.386, 3);
    const p = pesee(kgm, s.perimetre, 6000, 3);
    expect(p.unitaire).toBeCloseTo(14.32, 2);
    expect(p.total).toBeCloseTo(42.955, 3);
    expect(p.surface).toBeCloseTo(0.96, 6);
  });

  it("tôle 2000 × 1000 × 3 acier → 47,1 kg", () => {
    const s = section("plat", { a: 1000, b: 0, e: 3 });
    if (typeof s === "string") throw new Error(s);
    expect(pesee(kgPerM(s.aire, ACIER), s.perimetre, 2000, 1).unitaire).toBeCloseTo(47.1, 6);
  });

  it("rond plein Ø 30 → 5,549 kg/m", () => {
    const s = section("rond", { a: 30, b: 0, e: 0 });
    if (typeof s === "string") throw new Error(s);
    expect(kgPerM(s.aire, ACIER)).toBeCloseTo(5.549, 3);
  });

  it("tube rond, carré plein et cornière", () => {
    const tube = section("tube-rond", { a: 60.3, b: 0, e: 2.9 });
    if (typeof tube === "string") throw new Error(tube);
    expect(kgPerM(tube.aire, ACIER)).toBeCloseTo(4.11, 2); // tube EN 10255 60,3 × 2,9 : 4,11 kg/m
    const carre = section("carre", { a: 20, b: 0, e: 0 });
    if (typeof carre === "string") throw new Error(carre);
    expect(kgPerM(carre.aire, ACIER)).toBeCloseTo(3.14, 2);
    const corniere = section("corniere", { a: 50, b: 50, e: 5 });
    if (typeof corniere === "string") throw new Error(corniere);
    expect(corniere.aire).toBe(475); // 3,73 kg/m en angles vifs (3,77 au catalogue, congés compris)
    expect(corniere.perimetre).toBe(200);
  });

  it("refuse les cotes impossibles", () => {
    expect(typeof section("tube-rond", { a: 20, b: 0, e: 10 })).toBe("string");
    expect(typeof section("tube-rect", { a: 40, b: 20, e: 0 })).toBe("string");
    expect(typeof section("corniere", { a: 30, b: 30, e: 30 })).toBe("string");
  });

  it("profilés : masse au mètre de la table et section équivalente", () => {
    expect(profileKgPerM("IPE", "200")).toBe(22.4);
    expect(profileKgPerM("HEA", "999")).toBeNaN();
    expect(aireFromKgPerM(22.4, ACIER)).toBeCloseTo(2853.5, 1);
    for (const f of FAMILLES) {
      const t = tailles(f);
      expect(t.length).toBeGreaterThan(5);
      // Plus haut, plus lourd.
      const masses = t.map((x) => profileKgPerM(f, x));
      expect(masses.every((m, i) => i === 0 || m > masses[i - 1]!)).toBe(true);
    }
  });
});

describe("filetage", () => {
  it("foret de taraudage (cas du cahier des charges)", () => {
    expect(foretTaraudage(8, 1.25)).toBe(6.8);
    expect(foretTaraudage(8, 1)).toBeCloseTo(7, 6);
    expect(foretTaraudage(10, 1.25)).toBeCloseTo(8.75, 6);
    expect(foretTaraudage(12, 1.75)).toBe(10.2);
  });

  it("trous de passage et lamages", () => {
    expect(filetage(10)!.passage).toEqual([10.5, 11, 12]);
    expect(filetage(8)!.lamage).toEqual([15, 8.6]);
  });

  it("foret pour taraud à refouler et diamètres du filet", () => {
    expect(foretRefouler(8, 1.25)).toBeCloseTo(7.4, 6);
    expect(foretRefouler(6, 1)).toBeCloseTo(5.5, 6);
    expect(noyauVis(10, 1.5)).toBeCloseTo(8.16, 2);
    expect(interieurTaraudage(10, 1.5)).toBeCloseTo(8.376, 3);
    expect(sectionResistante(10, 1.5)).toBeCloseTo(58, 0);
    expect(sectionResistante(20, 2.5)).toBeCloseTo(245, 0);
  });

  it("désignations", () => {
    expect(designation(8, 1.25)).toBe("M8");
    expect(designation(8, 1)).toBe("M8 × 1");
    expect(designation(1.6, 0.35)).toBe("M1,6");
  });

  it("table cohérente : foret ≈ d − P, passages croissants", () => {
    for (const f of FILETAGES) {
      expect(Math.abs(f.foret - (f.d - f.pas))).toBeLessThanOrEqual(0.06);
      expect(f.passage[0]! > f.d && f.passage[0]! < f.passage[1]! && f.passage[1]! < f.passage[2]!).toBe(true);
      expect(f.fins.every((p) => p < f.pas)).toBe(true);
      expect(f.lamage[0]! > f.passage[2]!).toBe(true);
    }
  });
});

describe("vitesses de coupe", () => {
  it("Vc 25 m/min, foret Ø 10 → 796 tr/min (cas du cahier des charges)", () => {
    expect(Math.round(rotation(25, 10))).toBe(796);
    expect(vitesseCoupe(796, 10)).toBeCloseTo(25, 1);
  });

  it("avance conseillée", () => {
    expect(avanceConseillee("percage", "hss", "acier-doux", 10)).toBe(0.1);
    expect(avanceConseillee("percage", "hss", "inox", 10)).toBe(0.06);
    expect(avanceConseillee("percage", "hss", "acier-doux", 1)).toBe(0.02);
    expect(avanceConseillee("fraisage", "carbure", "acier-doux", 12)).toBe(0.1);
    expect(avanceConseillee("tournage", "carbure", "alu", 40)).toBe(0.2);
  });

  it("avance et temps", () => {
    expect(avance(796, 0.1)).toBeCloseTo(79.6, 6);
    expect(avance(1000, 0.05, 4)).toBe(200);
    expect(temps(20, 80)).toBe(0.25);
  });

  it("vitesse à régler sur la machine", () => {
    expect(vitesseMachine("180 280 450 710 1120", 796)).toBe(710);
    expect(vitesseMachine("180;280;450;710;1120", 1100)).toBe(1120);
    expect(vitesseMachine("180 280", 50)).toBe(180);
    expect(vitesseMachine("", 796)).toBeNaN();
  });

  it("la table couvre toutes les combinaisons", () => {
    for (const o of OPERATIONS) for (const t of OUTILS) for (const m of MATIERES_USINAGE) expect(vcConseillee(o.id, t.id, m.id)).toBeGreaterThan(0);
    expect(vcConseillee("percage", "hss", "acier-doux")).toBe(25);
  });
});

describe("serrage", () => {
  it("M10 8.8, µ 0,12 → ≈ 49 N·m et ≈ 29,6 kN (cas du cahier des charges)", () => {
    const s = serrage(10, classe("8.8").rp, 0.12)!;
    expect(s.couple).toBeGreaterThan(48);
    expect(s.couple).toBeLessThan(51);
    expect(s.precharge / 1000).toBeCloseTo(29.6, 1);
  });

  it("retrouve les tables usuelles (8.8, µ 0,12) à 5 % près", () => {
    const tables: [number, number, number][] = [
      // d, couple N·m, précharge kN
      [6, 10.1, 10.2],
      [8, 25, 18.6],
      [12, 86, 43],
      [16, 210, 81],
      [20, 410, 127],
      [24, 710, 183],
    ];
    for (const [d, couple, precharge] of tables) {
      const s = serrage(d, 640, 0.12)!;
      expect(Math.abs(s.couple / couple - 1)).toBeLessThan(0.05);
      expect(Math.abs(s.precharge / 1000 / precharge - 1)).toBeLessThan(0.03);
    }
  });

  it("plus de frottement : moins de précharge, plus de couple", () => {
    const sec = serrage(12, 640, 0.16)!;
    const huile = serrage(12, 640, 0.1)!;
    expect(sec.precharge).toBeLessThan(huile.precharge);
    expect(sec.couple).toBeGreaterThan(huile.couple);
    const parts = sec.parts.tete + sec.parts.filets + sec.parts.pas;
    expect(parts).toBeCloseTo(1, 9);
  });

  it("toutes les classes, tous les diamètres", () => {
    expect(DIAMETRES[0]).toBe(3);
    expect(cle(10)).toBe(16);
    expect(cle(64)).toBeNaN();
    for (const c of CLASSES) for (const d of DIAMETRES) expect(serrage(d, c.rp, 0.12)!.couple).toBeGreaterThan(0);
    expect(serrage(64, 640, 0.12)).toBeUndefined();
  });
});
