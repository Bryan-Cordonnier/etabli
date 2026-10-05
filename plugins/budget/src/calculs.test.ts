// Calculs de Budget : échéances, courbe « combien j'aurai à telle date » et budget du mois. Chaque attendu a été calculé à la main.
import { describe, expect, it } from "vitest";
import { budgetDuMois, courbe, echeances } from "./calculs";
import type { Prevision } from "./types";

let n = 0;
function prev(jour: string, montantCents: number, extra: Partial<Prevision> = {}): Prevision {
  return { id: `p${++n}`, jour, montantCents, compteId: "c1", categorieId: null, libelle: "Ligne", source: { plugin: "@utilisateur", ref: "ui" }, statut: "attendue", ecritureId: null, ...extra };
}

describe("échéances", () => {
  it("une seule fois : seulement si le jour est dans la fenêtre", () => {
    expect(echeances("2026-10-12", "unique", null, "2026-10-01", "2026-10-31")).toEqual(["2026-10-12"]);
    expect(echeances("2026-10-12", "unique", null, "2026-11-01", "2026-11-30")).toEqual([]);
  });

  it("chaque semaine jusqu'au 26 octobre", () => {
    expect(echeances("2026-10-05", "semaine", "2026-10-26", "2026-10-10", "2026-12-31")).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
  });

  it("chaque mois depuis le 31 janvier : le 28 février, puis le 31 mars (toujours depuis l'origine)", () => {
    expect(echeances("2027-01-31", "mois", null, "2027-01-01", "2027-04-30")).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  it("chaque année depuis le 29 février 2028 : le 28 février les années non bissextiles", () => {
    expect(echeances("2028-02-29", "an", null, "2028-01-01", "2030-12-31")).toEqual(["2028-02-29", "2029-02-28", "2030-02-28"]);
  });

  it("une fenêtre loin de l'origine ne parcourt pas toute l'histoire et ne saute aucune échéance", () => {
    expect(echeances("2020-01-15", "mois", null, "2026-10-01", "2026-12-31")).toEqual(["2026-10-15", "2026-11-15", "2026-12-15"]);
    // Le 1er janvier 2020 est un mercredi : 2 471 jours (353 semaines) plus tard, le 7 octobre 2026, puis le 14.
    expect(echeances("2020-01-01", "semaine", null, "2026-10-05", "2026-10-20")).toEqual(["2026-10-07", "2026-10-14"]);
  });
});

describe("courbe du mois", () => {
  const aujourdhui = "2026-10-05";

  it("solde 1 000 € : loyer de 700 € le 7, paie de 429,43 € le 10 → 300 € puis 729,43 €", () => {
    const c = courbe({ soldeCents: 100_000, aujourdhui, jours: 8, previsions: [prev("2026-10-07", -70_000), prev("2026-10-10", 42_943)], seuilCents: 0 });
    expect(c.serie.map((p) => p.soldeCents)).toEqual([100_000, 100_000, 30_000, 30_000, 30_000, 72_943, 72_943, 72_943]);
    expect(c.serie[0]?.jour).toBe("2026-10-05");
    expect(c.serie[7]?.jour).toBe("2026-10-12");
    expect(c.plancher).toEqual({ jour: "2026-10-07", soldeCents: 30_000 });
    expect(c.sousSeuil).toEqual([]);
  });

  it("le seuil à 500 € : les jours en dessous sont signalés avec l'écart", () => {
    const c = courbe({ soldeCents: 100_000, aujourdhui, jours: 8, previsions: [prev("2026-10-07", -70_000), prev("2026-10-10", 42_943)], seuilCents: 50_000 });
    expect(c.sousSeuil.map((x) => x.jour)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(c.sousSeuil[0]?.ecartCents).toBe(20_000);
  });

  it("une prévision d'AUJOURD'HUI compte ; celle d'hier est en retard et ne compte pas", () => {
    const hier = prev("2026-10-04", -5_000);
    const c = courbe({ soldeCents: 10_000, aujourdhui, jours: 2, previsions: [prev("2026-10-05", -1_000), hier], seuilCents: 0 });
    expect(c.serie[0]?.soldeCents).toBe(9_000);
    expect(c.enRetard.map((p) => p.id)).toEqual([hier.id]);
  });

  it("seules les prévisions attendues comptent (réalisées et abandonnées sont ignorées)", () => {
    const c = courbe({ soldeCents: 10_000, aujourdhui, jours: 2, previsions: [prev("2026-10-06", -1_000, { statut: "realisee" }), prev("2026-10-06", -2_000, { statut: "abandonnee" }), prev("2026-10-06", -300)], seuilCents: 0 });
    expect(c.serie[1]?.soldeCents).toBe(9_700);
  });

  it("une prévision au-delà de l'horizon n'apparaît pas ; une durée absurde est refusée", () => {
    const c = courbe({ soldeCents: 0, aujourdhui, jours: 3, previsions: [prev("2026-10-09", 99_999)], seuilCents: 0 });
    expect(c.serie.map((p) => p.soldeCents)).toEqual([0, 0, 0]);
    expect(() => courbe({ soldeCents: 0, aujourdhui, jours: 0, previsions: [], seuilCents: 0 })).toThrow(RangeError);
    expect(() => courbe({ soldeCents: 0, aujourdhui, jours: 5000, previsions: [], seuilCents: 0 })).toThrow(RangeError);
  });
});

describe("budget du mois", () => {
  const aujourdhui = "2026-10-15";

  it("plafond 400 €, 250 € déjà dépensés, 90 € encore prévus → il reste 60 €", () => {
    const [l] = budgetDuMois({
      enveloppes: [{ categorieId: "k1", plafondCents: 40_000 }],
      reelsSorties: [{ categorieId: "k1", cents: -25_000 }, { categorieId: "k2", cents: -99_999 }],
      previsions: [prev("2026-10-20", -9_000, { categorieId: "k1" })],
      aujourdhui,
    });
    expect(l).toMatchObject({ reelCents: 25_000, prevuCents: 9_000, resteCents: 6_000, depasse: false });
  });

  it("dépassement attendu : 380 € dépensés + 50 € prévus sur 400 € → dépasse de 30 €", () => {
    const [l] = budgetDuMois({ enveloppes: [{ categorieId: "k1", plafondCents: 40_000 }], reelsSorties: [{ categorieId: "k1", cents: -38_000 }], previsions: [prev("2026-10-31", -5_000, { categorieId: "k1" })], aujourdhui });
    expect(l).toMatchObject({ resteCents: -3_000, depasse: true });
  });

  it("le prévu ne compte que ce qui reste à venir ce mois-ci (pas hier, pas le mois prochain, pas une entrée d'argent)", () => {
    const [l] = budgetDuMois({
      enveloppes: [{ categorieId: "k1", plafondCents: 10_000 }],
      reelsSorties: [],
      previsions: [prev("2026-10-14", -1_000, { categorieId: "k1" }), prev("2026-11-02", -2_000, { categorieId: "k1" }), prev("2026-10-16", 3_000, { categorieId: "k1" }), prev("2026-10-15", -400, { categorieId: "k1" })],
      aujourdhui,
    });
    expect(l?.prevuCents).toBe(400);
  });
});
