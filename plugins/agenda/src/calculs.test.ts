// Vecteurs d'or : les tests de gestion-budget-perso (crates/core/src/horaires.rs et repos.rs), rejoués tels quels, plus les cas du calendrier.
import { describe, expect, it } from "vitest";
import { alertesRepos, chronologie, joursDEvenement, occurrences, plageAbsolue, trajetMajore, verifierRepos, type Plage } from "./calculs";
import { REGLAGES_DEFAUT, type Evenement, type Reglages } from "./types";

const H = 60;
const J = 24 * 60;

function evt(partiel: Partial<Evenement> & Pick<Evenement, "jour">): Evenement {
  return { id: "e1", type: "travail", titre: "Mission", lieu: null, debutMin: 8 * H, finMin: 16 * H, trajetMin: null, repetition: null, source: { plugin: "utilisateur", ref: "ui" }, ...partiel };
}

describe("chronologie à rebours (horaires.rs)", () => {
  const base: Reglages = { ...REGLAGES_DEFAUT, margeArriveeMin: 10, miseEnRouteMin: 10, preparationMin: 45, sommeilMin: 8 * H, endormissementMin: 15, majorationTrajetBp: 0 };

  it("exemple du cahier des charges : début 8 h, trajet 30 min → décision de partir à 7 h 10", () => {
    const p = chronologie(8 * H, 30, base);
    expect(p.arriveeViseeMin).toBe(7 * H + 50);
    expect(p.departMin).toBe(7 * H + 20);
    expect(p.decisionMin).toBe(7 * H + 10);
  });

  it("le coucher tombe la veille : valeur négative (22 h 10 = -110)", () => {
    const p = chronologie(8 * H, 30, base);
    expect(p.reveilMin).toBe(6 * H + 25);
    expect(p.coucherMin).toBe(6 * H + 25 - 8 * H - 15);
    expect(p.coucherMin).toBe(-110);
  });

  it("la majoration du trajet est arrondie à la minute supérieure", () => {
    expect(trajetMajore(30, 0)).toBe(30);
    expect(trajetMajore(30, 1500)).toBe(35); // 34,5
    expect(trajetMajore(20, 1000)).toBe(22);
    expect(trajetMajore(0, 1500)).toBe(0);
  });

  it("+20 % sur 30 min de trajet : 36 min, départ avancé à 7 h 04", () => {
    const p = chronologie(8 * H, 30, { ...base, majorationTrajetBp: 2000 });
    expect(p.trajetMajoreMin).toBe(36);
    expect(p.decisionMin).toBe(7 * H + 4);
  });
});

describe("repos légal (repos.rs)", () => {
  const plage = (debut: number, fin: number): Plage => ({ debut, fin });

  it("rien à signaler : deux journées de 8 h", () => {
    expect(verifierRepos([plage(8 * H, 16 * H), plage(J + 8 * H, J + 16 * H)])).toEqual([]);
  });

  it("repos insuffisant : 8 h entre 22 h et 6 h", () => {
    expect(verifierRepos([plage(14 * H, 22 * H), plage(J + 6 * H, J + 14 * H)])).toEqual([{ type: "repos_insuffisant", entre: 0, reposMin: 8 * H }]);
  });

  it("journée trop longue : 11 h", () => {
    expect(verifierRepos([plage(6 * H, 17 * H)])).toEqual([{ type: "journee_trop_longue", plage: 0, dureeMin: 11 * H }]);
  });

  it("semaine trop longue : six jours de 9 h = 54 h", () => {
    const six = Array.from({ length: 6 }, (_, d) => plage(d * J + 8 * H, d * J + 17 * H));
    expect(verifierRepos(six)).toContainEqual({ type: "semaine_trop_longue", depuis: 0, totalMin: 54 * H });
  });

  it("les plages non triées sont acceptées", () => {
    expect(verifierRepos([plage(J + 8 * H, J + 16 * H), plage(8 * H, 16 * H)])).toEqual([]);
  });

  it("alertes datées : le repos insuffisant est signalé le jour de la reprise, en français", () => {
    const occ = occurrences(
      [evt({ id: "e1", jour: "2026-10-05", debutMin: 14 * H, finMin: 22 * H }), evt({ id: "e2", jour: "2026-10-06", debutMin: 6 * H, finMin: 14 * H })],
      "2026-10-05",
      "2026-10-06",
    );
    const a = alertesRepos(occ);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ type: "repos_insuffisant", jour: "2026-10-06" });
    expect(a[0]?.message).toContain("8 h");
  });

  it("un rendez-vous ne compte pas pour le repos légal", () => {
    const occ = occurrences([evt({ id: "e1", type: "rdv", jour: "2026-10-05", debutMin: 6 * H, finMin: 19 * H })], "2026-10-05", "2026-10-05");
    expect(alertesRepos(occ)).toEqual([]);
  });
});

describe("plages absolues", () => {
  it("une nuit 22 h → 6 h dure 8 h et passe minuit", () => {
    const p = plageAbsolue({ jour: "2026-10-05", debutMin: 22 * H, finMin: 6 * H });
    expect(p.fin - p.debut).toBe(8 * H);
  });
});

describe("répétitions", () => {
  it("sans répétition : une seule fois, seulement si le jour est dans la fenêtre", () => {
    const e = evt({ jour: "2026-10-12" });
    expect(joursDEvenement(e, "2026-10-01", "2026-10-31")).toEqual(["2026-10-12"]);
    expect(joursDEvenement(e, "2026-11-01", "2026-11-30")).toEqual([]);
  });

  it("chaque semaine jusqu'au 26 octobre, dans la fenêtre du 10 au 31", () => {
    const e = evt({ jour: "2026-10-05", repetition: { frequence: "semaine", jusquau: "2026-10-26" } });
    expect(joursDEvenement(e, "2026-10-10", "2026-10-31")).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
  });

  it("chaque jour : bornes incluses", () => {
    const e = evt({ jour: "2026-10-05", repetition: { frequence: "jour", jusquau: "2026-10-07" } });
    expect(joursDEvenement(e, "2026-10-05", "2026-10-07")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
  });

  it("chaque mois à partir du 31 janvier : le 28 février, puis le 31 mars (toujours depuis l'origine)", () => {
    const e = evt({ jour: "2027-01-31", repetition: { frequence: "mois", jusquau: "2027-04-30" } });
    expect(joursDEvenement(e, "2027-01-01", "2027-04-30")).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  it("une fenêtre très loin après le premier jour ne parcourt pas toute l'histoire", () => {
    const e = evt({ jour: "2026-01-01", repetition: { frequence: "jour", jusquau: "2031-01-01" } });
    expect(joursDEvenement(e, "2030-12-30", "2031-01-02")).toEqual(["2030-12-30", "2030-12-31", "2031-01-01"]);
  });

  it("une répétition qui finit avant la fenêtre ne donne rien", () => {
    const e = evt({ jour: "2026-10-05", repetition: { frequence: "semaine", jusquau: "2026-10-26" } });
    expect(joursDEvenement(e, "2026-12-01", "2026-12-31")).toEqual([]);
  });

  it("l'ordre est stable : jour, heure de début, puis création", () => {
    const occ = occurrences([evt({ id: "e2", jour: "2026-10-05", debutMin: 9 * H }), evt({ id: "e1", jour: "2026-10-05", debutMin: 9 * H }), evt({ id: "e3", jour: "2026-10-05", debutMin: 7 * H })], "2026-10-05", "2026-10-05");
    expect(occ.map((o) => o.evenementId)).toEqual(["e3", "e1", "e2"]);
  });
});
