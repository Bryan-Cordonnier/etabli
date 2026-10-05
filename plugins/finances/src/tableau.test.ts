import { describe, expect, it } from "vitest";
import { executer } from "./service";
import { argumentsDeSaisie, jourCourt, pourcentageUtilise, vueTableau } from "./tableau";
import { UTILISATEUR, type Registre } from "./types";

const utc = (a: number, m: number, j: number, h = 0) => Date.UTC(a, m - 1, j, h);
const NOW = utc(2026, 10, 5, 8);

function monRegistre(): { reg: Registre; compte: string; courses: string; loisirs: string } {
  let reg: unknown = null;
  const faire = (fn: string, args: unknown): any => {
    const r = executer(reg, fn, args, UTILISATEUR, NOW, true);
    if (r.registre) reg = JSON.parse(JSON.stringify(r.registre));
    return r.valeur;
  };
  const compte = faire("comptes.creer", { nom: "Courant", type: "courant", soldeInitialCents: 100000, ouvertLe: "2026-09-01", cle: "c" }).id;
  faire("comptes.creer", { nom: "Livret", type: "epargne", soldeInitialCents: 50000, ouvertLe: "2026-09-01", cle: "l" });
  const courses = faire("categories.creer", { nom: "Courses", sens: "sortie", cle: "k1" }).id;
  const loisirs = faire("categories.creer", { nom: "Loisirs", sens: "sortie", cle: "k2" }).id;
  const e = (m: number, q: number, cle: string, cat?: string) =>
    faire("ecritures.ajouter", { compteId: compte, montantCents: m, quand: q, libelle: `L ${cle}`, cle, ...(cat ? { categorieId: cat } : {}) });
  e(-9000, utc(2026, 9, 20, 10), "sept", courses); // le mois dernier : pas dans les dépenses du mois
  e(-4000, utc(2026, 10, 2, 10), "a", courses);
  e(-2500, utc(2026, 10, 3, 10), "b", loisirs);
  e(-1500, utc(2026, 10, 3, 11), "c", courses);
  e(-700, utc(2026, 10, 4, 11), "d");
  const erreur = e(-999, utc(2026, 10, 4, 12), "erreur", loisirs).id;
  faire("ecritures.annuler", { id: erreur, motif: "double", cle: "an" });
  return { reg: reg as Registre, compte, courses, loisirs };
}

describe("vue du tableau de bord", () => {
  const { reg, courses, loisirs } = monRegistre();
  const v = vueTableau(reg, NOW, 30);
  it("soldes par compte et total aujourd'hui (5 octobre)", () => {
    // Courant : 1000,00 − 90,00 − 40,00 − 25,00 − 15,00 − 7,00 − 9,99 + 9,99 = 823,00 ; Livret : 500,00
    expect(v.aujourdhui).toBe("2026-10-05");
    expect(v.comptes.map((c) => [c.compte.nom, c.soldeCents])).toEqual([["Courant", 82300], ["Livret", 50000]]);
    expect(v.soldeTotal).toBe(132300);
  });
  it("série de 30 jours finissant aujourd'hui, dont le dernier point est le solde total", () => {
    expect(v.serie).toHaveLength(30);
    expect(v.serie[0]!.jour).toBe("2026-09-06");
    expect(v.serie.at(-1)).toEqual({ jour: "2026-10-05", soldeCents: v.soldeTotal });
  });
  it("dépenses du mois par catégorie : sans le mois dernier, sans l'écriture annulée", () => {
    expect(v.depensesMois).toEqual([
      { categorieId: courses, nom: "Courses", cents: 5500 },
      { categorieId: loisirs, nom: "Loisirs", cents: 2500 },
      { categorieId: null, nom: "Sans catégorie", cents: 700 },
    ]);
    expect(v.totalDepensesMois).toBe(8700);
  });
  it("dernières écritures : les plus récentes d'abord, l'annulée et l'annulation repérées", () => {
    expect(v.dernieres).toHaveLength(7);
    const [annulation, annulee] = v.dernieres;
    expect(annulation!.ecriture.annule).not.toBeNull();
    expect(annulation!.annulable).toBe(false);
    expect(annulee!.annulee).toBe(true);
    expect(annulee!.annulable).toBe(false);
    expect(v.dernieres[2]!.annulable).toBe(true);
    expect(vueTableau(reg, NOW, 30, 3).dernieres).toHaveLength(3);
  });
  it("registre vide : rien ne plante", () => {
    const vide = vueTableau(lireVide(), NOW);
    expect(vide).toMatchObject({ soldeTotal: 0, comptes: [], serie: [], depensesMois: [], dernieres: [], presquePlein: false });
  });
  it("jourCourt et pourcentage utilisé", () => {
    expect(jourCourt("2026-10-05")).toBe("5 oct.");
    expect(jourCourt("2026-01-31")).toBe("31 janv.");
    expect(pourcentageUtilise(1_750_000)).toBe(50);
    expect(pourcentageUtilise(99_000_000)).toBe(100);
  });
});

function lireVide(): Registre {
  return executer(null, "comptes.liste", null, "x", NOW).registre ?? { schema: 1, fuseau: "Europe/Paris", suivant: 1, comptes: [], categories: [], ecritures: [] };
}

describe("formulaire de saisie", () => {
  const { reg, compte } = monRegistre();
  const base = { compteId: compte, sens: "sortie" as const, montant: "12,50", jour: "2026-10-05", categorieId: "", libelle: "Café" };
  it("dépense du jour : montant négatif, instant exact", () => {
    const r = argumentsDeSaisie(base, reg, NOW, "ui-1");
    expect(r).toEqual({ args: { compteId: compte, montantCents: -1250, quand: NOW, libelle: "Café", cle: "ui-1" } });
  });
  it("recette un autre jour : positive, midi à Paris (10 h UTC en été)", () => {
    const r = argumentsDeSaisie({ ...base, sens: "entree", jour: "2026-10-02", categorieId: "k1" }, reg, NOW, "ui-2");
    expect(r).toEqual({ args: { compteId: compte, montantCents: 1250, quand: utc(2026, 10, 2, 10), libelle: "Café", categorieId: "k1", cle: "ui-2" } });
  });
  it("phrases d'erreur claires", () => {
    const erreur = (m: object) => (argumentsDeSaisie({ ...base, ...m }, reg, NOW, "k") as { erreur: string }).erreur;
    expect(erreur({ compteId: "" })).toContain("compte");
    expect(erreur({ montant: "douze" })).toContain("illisible");
    expect(erreur({ montant: "12,505" })).toContain("illisible");
    expect(erreur({ montant: "0" })).toContain("supérieur à zéro");
    expect(erreur({ montant: "-5" })).toContain("supérieur à zéro");
    expect(erreur({ libelle: "  " })).toContain("libellé");
  });
  it("les arguments produits sont acceptés par le service", () => {
    const r = argumentsDeSaisie(base, reg, NOW, "ui-3") as { args: unknown };
    expect(executer(reg, "ecritures.ajouter", r.args, UTILISATEUR, NOW).registre).not.toBeNull();
  });
});
