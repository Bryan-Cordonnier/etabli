import { describe, expect, it } from "vitest";
import { planCuts } from "./debit";
import { debitFiche } from "./fiche-debit";
import { tint } from "./fiche";

const pieces = [
  { mark: "A", length: 2300, quantity: 2 },
  { mark: "B<script>", length: 594, quantity: 3 },
];

function fiche() {
  const plan = planCuts([{ length: 6000, quantity: null }], [], pieces, { kerf: 2, trim: 5, keepMin: 300 });
  return debitFiche({
    title: "",
    profile: "Tube carré 40 × 40 × 2",
    plan,
    pieces,
    colors: () => "#2b63d9",
    settings: { kerf: 2, trim: 5, keepMin: 300 },
    machine: "Scie à ruban",
  });
}

describe("debitFiche", () => {
  it("résume le plan et découpe barre par barre", () => {
    const f = fiche();
    expect(f.kind).toBe("Fiche de coupe");
    // 2 × 2 300 + 3 × 594 = 6 382 mm : deux barres de 6 m.
    expect(f.subtitle).toBe("Tube carré 40 × 40 × 2 — 2 barres, 5 pièces");
    expect(f.pages[0]).toContain("Ordre conseillé");
    expect(f.pages[0]).toContain("Scie à 0°");
    expect(f.ident).toEqual([["Poste", "Scie à ruban"]]);
    expect(f.pages).toHaveLength(2);
    expect(f.pages[1]).toContain("Barre 1");
    expect(f.pages[1]).toContain("Dresser le bout de barre");
  });

  it("échappe le texte saisi", () => {
    const html = fiche().pages.join("");
    expect(html).not.toContain("<script>");
    expect(html).toContain("B&lt;script&gt;");
  });
});

describe("debitFiche : tolérance, butée et chute réservée", () => {
  it("donne les restes en plage, la butée et l'étiquette de la chute réservée", () => {
    const list = [
      { mark: "A", length: 1450, quantity: 2 },
      { mark: "R", length: 600, quantity: 1, reserved: true, dest: "Garde-corps" },
    ];
    const plan = planCuts([{ length: 6000, quantity: null, tolMinus: 10, tolPlus: 20 }], [], list, { kerf: 2, trim: 5, keepMin: 300 });
    const f = debitFiche({
      title: "",
      profile: "Tube 40",
      plan,
      pieces: list,
      colors: () => "#2b63d9",
      settings: { kerf: 2, trim: 5, keepMin: 300 },
      machine: "Scie à ruban",
      stopMax: 1500,
      material: "Acier",
      kgPerM: 2.386,
      isPurchase: () => true,
    });
    const html = f.pages.join("");
    expect(html).toContain("Barres à acheter");
    // Reste en plage (tolérance de 30 mm) ; les milliers sont séparés par une espace fine.
    expect(html.replace(/ /g, " ")).toContain("2 479 à 2 509");
    expect(html).toContain("butée");
    expect(html).toContain("Garde-corps");
    expect(html).toContain("kg/m");
  });
});

describe("tint", () => {
  it("éclaircit vers le blanc", () => {
    expect(tint("#000000", 0.5)).toBe("#808080");
    expect(tint("#2b63d9", 0)).toBe("#2b63d9");
  });
});
