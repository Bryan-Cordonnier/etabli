import { describe, expect, it } from "vitest";
import { ajouterWidget, BOARD_MAX, colonnesPour, deplacer, dimensions, largeurEffective, lireBoard, plusProcheTaille, redimensionner, retirerWidget } from "./board";
import type { BoardEntry } from "./types";

const b: BoardEntry[] = [
  { key: "a/x", size: "2x1" },
  { key: "b/y", size: "1x1" },
  { key: "@favoris", size: "4x2" },
];

describe("lireBoard", () => {
  it("rien d'enregistré (ou autre chose qu'une liste) donne null : l'accueil par défaut", () => {
    expect(lireBoard(undefined)).toBeNull();
    expect(lireBoard({})).toBeNull();
  });

  it("garde les entrées valables, sans doublon, et ignore le reste", () => {
    expect(lireBoard([{ key: "a/x", size: "2x2" }, { key: "a/x", size: "1x1" }, { key: "b/y", size: "9x9" }, { key: 4, size: "1x1" }, null, { key: "c/z", size: "4x1" }])).toEqual([
      { key: "a/x", size: "2x2" },
      { key: "c/z", size: "4x1" },
    ]);
  });

  it("une liste vide est un accueil vide choisi par l'utilisateur, pas le défaut", () => {
    expect(lireBoard([])).toEqual([]);
  });

  it("borne la longueur", () => {
    const beaucoup = Array.from({ length: BOARD_MAX + 10 }, (_, i) => ({ key: `p/w${i}`, size: "1x1" }));
    expect(lireBoard(beaucoup)).toHaveLength(BOARD_MAX);
  });
});

describe("modifications", () => {
  it("ajoute à la fin, une seule fois", () => {
    expect(ajouterWidget(b, "c/z", "2x2").at(-1)).toEqual({ key: "c/z", size: "2x2" });
    expect(ajouterWidget(b, "a/x", "4x1")).toEqual(b);
  });

  it("retire et redimensionne sans toucher aux autres", () => {
    expect(retirerWidget(b, "b/y").map((e) => e.key)).toEqual(["a/x", "@favoris"]);
    expect(redimensionner(b, "b/y", "2x2")[1]).toEqual({ key: "b/y", size: "2x2" });
    expect(redimensionner(b, "b/y", "2x2")[0]).toEqual(b[0]);
  });

  it("déplace d'un cran et s'arrête aux bords", () => {
    expect(deplacer(b, "b/y", -1).map((e) => e.key)).toEqual(["b/y", "a/x", "@favoris"]);
    expect(deplacer(b, "a/x", -1)).toEqual(b);
    expect(deplacer(b, "@favoris", 1)).toEqual(b);
    expect(deplacer(b, "inconnu", 1)).toEqual(b);
  });
});

describe("grille", () => {
  it("lit les dimensions et adapte la largeur aux colonnes", () => {
    expect(dimensions("3x2")).toEqual({ l: 3, h: 2 });
    expect([1000, 700, 400].map(colonnesPour)).toEqual([4, 2, 1]);
    expect(largeurEffective("4x2", 2)).toBe(2);
    expect(largeurEffective("1x1", 2)).toBe(1);
  });
});

describe("plusProcheTaille", () => {
  const acceptees = ["1x1", "2x1", "2x2"] as const;
  it("s'accroche à la taille acceptée la plus proche", () => {
    expect(plusProcheTaille(acceptees, 1, 1)).toBe("1x1");
    expect(plusProcheTaille(acceptees, 3, 1)).toBe("2x1");
    expect(plusProcheTaille(acceptees, 4, 4)).toBe("2x2");
    expect(plusProcheTaille(acceptees, 2, 2)).toBe("2x2");
  });
  it("à égalité, prend la plus petite", () => {
    expect(plusProcheTaille(["1x2", "2x1"], 2, 2)).toBe("1x2");
  });
});
