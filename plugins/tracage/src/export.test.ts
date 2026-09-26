import { describe, expect, it } from "vitest";
import { virole } from "./developpes";
import { patternDxf, tableText, tracageFiche } from "./export";

const v = virole({ diameter: 500, kind: "int", thickness: 5, height: 300, bevel: 20, sheetLength: 0, divisions: 12 });
if (typeof v === "string") throw new Error(v);

describe("sorties du traçage", () => {
  it("DXF : contour sur le calque CONTOUR, génératrices sur TRACE, repères en texte", () => {
    const dxf = patternDxf(v.pattern);
    expect(dxf).toContain("POLYLINE\r\n8\r\nCONTOUR");
    expect(dxf).toContain("LINE\r\n8\r\nTRACE");
    expect(dxf).toContain("TEXT\r\n8\r\nTEXTE");
  });

  it("fiche : résultats et tableau, puis le gabarit à l'échelle 1 en plusieurs feuilles", () => {
    const fiche = tracageFiche({
      kind: "Virole",
      subtitle: "essai",
      results: [{ label: "Développé", value: "1 586,5 mm" }],
      rows: v.table,
      headers: ["N°", "Angle", "X", "Y"],
      pattern: v.pattern,
    });
    // Flan de 1 586 × ~400 mm : 9 colonnes × 2 rangées de feuilles A4.
    expect(fiche.pages.length).toBeGreaterThan(2);
    expect(fiche.pages[0]).toContain("Tableau de traçage");
    expect(fiche.pages[1]).toContain('width="180mm"');
  });

  it("tableau copiable : une ligne par génératrice, tabulations pour Excel", () => {
    const text = tableText(v.table, ["N°", "Angle", "X", "Y"]);
    expect(text.split("\n")).toHaveLength(v.table.length + 1);
    expect(text.split("\n")[1]!.split("\t")).toHaveLength(4);
  });
});
