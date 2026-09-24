import { describe, expect, it } from "vitest";
import { ends, type PieceShape } from "./coupe";
import { buildGeometry } from "./piece3d";
import { section } from "./profil";

const trapeze45: PieceShape = { angleL: 45, angleR: 45, planeL: "grande", planeR: "grande", sens: "oppose" };

function model(kind: "tube-carre" | "tube-rond" | "ipe", shape: PieceShape, length = 500) {
  const s = section({ kind, a: kind === "ipe" ? 100 : 40, b: kind === "ipe" ? 55 : 0, t: 4, e: 6 });
  return { section: s, length, ends: ends(shape, s), color: "#2b63d9", edgeColor: "#000" };
}

describe("buildGeometry", () => {
  it("trapèze : pointe à pointe sur un côté, raccourci de 2 × 40 mm de l'autre", () => {
    const geometry = buildGeometry(model("tube-carre", trapeze45));
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(500);
    const positions = geometry.getAttribute("position");
    // Côté y = −20 (z three.js = +20) : les deux bouts reculent de 40 mm.
    const xs: number[] = [];
    for (let i = 0; i < positions.count; i++) if (Math.abs(positions.getZ(i) - 20) < 1e-6) xs.push(positions.getX(i));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(500 - 80);
  });

  it("produit des triangles pour chaque profilé (tube, rond, IPE)", () => {
    for (const kind of ["tube-carre", "tube-rond", "ipe"] as const) {
      const geometry = buildGeometry(model(kind, trapeze45));
      const count = geometry.getAttribute("position").count;
      expect(count % 3).toBe(0);
      expect(count).toBeGreaterThan(24);
      const normals = geometry.getAttribute("normal");
      for (let i = 0; i < normals.count; i++) expect(Number.isFinite(normals.getX(i))).toBe(true);
    }
  });
});
