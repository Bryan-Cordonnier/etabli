import { describe, expect, it } from "vitest";
import { categorieDe, deplacerCategorie, grouper, lireChoix, lireNoms, SANS_CATEGORIE } from "./categories";

const p = (key: string, category = "") => ({ key, category });
const pages = [p("a/x", "Argent"), p("b/y", "Temps"), p("c/z", "Argent"), p("d/w")];

describe("grouper", () => {
  it("range par catégorie, dans l'ordre d'apparition, sans catégorie à « Autres »", () => {
    const g = grouper(pages, {}, []);
    expect(g.map((x) => x.name)).toEqual(["Argent", "Temps", SANS_CATEGORIE]);
    expect(g[0]?.items.map((i) => i.key)).toEqual(["a/x", "c/z"]);
  });

  it("suit l'ordre choisi, les catégories inconnues de l'ordre venant ensuite", () => {
    expect(grouper(pages, {}, ["Temps", "Argent"]).map((x) => x.name)).toEqual(["Temps", "Argent", SANS_CATEGORIE]);
    expect(grouper(pages, {}, ["Temps"]).map((x) => x.name)).toEqual(["Temps", "Argent", SANS_CATEGORIE]);
  });

  it("le choix de l'utilisateur l'emporte sur celui du plugin", () => {
    expect(categorieDe(p("a/x", "Argent"), { "a/x": "Perso" })).toBe("Perso");
    const g = grouper(pages, { "a/x": "Temps" }, []);
    expect(g.find((x) => x.name === "Temps")?.items.map((i) => i.key)).toEqual(["a/x", "b/y"]);
  });
});

describe("déplacer et lire", () => {
  it("déplace une catégorie d'un cran et s'arrête aux bords", () => {
    expect(deplacerCategorie(["A", "B", "C"], "B", -1)).toEqual(["B", "A", "C"]);
    expect(deplacerCategorie(["A", "B", "C"], "A", -1)).toEqual(["A", "B", "C"]);
    expect(deplacerCategorie(["A", "B"], "Z", 1)).toEqual(["A", "B"]);
  });

  it("ignore ce qui est illisible", () => {
    expect(lireChoix({ "a/x": "Argent", "b/y": 4, c: "x".repeat(41) })).toEqual({ "a/x": "Argent" });
    expect(lireChoix([1])).toEqual({});
    expect(lireNoms(["A", 3, "B"])).toEqual(["A", "B"]);
    expect(lireNoms(null)).toEqual([]);
  });
});
