import { describe, expect, it } from "vitest";
import type { PieceShape } from "./coupe";
import { groupBars, planCuts } from "./debit";
import { planScene } from "./plan3d";
import { section } from "./profil";

const tube = section({ kind: "tube-carre", a: 40, b: 0, t: 2, e: 0 });
const trapeze45: PieceShape = { angleL: 45, angleR: 45, planeL: "grande", planeR: "grande", sens: "oppose" };

function scene(pieces: { mark: string; length: number; quantity: number; shape?: PieceShape }[]) {
  const plan = planCuts([{ length: 6000, quantity: null }], [], pieces, {
    kerf: 2,
    trim: 0,
    keepMin: 300,
    section: { width: 40, height: 40, round: false },
  });
  return { plan, ...planScene(groupBars(plan.bars), pieces.map((p) => p.shape ?? trapeze45), tube, () => "#2b63d9") };
}

describe("planScene", () => {
  it("une pièce par coupe, plus le reste, et les pièces ne se touchent pas", () => {
    const { plan, parts } = scene([{ mark: "A", length: 1450, quantity: 3, shape: trapeze45 }]);
    expect(parts).toHaveLength(plan.bars[0]!.cuts.length + 1);
    const pieces = parts.slice(0, -1);
    for (let i = 1; i < pieces.length; i++) {
      const previous = pieces[i - 1]!;
      const current = pieces[i]!;
      const gap = current.position[0] - current.model.length / 2 - (previous.position[0] + previous.model.length / 2);
      expect(gap).toBeGreaterThan(0);
    }
  });

  it("raccourcit les barres longues mais garde la forme des bouts", () => {
    const { parts } = scene([{ mark: "A", length: 1450, quantity: 1, shape: trapeze45 }]);
    const piece = parts[0]!;
    expect(piece.model.length).toBeLessThan(1450);
    // Recul de 40 mm conservé à chaque bout : la pièce affichée fait au moins 80 mm.
    expect(piece.model.length).toBeGreaterThan(80);
  });

  it("une ligne par groupe de barres identiques, avec son étiquette", () => {
    // 3 × 2 000 + 2 traits de 2 mm dépassent 6 000 : deux pièces par barre, quatre barres pareilles et une dernière.
    const { labels } = scene([{ mark: "A", length: 2000, quantity: 9, shape: { ...trapeze45, angleL: 0, angleR: 0 } }]);
    const bars = labels.map((l) => l.text.replace(/\s/g, " "));
    expect(bars).toEqual(["4 × barre 6 000", "barre 6 000"]);
  });
});
