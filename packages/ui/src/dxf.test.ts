import { describe, expect, it } from "vitest";
import { toDxf } from "./dxf";
import { gabaritPages } from "./gabarit";

describe("toDxf", () => {
  const dxf = toDxf({
    polylines: [{ points: [[0, 0], [100, 0], [100, 50], [0, 50]], closed: true, layer: "CONTOUR" }],
    lines: [{ from: [25, 0], to: [25, 50], layer: "PLI" }],
    texts: [{ at: [5, 5], text: "Développé é", height: 3 }],
  });
  const lines = dxf.split("\r\n");

  it("sections dans l'ordre, fin de fichier", () => {
    const sections = lines.filter((_, i) => lines[i - 1] === "2" && lines[i - 2] === "SECTION");
    expect(sections).toEqual(["HEADER", "TABLES", "ENTITIES"]);
    expect(lines.at(-2)).toBe("EOF");
  });

  it("un calque par nature de trait, en millimètres", () => {
    expect(dxf).toContain("$INSUNITS\r\n70\r\n4");
    for (const layer of ["CONTOUR", "PLI", "TEXTE"]) expect(dxf).toContain(`LAYER\r\n2\r\n${layer}`);
    expect(dxf).not.toContain("LAYER\r\n2\r\nTRACE");
  });

  it("polyligne fermée avec ses 4 sommets, textes sans accents", () => {
    expect(lines.filter((l) => l === "VERTEX")).toHaveLength(4);
    expect(dxf).toContain("70\r\n1\r\n0\r\nVERTEX");
    expect(dxf).toContain("Developpe e");
  });

  it("nombres en point décimal, sans zéros inutiles", () => {
    const one = toDxf({ lines: [{ from: [1.5, 0.25], to: [2, 1 / 3], layer: "TRACE" }] });
    expect(one).toContain("10\r\n1.5\r\n20\r\n0.25");
    expect(one).toContain("21\r\n0.3333");
  });
});

describe("gabaritPages", () => {
  it("une feuille pour un petit développé, plusieurs pour un grand", () => {
    const small = gabaritPages([{ points: [[0, 0], [100, 0], [100, 100]], kind: "contour" }]);
    expect(small).toHaveLength(1);
    // 1 600 × 300 mm : 9 colonnes de 180 mm (marges comprises) sur 2 rangées de 250 mm.
    const big = gabaritPages([{ points: [[0, 0], [1600, 0], [1600, 300], [0, 300]], closed: true, kind: "contour" }]);
    expect(big).toHaveLength(18);
    expect(big[0]).toContain('width="180mm"');
    expect(big[0]).toContain("100 mm");
    expect(big[1]).toContain("A2");
  });
});
