import { describe, expect, it } from "vitest";
import { planPlates } from "./cisaille";
import { calepinageFiche } from "./fiche-calepinage";

const pieces = [
  { mark: "A", name: "Platine <3>", length: 600, width: 400, quantity: 6, grain: false },
  { mark: "E", name: "Capot plié", length: 700, width: 200, quantity: 2, grain: true },
];
const settings = { bladeLength: 2050, gaugeMax: 750, trim: 5, keep: [100, 200] as [number, number] };

function fiche() {
  const plan = planPlates(
    [{ length: 2500, width: 1250, quantity: null, tolMinus: 0, tolPlus: 5 }],
    [{ length: 800, width: 600 }],
    pieces,
    settings,
  );
  return calepinageFiche({
    title: "",
    material: "Acier",
    thickness: 2,
    density: 7.85,
    plan,
    pieces,
    colors: () => "#2b63d9",
    machine: "Cisaille 2050",
    settings,
  });
}

describe("calepinageFiche", () => {
  it("un récapitulatif puis une page par tôle", () => {
    const f = fiche();
    expect(f.kind).toBe("Fiche de calepinage");
    expect(f.ident).toEqual([["Poste", "Cisaille 2050"]]);
    // Récapitulatif + la chute du stock + une tôle neuve.
    expect(f.pages).toHaveLength(3);
    expect(f.pages[1]).toContain("Chute 1");
    expect(f.pages[2]).toContain("Tôle 2");
    expect(f.subtitle).toContain("ép. 2 mm");
  });

  it("indique les réglages de butée et le dressage", () => {
    const html = fiche().pages.join("");
    expect(html).toContain("Butée réglée");
    expect(html).toContain("Dressage");
    expect(html).toContain("→ imposé");
  });

  it("échappe le texte saisi", () => {
    const html = fiche().pages.join("");
    expect(html).not.toContain("<3>");
    expect(html).toContain("Platine &lt;3&gt;");
  });
});
