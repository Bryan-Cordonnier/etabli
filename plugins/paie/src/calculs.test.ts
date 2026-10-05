// Vecteurs d'or de la paie. Les chiffres viennent de paie.rs (gestion-budget-perso) ou ont été recalculés à la main ; les taux sont ceux des
// réglages par défaut (hypothèses à confirmer sur un bulletin, voir types.ts).
import { describe, expect, it } from "vitest";
import { datePaiement, detailMission, detailReserve, joursDeMission, minutesDuJour, paiesContrat } from "./calculs";
import { REGLAGES_DEFAUT, type Contrat, type Mission, type PeriodeReserve } from "./types";

const R = REGLAGES_DEFAUT;
const mission = (extra: Partial<Mission> = {}): Mission => ({
  id: "m1",
  libelle: "Mission",
  debut: "2026-10-05", // lundi
  fin: "2026-10-09",
  joursSemaine: [1, 2, 3, 4, 5],
  exclusions: [],
  debutMin: 8 * 60,
  finMin: 15 * 60,
  pauseMin: 0,
  tauxHoraireCents: 1300,
  statut: "prevu",
  supplementaires: [],
  ...extra,
});

describe("intérim", () => {
  it("vecteur d'or : 5 jours de 7 h à 13 € → brut 455 €, IFM 45,50 €, CP 50,05 €, net 429,43 €", () => {
    const d = detailMission(mission(), R);
    expect(d.semaines).toHaveLength(1);
    expect(d.semaines[0]).toMatchObject({ planifieMin: 2100, normalesMin: 2100, sup1Min: 0, sup2Min: 0 });
    expect(d.brutBaseCents).toBe(45_500);
    expect(d.ifmCents).toBe(4_550);
    expect(d.cpCents).toBe(5_005);
    expect(d.brutTotalCents).toBe(55_055);
    expect(d.netCents).toBe(42_943);
  });

  it("5 jours de 9 h : 35 h normales + 8 h à +25 % + 2 h à +50 % → brut 624 €, net 588,93 €", () => {
    const d = detailMission(mission({ finMin: 17 * 60 }), R);
    expect(d.semaines[0]).toMatchObject({ planifieMin: 2700, normalesMin: 2100, sup1Min: 480, sup2Min: 120 });
    // 455 € + 8 h × 16,25 € (130 €) + 2 h × 19,50 € (39 €) = 624 €
    expect(d.brutBaseCents).toBe(62_400);
    expect(d.netCents).toBe(58_893);
  });

  it("une mission à cheval sur deux semaines : les heures supplémentaires se comptent par semaine lundi → dimanche", () => {
    const d = detailMission(mission({ debut: "2026-10-07", fin: "2026-10-13", joursSemaine: [1, 2, 3, 4, 5, 6, 7], finMin: 16 * 60 }), R);
    expect(d.semaines.map((s) => [s.lundi, s.planifieMin, s.sup1Min])).toEqual([
      ["2026-10-05", 2400, 300], // mercredi → dimanche : 5 × 8 h = 40 h
      ["2026-10-12", 960, 0], // lundi, mardi : 16 h
    ]);
  });

  it("une nuit 22 h → 6 h avec 30 min de pause dure 7 h 30 et compte pour le jour où elle commence", () => {
    const nuit = mission({ debutMin: 22 * 60, finMin: 6 * 60, pauseMin: 30 });
    expect(minutesDuJour(nuit)).toBe(450);
  });

  it("les exclusions retirent des jours ; les minutes supplémentaires manuelles sont payées en heures supplémentaires", () => {
    expect(joursDeMission(mission({ exclusions: ["2026-10-07"] }))).toEqual(["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"]);
    const d = detailMission(mission({ supplementaires: [{ jour: "2026-10-08", minutes: 60 }] }), R);
    // 35 h normales + 1 h à 16,25 € : 455 + 16,25 = 471,25 €
    expect(d.semaines[0]).toMatchObject({ normalesMin: 2100, sup1Min: 60 });
    expect(d.brutBaseCents).toBe(47_125);
  });

  it("une mission sans journée travaillée ne rapporte rien et n'a pas de date de paiement", () => {
    const d = detailMission(mission({ joursSemaine: [7] }), R);
    expect(d.netCents).toBe(0);
    expect(d.datePaiement).toBeNull();
  });

  it("la paie tombe 7 jours après le dernier jour, reportée au jour ouvré suivant", () => {
    expect(detailMission(mission(), R).datePaiement).toBe("2026-10-16"); // vendredi 9 + 7 = vendredi 16
    expect(datePaiement("2026-10-10", 7)).toBe("2026-10-19"); // samedi + 7 = samedi 17 → lundi 19
    expect(datePaiement("2026-12-18", 7)).toBe("2026-12-28"); // vendredi 25 décembre, férié → lundi 28
  });

  it("les taux sont des réglages : 20 % de cotisations au lieu de 22 % change le net", () => {
    expect(detailMission(mission(), { ...R, cotisationsBp: 2000 }).netCents).toBe(44_044); // 550,55 × 0,80 = 440,44
  });
});

