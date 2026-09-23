import { describe, expect, it } from "vitest";
import { groupSheets, nest, type NestResult, type RectPiece } from "./nesting";

const sheet = { length: 2000, width: 1000, quantity: null };
const tight = { spacing: 0, margin: 0, guillotine: false };

/** Aucune pièce ne déborde de la tôle ni ne chevauche une autre (espacement compris). */
function assertValid(result: NestResult, spacing: number, margin: number): void {
  for (const s of result.sheets) {
    for (const p of s.placements) {
      expect(p.x).toBeGreaterThanOrEqual(margin - 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(margin - 1e-6);
      expect(p.x + p.length).toBeLessThanOrEqual(s.length - margin + 1e-6);
      expect(p.y + p.width).toBeLessThanOrEqual(s.width - margin + 1e-6);
    }
    for (let i = 0; i < s.placements.length; i++) {
      for (let j = i + 1; j < s.placements.length; j++) {
        const a = s.placements[i]!;
        const b = s.placements[j]!;
        const apart =
          a.x + a.length + spacing <= b.x + 1e-6 ||
          b.x + b.length + spacing <= a.x + 1e-6 ||
          a.y + a.width + spacing <= b.y + 1e-6 ||
          b.y + b.width + spacing <= a.y + 1e-6;
        expect(apart).toBe(true);
      }
    }
  }
}

describe("nest", () => {
  it("remplit une tôle exactement", () => {
    const r = nest([sheet], [{ mark: "A", length: 1000, width: 500, quantity: 4, rotate: true }], tight);
    expect(r.sheets).toHaveLength(1);
    expect(r.piecesArea).toBe(r.sheetsArea);
    assertValid(r, 0, 0);
  });

  it("respecte l'interdiction de tourner (sens de laminage)", () => {
    const piece: RectPiece = { mark: "A", length: 900, width: 1900, quantity: 1, rotate: false };
    expect(nest([sheet], [piece], tight).unplaced).toHaveLength(1);
    const rotated = nest([sheet], [{ ...piece, rotate: true }], tight);
    expect(rotated.unplaced).toHaveLength(0);
    expect(rotated.sheets[0]!.placements[0]!.rotated).toBe(true);
  });

  it("tient compte de l'espacement et de la marge", () => {
    // 2 × 990 + 10 d'espace = 1990 ≤ 2000 − 2 × 5 : deux pièces sur la longueur.
    const r = nest([sheet], [{ mark: "A", length: 990, width: 990, quantity: 2, rotate: false }], {
      spacing: 10,
      margin: 5,
      guillotine: false,
    });
    expect(r.sheets).toHaveLength(1);
    assertValid(r, 10, 5);
    const r2 = nest([sheet], [{ mark: "A", length: 991, width: 990, quantity: 2, rotate: false }], {
      spacing: 10,
      margin: 5,
      guillotine: false,
    });
    expect(r2.sheets).toHaveLength(2);
  });

  it("choisit le format de tôle le mieux rempli", () => {
    const r = nest(
      [
        { length: 3000, width: 1500, quantity: null },
        { length: 2000, width: 1000, quantity: null },
      ],
      [{ mark: "A", length: 1000, width: 1000, quantity: 2, rotate: true }],
      tight,
    );
    expect(r.sheets).toHaveLength(1);
    expect(r.sheets[0]!.length).toBe(2000);
  });

  it("respecte le nombre de tôles disponibles", () => {
    const r = nest([{ ...sheet, quantity: 1 }], [{ mark: "A", length: 1500, width: 800, quantity: 2, rotate: true }], tight);
    expect(r.sheets).toHaveLength(1);
    expect(r.unplaced).toHaveLength(1);
  });

  it("produit des dispositions valides, en guillotine comme en placement libre", () => {
    const pieces: RectPiece[] = [
      { mark: "A", length: 620, width: 410, quantity: 7, rotate: true },
      { mark: "B", length: 300, width: 250, quantity: 12, rotate: true },
      { mark: "C", length: 1200, width: 180, quantity: 5, rotate: false },
      { mark: "D", length: 150, width: 150, quantity: 20, rotate: true },
    ];
    for (const guillotine of [false, true]) {
      const r = nest([{ length: 2500, width: 1250, quantity: null }], pieces, { spacing: 5, margin: 10, guillotine });
      expect(r.unplaced).toHaveLength(0);
      assertValid(r, 5, 10);
      expect(r.piecesArea / r.sheetsArea).toBeGreaterThan(0.6);
    }
  });

  it("reste rapide sur 300 pièces", () => {
    const pieces: RectPiece[] = Array.from({ length: 15 }, (_, i) => ({
      mark: `P${i}`,
      length: 150 + i * 37,
      width: 100 + ((i * 53) % 400),
      quantity: 20,
      rotate: true,
    }));
    const start = performance.now();
    const r = nest([{ length: 3000, width: 1500, quantity: null }], pieces, { spacing: 5, margin: 10, guillotine: false });
    expect(performance.now() - start).toBeLessThan(3000);
    expect(r.unplaced).toHaveLength(0);
    assertValid(r, 5, 10);
  });
});

describe("groupSheets", () => {
  it("regroupe les tôles identiques", () => {
    const r = nest([sheet], [{ mark: "A", length: 2000, width: 1000, quantity: 3, rotate: false }], tight);
    expect(groupSheets(r.sheets)).toHaveLength(1);
    expect(groupSheets(r.sheets)[0]!.count).toBe(3);
  });
});
