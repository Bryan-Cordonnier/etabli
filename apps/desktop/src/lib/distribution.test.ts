import { describe, expect, it } from "vitest";
import { DISTRIBUTION_DEFAUT, lireDistribution } from "./distribution";
import { THEME_TOKENS } from "./themeTokens";

const couleurs = Object.fromEntries(THEME_TOKENS.map((t) => [t, "#112233"]));
const theme = (id: string, base = "light") => ({ id, name: `Thème ${id}`, author: "Moi", base, colors: couleurs });

describe("lireDistribution", () => {
  it("rien (ou n'importe quoi d'autre qu'un objet) donne les valeurs d'Établi", () => {
    for (const brut of [undefined, null, "x", 3, []]) expect(lireDistribution(brut)).toEqual(DISTRIBUTION_DEFAUT);
  });

  it("lit le nom, la page Plugins et le logo", () => {
    const d = lireDistribution({ name: " Quotidien ", pluginsPage: false, logo: '<path d="M4 18h16" />' });
    expect(d).toMatchObject({ name: "Quotidien", pluginsPage: false, logo: '<path d="M4 18h16" />' });
  });

  it("refuse un logo qui contient autre chose que des formes simples", () => {
    for (const logo of ["<script>alert(1)</script>", '<path d="M0 0" onload="x()" /><script/>', '<image href="http://x" />', '<path d="M0 0" /> texte', "", 12]) {
      expect(lireDistribution({ logo }).logo, String(logo)).toBeNull();
    }
  });

  it("garde des thèmes complets et sans doublon, sinon retombe sur ceux d'Établi", () => {
    expect(lireDistribution({ themes: [theme("quotidien-clair"), theme("quotidien-sombre", "dark")] }).themes).toHaveLength(2);
    expect(lireDistribution({ themes: [theme("a"), theme("a")] }).themes).toBeNull();
    expect(lireDistribution({ themes: [{ ...theme("a"), base: "gris" }] }).themes).toBeNull();
    expect(lireDistribution({ themes: [{ ...theme("a"), colors: { ...couleurs, accent: "rouge" } }] }).themes).toBeNull();
    expect(lireDistribution({ themes: [{ ...theme("a"), colors: { page: "#fff" } }] }).themes).toBeNull();
    expect(lireDistribution({ themes: [] }).themes).toBeNull();
  });

  it("lit des icônes propres à la distribution et refuse les autres", () => {
    const d = lireDistribution({ icons: { calendrier: '<rect x="3" y="5" width="18" height="16" rx="4"/>', "Mauvais Nom": '<path d="M0 0"/>', piege: '<script>x()</script>' } });
    expect(Object.keys(d.icons)).toEqual(["calendrier"]);
    expect(lireDistribution({ icons: "x" }).icons).toEqual({});
  });

  it("la page Plugins reste visible tant qu'on ne la retire pas explicitement", () => {
    expect(lireDistribution({ pluginsPage: "non" }).pluginsPage).toBe(true);
    expect(lireDistribution({}).pluginsPage).toBe(true);
  });
});