describe("réserve", () => {
  const periode: PeriodeReserve = { id: "r1", libelle: "Réserve", jours: ["2026-10-07", "2026-10-08", "2026-10-09"], horsBase: 2 };

  it("3 jours à 100 € moins 22 % + 2 jours hors base à 38 € → 310 €", () => {
    const d = detailReserve(periode, { ...R, tarifReserveCents: 10_000 });
    expect(d).toMatchObject({ brutCents: 30_000, netJoursCents: 23_400, indemniteCents: 7_600, netCents: 31_000, dernierJour: "2026-10-09", datePaiement: "2026-10-16" });
  });

  it("sans tarif réglé, seuls les jours hors base rapportent", () => {
    expect(detailReserve(periode, R).netCents).toBe(7_600);
  });
});

describe("CDI et CDD", () => {
  const cdi: Contrat = { id: "c1", libelle: "CDI", type: "cdi", brutMensuelCents: 300_000, debut: "2026-10-15", fin: null, jourDePaie: 28 };

  it("CDI qui commence le 15 octobre : prorata en jours ouvrés (12 sur 22), puis le mois complet reporté au lundi", () => {
    const p = paiesContrat(cdi, R, "2026-10-01", "2026-11-30");
    // 3 000 € × 12 / 22 = 1 636,36 € brut (163 636 centimes) → × 0,78 = 1 276,36 € ; novembre : 3 000 × 0,78 = 2 340 €
    expect(p.map((x) => [x.datePaiement, x.netCents])).toEqual([["2026-10-28", 127_636], ["2026-11-30", 234_000]]);
  });

  it("une paie hors de la fenêtre demandée n'est pas rendue", () => {
    expect(paiesContrat(cdi, R, "2026-11-01", "2026-11-30").map((x) => x.datePaiement)).toEqual(["2026-11-30"]);
    expect(paiesContrat(cdi, R, "2027-01-01", "2027-01-31")).toHaveLength(1);
  });

  it("CDD du 1er octobre au 30 novembre à 2 000 € : deux paies de 1 560 € et une ligne de fin de contrat de 624 €", () => {
    const cdd: Contrat = { id: "c2", libelle: "CDD", type: "cdd", brutMensuelCents: 200_000, debut: "2026-10-01", fin: "2026-11-30", jourDePaie: 28 };
    const p = paiesContrat(cdd, R, "2026-10-01", "2027-01-31");
    // brut total 4 000 € : précarité 400 € + congés 400 € = 800 € brut → 624 € net
    expect(p.map((x) => [x.datePaiement, x.netCents, x.libelle])).toEqual([
      ["2026-10-28", 156_000, "CDD"],
      ["2026-11-30", 156_000, "CDD"],
      ["2026-11-30", 62_400, "CDD (fin de contrat)"],
    ]);
  });
});
