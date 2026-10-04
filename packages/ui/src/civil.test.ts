import { describe, expect, it } from "vitest";
import {
  FUSEAU_PARIS,
  ajouterAns,
  ajouterJours,
  ajouterJoursOuvres,
  ajouterMois,
  comparerJours,
  compterJoursOuvres,
  debutDeJour,
  decalageMinutes,
  decomposer,
  dernierDuMois,
  differenceJours,
  dimancheDe,
  dureeDuJour,
  dureeEntre,
  estBissextile,
  estFerieFrance,
  estJour,
  estOuvre,
  feriesFrance,
  formatDuree,
  formatHeure,
  instantVersIso,
  instantVersLocal,
  isoVersInstant,
  jour,
  jourDeInstant,
  jourDeNumero,
  jourDeSemaine,
  joursDansMois,
  localVersInstant,
  lundiDe,
  normaliserMinutes,
  numeroDeJour,
  paques,
  parseDuree,
  parseHeure,
  plage,
  precedentOuvre,
  premierDuMois,
  prochainOuvre,
} from "./civil";

const utc = (a: number, m: number, j: number, h = 0, min = 0) => Date.UTC(a, m - 1, j, h, min);

describe("jours civils : validité", () => {
  it("années bissextiles (règle grégorienne)", () => {
    expect([2024, 2028, 2000, 1600].every(estBissextile)).toBe(true);
    expect([2026, 2100, 1900, 2023].some(estBissextile)).toBe(false);
  });
  it("jours par mois", () => {
    expect(joursDansMois(2026, 2)).toBe(28);
    expect(joursDansMois(2028, 2)).toBe(29);
    expect(joursDansMois(2026, 4)).toBe(30);
    expect(joursDansMois(2026, 12)).toBe(31);
    expect(() => joursDansMois(2026, 13)).toThrow(RangeError);
    expect(() => joursDansMois(2026, 0)).toThrow(RangeError);
  });
  it("estJour ne laisse passer que des dates qui existent", () => {
    for (const bon of ["2026-10-04", "2028-02-29", "2000-02-29", "0001-01-01", "9999-12-31"]) expect(estJour(bon), bon).toBe(true);
    for (const mauvais of ["2026-02-29", "2100-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "2026-1-1", "26-01-01", "0000-01-01", "2026-10-04T00:00", " 2026-10-04", "", 20261004, null, undefined]) {
      expect(estJour(mauvais), String(mauvais)).toBe(false);
    }
  });
  it("jour() compose et refuse l'impossible", () => {
    expect(jour(2026, 3, 9)).toBe("2026-03-09");
    expect(() => jour(2026, 2, 29)).toThrow(RangeError);
    expect(() => jour(2026, 4, 31)).toThrow(RangeError);
    expect(() => jour(0, 1, 1)).toThrow(RangeError);
    expect(() => jour(10000, 1, 1)).toThrow(RangeError);
    expect(() => jour(2026, 1, 1.5)).toThrow(RangeError);
  });
  it("decomposer refuse un jour invalide", () => {
    expect(decomposer("2026-10-04")).toEqual({ annee: 2026, mois: 10, jour: 4 });
    expect(() => decomposer("2026-02-30")).toThrow(RangeError);
  });
});

describe("numéro de jour, ajouts et différences", () => {
  it("repères connus", () => {
    expect(numeroDeJour("1970-01-01")).toBe(0);
    expect(numeroDeJour("1970-01-02")).toBe(1);
    expect(numeroDeJour("1969-12-31")).toBe(-1);
    expect(numeroDeJour("2000-03-01")).toBe(11017);
    expect(numeroDeJour("2026-10-04")).toBe(Math.floor(Date.UTC(2026, 9, 4) / 86_400_000));
  });
  it("numeroDeJour et jourDeNumero sont inverses sur tout l'intervalle 0001 à 9999", () => {
    const debut = numeroDeJour("0001-01-01");
    const fin = numeroDeJour("9999-12-31");
    for (let n = debut; n <= fin; n += 997) expect(numeroDeJour(jourDeNumero(n))).toBe(n);
    expect(jourDeNumero(debut)).toBe("0001-01-01");
    expect(jourDeNumero(fin)).toBe("9999-12-31");
    expect(() => jourDeNumero(fin + 1)).toThrow(RangeError);
    expect(() => jourDeNumero(debut - 1)).toThrow(RangeError);
  });
  it("même résultat que Date sur 40 ans, chaque jour", () => {
    for (let n = numeroDeJour("1990-01-01"); n <= numeroDeJour("2030-12-31"); n++) {
      expect(jourDeNumero(n)).toBe(new Date(n * 86_400_000).toISOString().slice(0, 10));
    }
  });
  it("ajouterJours traverse fins de mois, d'année et février bissextile", () => {
    expect(ajouterJours("2026-02-28", 1)).toBe("2026-03-01");
    expect(ajouterJours("2028-02-28", 1)).toBe("2028-02-29");
    expect(ajouterJours("2028-02-28", 2)).toBe("2028-03-01");
    expect(ajouterJours("2026-12-31", 1)).toBe("2027-01-01");
    expect(ajouterJours("2026-01-01", -1)).toBe("2025-12-31");
    expect(ajouterJours("2026-03-01", 365)).toBe("2027-03-01");
    expect(ajouterJours("2026-03-01", 0)).toBe("2026-03-01");
    expect(() => ajouterJours("2026-03-01", 1.5)).toThrow(RangeError);
  });
  it("differenceJours et comparerJours", () => {
    expect(differenceJours("2026-03-29", "2026-10-25")).toBe(210);
    expect(differenceJours("2026-10-25", "2026-03-29")).toBe(-210);
    expect(differenceJours("2026-10-04", "2026-10-04")).toBe(0);
    expect(comparerJours("2026-10-04", "2026-10-05")).toBe(-1);
    expect(comparerJours("2026-10-05", "2026-10-04")).toBe(1);
    expect(comparerJours("2026-10-04", "2026-10-04")).toBe(0);
  });
});

describe("jour de la semaine", () => {
  it("ISO : 1 = lundi … 7 = dimanche", () => {
    expect(jourDeSemaine("2026-10-05")).toBe(1); // le lundi 5 octobre de la spec
    expect(jourDeSemaine("2026-10-04")).toBe(7);
    expect(jourDeSemaine("2026-10-03")).toBe(6);
    expect(jourDeSemaine("1970-01-01")).toBe(4); // jeudi
    expect(jourDeSemaine("2000-01-01")).toBe(6); // samedi
    expect(jourDeSemaine("2024-02-29")).toBe(4); // jeudi
    expect(jourDeSemaine("1969-12-31")).toBe(3); // mercredi, avant 1970
    expect(jourDeSemaine("0001-01-01")).toBe(1); // lundi (grégorien proleptique)
  });
  it("même résultat que Date sur 3 ans", () => {
    for (let n = numeroDeJour("2025-01-01"); n <= numeroDeJour("2027-12-31"); n++) {
      const attendu = new Date(n * 86_400_000).getUTCDay() || 7;
      expect(jourDeSemaine(jourDeNumero(n))).toBe(attendu);
    }
  });
  it("lundi et dimanche de la semaine, à cheval sur deux mois et deux années", () => {
    expect(lundiDe("2026-10-04")).toBe("2026-09-28");
    expect(lundiDe("2026-10-05")).toBe("2026-10-05");
    expect(dimancheDe("2026-10-05")).toBe("2026-10-11");
    expect(dimancheDe("2026-10-11")).toBe("2026-10-11");
    expect(lundiDe("2027-01-01")).toBe("2026-12-28");
    expect(dimancheDe("2026-12-28")).toBe("2027-01-03");
  });
  it("premier et dernier jour du mois", () => {
    expect(premierDuMois("2026-10-17")).toBe("2026-10-01");
    expect(dernierDuMois("2026-02-10")).toBe("2026-02-28");
    expect(dernierDuMois("2028-02-10")).toBe("2028-02-29");
    expect(dernierDuMois("2026-12-01")).toBe("2026-12-31");
  });
});

describe("ajouterMois : fin de mois", () => {
  const cas: [string, number, string][] = [
    ["2026-01-31", 1, "2026-02-28"],
    ["2028-01-31", 1, "2028-02-29"],
    ["2026-01-31", 2, "2026-03-31"],
    ["2026-03-31", -1, "2026-02-28"],
    ["2026-05-31", 1, "2026-06-30"],
    ["2026-12-15", 1, "2027-01-15"],
    ["2026-01-15", -1, "2025-12-15"],
    ["2026-01-31", 13, "2027-02-28"],
    ["2026-10-04", 0, "2026-10-04"],
    ["2026-10-04", -10, "2025-12-04"],
    ["2026-10-04", 120, "2036-10-04"],
    ["2026-08-31", 6, "2027-02-28"],
    ["2026-02-28", 1, "2026-03-28"], // le 28 reste le 28 (pas de « fin de mois » implicite)
  ];
  for (const [depart, n, attendu] of cas) it(`${depart} + ${n} mois = ${attendu}`, () => expect(ajouterMois(depart, n)).toBe(attendu));
  it("une échéance mensuelle part de la date d'origine : le 31 revient en mars", () => {
    const origine = "2026-01-31";
    expect([1, 2, 3, 4].map((k) => ajouterMois(origine, k))).toEqual(["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    // …alors qu'enchaîner à partir du mois précédent dérive vers le 28.
    expect(ajouterMois(ajouterMois(origine, 1), 1)).toBe("2026-03-28");
  });
  it("ajouterAns : le 29 février devient le 28", () => {
    expect(ajouterAns("2028-02-29", 1)).toBe("2029-02-28");
    expect(ajouterAns("2028-02-29", 4)).toBe("2032-02-29");
    expect(ajouterAns("2026-02-28", -2)).toBe("2024-02-28");
  });
  it("refuse de sortir des années 0001 à 9999 et les nombres invalides", () => {
    expect(() => ajouterMois("9999-12-31", 1)).toThrow(RangeError);
    expect(() => ajouterMois("0001-01-15", -1)).toThrow(RangeError);
    expect(() => ajouterMois("2026-01-15", 0.5)).toThrow(RangeError);
  });
});

describe("plage", () => {
  it("liste les jours, bornes comprises, à cheval sur un mois", () => {
    expect(plage("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(plage("2026-10-04", "2026-10-04")).toEqual(["2026-10-04"]);
  });
  it("vide si la fin précède le début ; refuse une plage géante", () => {
    expect(plage("2026-10-05", "2026-10-04")).toEqual([]);
    expect(() => plage("2020-01-01", "2030-12-31")).toThrow(RangeError);
    expect(plage("2020-01-01", "2020-12-31", 400)).toHaveLength(366);
  });
});

describe("Pâques et jours fériés", () => {
  it("dates de Pâques connues", () => {
    expect(paques(2000)).toBe("2000-04-23");
    expect(paques(2024)).toBe("2024-03-31");
    expect(paques(2025)).toBe("2025-04-20");
    expect(paques(2026)).toBe("2026-04-05");
    expect(paques(2027)).toBe("2027-03-28");
    expect(paques(2038)).toBe("2038-04-25");
  });
  it("les onze fériés de 2026", () => {
    expect(feriesFrance(2026)).toEqual([
      "2026-01-01",
      "2026-04-06",
      "2026-05-01",
      "2026-05-08",
      "2026-05-14",
      "2026-05-25",
      "2026-07-14",
      "2026-08-15",
      "2026-11-01",
      "2026-11-11",
      "2026-12-25",
    ]);
  });
  it("Ascension et lundi de Pentecôte 2025", () => {
    const f = feriesFrance(2025);
    expect(f).toContain("2025-05-29");
    expect(f).toContain("2025-06-09");
    expect(f).toContain("2025-04-21");
  });
  it("estFerieFrance", () => {
    expect(estFerieFrance("2026-04-06")).toBe(true);
    expect(estFerieFrance("2026-04-05")).toBe(false); // le dimanche de Pâques n'est pas listé (déjà un dimanche)
    expect(estFerieFrance("2026-04-03")).toBe(false); // vendredi saint : pas férié en métropole
    expect(estFerieFrance("2026-12-25")).toBe(true);
  });
});

describe("jours ouvrés", () => {
  it("lundi à vendredi, hors fériés choisis par l'appelant", () => {
    expect(estOuvre("2026-10-05")).toBe(true);
    expect(estOuvre("2026-10-03")).toBe(false);
    expect(estOuvre("2026-10-04")).toBe(false);
    expect(estOuvre("2026-05-01")).toBe(true); // vendredi, aucun calendrier de fériés
    expect(estOuvre("2026-05-01", estFerieFrance)).toBe(false);
  });
  it("prochainOuvre et precedentOuvre", () => {
    expect(prochainOuvre("2026-10-04")).toBe("2026-10-05");
    expect(prochainOuvre("2026-10-05")).toBe("2026-10-05");
    expect(prochainOuvre("2026-05-01", estFerieFrance)).toBe("2026-05-04");
    expect(precedentOuvre("2026-10-04")).toBe("2026-10-02");
    expect(precedentOuvre("2026-05-04", estFerieFrance)).toBe("2026-05-04");
    expect(precedentOuvre("2026-05-03", estFerieFrance)).toBe("2026-04-30");
    expect(prochainOuvre("2026-12-25", estFerieFrance)).toBe("2026-12-28");
  });
  it("un calendrier où tout est férié lève une erreur au lieu de boucler", () => {
    expect(() => prochainOuvre("2026-10-05", () => true)).toThrow(RangeError);
    expect(() => precedentOuvre("2026-10-05", () => true)).toThrow(RangeError);
  });
  it("ajouterJoursOuvres : le jour de départ ne compte pas", () => {
    expect(ajouterJoursOuvres("2026-10-02", 1)).toBe("2026-10-05");
    expect(ajouterJoursOuvres("2026-10-05", 5)).toBe("2026-10-12");
    expect(ajouterJoursOuvres("2026-10-05", -1)).toBe("2026-10-02");
    expect(ajouterJoursOuvres("2026-10-05", -5)).toBe("2026-09-28");
    expect(ajouterJoursOuvres("2026-10-03", 0)).toBe("2026-10-05"); // samedi → lundi
    expect(ajouterJoursOuvres("2026-10-06", 0)).toBe("2026-10-06");
    expect(ajouterJoursOuvres("2026-04-02", 2, estFerieFrance)).toBe("2026-04-07"); // saute le lundi de Pâques
    expect(ajouterJoursOuvres("2026-10-05", 10)).toBe("2026-10-19");
  });
  it("compterJoursOuvres : bornes comprises", () => {
    expect(compterJoursOuvres("2026-10-05", "2026-10-11")).toBe(5);
    expect(compterJoursOuvres("2026-10-05", "2026-10-05")).toBe(1);
    expect(compterJoursOuvres("2026-10-03", "2026-10-04")).toBe(0);
    expect(compterJoursOuvres("2026-10-06", "2026-10-05")).toBe(0);
    expect(compterJoursOuvres("2026-04-01", "2026-04-30")).toBe(22);
    expect(compterJoursOuvres("2026-04-01", "2026-04-30", estFerieFrance)).toBe(21);
    expect(compterJoursOuvres("2026-01-01", "2026-12-31", estFerieFrance)).toBe(261 - 9); // 261 jours de semaine ; 9 fériés tombent un jour de semaine (le 15 août est un samedi, le 1er novembre un dimanche)
  });
});

describe("heures du jour et durées en minutes", () => {
  it("normaliserMinutes : la veille et le lendemain", () => {
    expect(normaliserMinutes(0)).toEqual({ jours: 0, minutes: 0 });
    expect(normaliserMinutes(1439)).toEqual({ jours: 0, minutes: 1439 });
    expect(normaliserMinutes(1440)).toEqual({ jours: 1, minutes: 0 });
    expect(normaliserMinutes(1500)).toEqual({ jours: 1, minutes: 60 });
    expect(normaliserMinutes(-60)).toEqual({ jours: -1, minutes: 1380 });
    expect(normaliserMinutes(-1440)).toEqual({ jours: -1, minutes: 0 });
    expect(normaliserMinutes(-1441)).toEqual({ jours: -2, minutes: 1439 });
    expect(() => normaliserMinutes(1.5)).toThrow(RangeError);
  });
  it("formatHeure", () => {
    expect(formatHeure(510)).toBe("08:30");
    expect(formatHeure(0)).toBe("00:00");
    expect(formatHeure(1439)).toBe("23:59");
    expect(formatHeure(-60)).toBe("23:00");
    expect(formatHeure(1440)).toBe("00:00");
    expect(formatHeure(1500)).toBe("01:00");
  });
  it("parseHeure", () => {
    for (const [texte, attendu] of [["8:30", 510], ["08:30", 510], ["8h30", 510], ["8 h 30", 510], ["8h", 480], ["0:00", 0], ["23:59", 1439], ["12H05", 725]] as const) {
      expect(parseHeure(texte), texte).toBe(attendu);
    }
    for (const mauvais of ["24:00", "8:60", "8:5", "8", "abc", "", "8:30:00", "-1:00", "25h"]) expect(parseHeure(mauvais), mauvais).toBeNull();
  });
  it("dureeEntre : une plage dont la fin n'est pas après le début passe minuit", () => {
    expect(dureeEntre(8 * 60, 17 * 60)).toBe(540);
    expect(dureeEntre(22 * 60, 6 * 60)).toBe(480);
    expect(dureeEntre(23 * 60 + 59, 0)).toBe(1);
    expect(dureeEntre(480, 480)).toBe(1440);
    expect(dureeEntre(-60, 6 * 60)).toBe(420); // 23:00 la veille → 06:00
  });
  it("formatDuree", () => {
    expect(formatDuree(450)).toBe("7 h 30");
    expect(formatDuree(60)).toBe("1 h");
    expect(formatDuree(45)).toBe("45 min");
    expect(formatDuree(0)).toBe("0 min");
    expect(formatDuree(65)).toBe("1 h 05");
    expect(formatDuree(1500)).toBe("25 h");
    expect(formatDuree(-90)).toBe("-1 h 30");
    expect(() => formatDuree(1.5)).toThrow(RangeError);
  });
  it("parseDuree", () => {
    for (const [texte, attendu] of [
      ["7h30", 450],
      ["7 h 30", 450],
      ["7:30", 450],
      ["7h", 420],
      ["45 min", 45],
      ["45min", 45],
      ["1h05", 65],
      ["90", 90],
      ["0", 0],
      ["-1h30", -90],
      ["10h00 min", 600],
      [" 2 H 15 ", 135],
    ] as const) {
      expect(parseDuree(texte), texte).toBe(attendu);
    }
    for (const mauvais of ["7h75", "7h5", "abc", "", "h30", "7,5h", "1.5", "7h30m30"]) expect(parseDuree(mauvais), mauvais).toBeNull();
  });
  it("relit ce que formatDuree écrit", () => {
    for (const m of [0, 1, 45, 60, 65, 450, 1500, -90]) expect(parseDuree(formatDuree(m))).toBe(m);
  });
});

describe("instant UTC ↔ Europe/Paris", () => {
  it("été (UTC+2) et hiver (UTC+1)", () => {
    expect(localVersInstant("2026-10-05", 600)).toBe(utc(2026, 10, 5, 8, 0));
    expect(localVersInstant("2026-01-15", 600)).toBe(utc(2026, 1, 15, 9, 0));
    expect(instantVersLocal(utc(2026, 10, 5, 8, 0))).toEqual({ jour: "2026-10-05", minutes: 600, decalageMin: 120 });
    expect(instantVersLocal(utc(2026, 1, 15, 9, 0))).toEqual({ jour: "2026-01-15", minutes: 600, decalageMin: 60 });
    expect(decalageMinutes(utc(2026, 7, 1))).toBe(120);
    expect(decalageMinutes(utc(2026, 12, 1))).toBe(60);
  });
  it("le jour civil change avant minuit UTC en été", () => {
    expect(instantVersLocal(utc(2026, 10, 4, 22, 30))).toMatchObject({ jour: "2026-10-05", minutes: 30 });
    expect(jourDeInstant(utc(2026, 10, 4, 21, 59))).toBe("2026-10-04");
    expect(jourDeInstant(utc(2026, 10, 4, 22, 0))).toBe("2026-10-05");
    expect(jourDeInstant(utc(2026, 1, 4, 22, 59))).toBe("2026-01-04");
    expect(jourDeInstant(utc(2026, 1, 4, 23, 0))).toBe("2026-01-05");
  });
  it("heures avant minuit ou après 24 h : la veille et le lendemain", () => {
    expect(localVersInstant("2026-10-05", -60)).toBe(utc(2026, 10, 4, 21, 0));
    expect(localVersInstant("2026-10-05", 1440 + 60)).toBe(utc(2026, 10, 5, 23, 0));
    expect(localVersInstant("2026-10-05", 1440)).toBe(localVersInstant("2026-10-06", 0));
  });

  describe("passage à l'heure d'été (dimanche 29 mars 2026, 02:00 → 03:00 à 01:00 UTC)", () => {
    it("les heures de part et d'autre du saut", () => {
      expect(instantVersLocal(utc(2026, 3, 29, 0, 59))).toEqual({ jour: "2026-03-29", minutes: 119, decalageMin: 60 }); // 01:59 CET
      expect(instantVersLocal(utc(2026, 3, 29, 1, 0))).toEqual({ jour: "2026-03-29", minutes: 180, decalageMin: 120 }); // 03:00 CEST
      expect(localVersInstant("2026-03-29", 119)).toBe(utc(2026, 3, 29, 0, 59));
      expect(localVersInstant("2026-03-29", 180)).toBe(utc(2026, 3, 29, 1, 0));
    });
    it("02:30 n'existe pas : décalée à 03:30 par défaut, refusée sur demande", () => {
      expect(localVersInstant("2026-03-29", 150)).toBe(utc(2026, 3, 29, 1, 30));
      expect(instantVersLocal(localVersInstant("2026-03-29", 150)).minutes).toBe(210); // 03:30
      expect(localVersInstant("2026-03-29", 120)).toBe(utc(2026, 3, 29, 1, 0)); // 02:00 → 03:00
      expect(() => localVersInstant("2026-03-29", 150, { inexistant: "refuser" })).toThrow(RangeError);
    });
    it("le jour dure 23 heures", () => {
      expect(dureeDuJour("2026-03-29")).toBe(1380);
      expect(dureeDuJour("2026-03-28")).toBe(1440);
      expect(dureeDuJour("2026-03-30")).toBe(1440);
    });
    it("une nuit de 22:00 à 08:00 dure 9 h réelles, pas 10", () => {
      const debut = localVersInstant("2026-03-28", 22 * 60);
      const fin = localVersInstant("2026-03-29", 8 * 60);
      expect((fin - debut) / 60_000).toBe(540);
    });
  });

  describe("retour à l'heure d'hiver (dimanche 25 octobre 2026, 03:00 → 02:00 à 01:00 UTC)", () => {
    it("les heures de part et d'autre du retour", () => {
      expect(instantVersLocal(utc(2026, 10, 24, 23, 59))).toEqual({ jour: "2026-10-25", minutes: 119, decalageMin: 120 }); // 01:59 CEST
      expect(instantVersLocal(utc(2026, 10, 25, 0, 30))).toEqual({ jour: "2026-10-25", minutes: 150, decalageMin: 120 }); // 02:30 CEST
      expect(instantVersLocal(utc(2026, 10, 25, 1, 30))).toEqual({ jour: "2026-10-25", minutes: 150, decalageMin: 60 }); // 02:30 CET
      expect(localVersInstant("2026-10-25", 119)).toBe(utc(2026, 10, 24, 23, 59));
      expect(localVersInstant("2026-10-25", 180)).toBe(utc(2026, 10, 25, 2, 0)); // 03:00 CET : unique
    });
    it("02:30 existe deux fois : la première par défaut, la seconde sur demande, ou refus", () => {
      expect(localVersInstant("2026-10-25", 150)).toBe(utc(2026, 10, 25, 0, 30));
      expect(localVersInstant("2026-10-25", 150, { ambigu: "premier" })).toBe(utc(2026, 10, 25, 0, 30));
      expect(localVersInstant("2026-10-25", 150, { ambigu: "second" })).toBe(utc(2026, 10, 25, 1, 30));
      expect(() => localVersInstant("2026-10-25", 150, { ambigu: "refuser" })).toThrow(RangeError);
      expect(localVersInstant("2026-10-25", 120)).toBe(utc(2026, 10, 25, 0, 0)); // 02:00 CEST (la première)
      expect(localVersInstant("2026-10-25", 120, { ambigu: "second" })).toBe(utc(2026, 10, 25, 1, 0));
    });
    it("le jour dure 25 heures", () => {
      expect(dureeDuJour("2026-10-25")).toBe(1500);
      expect(dureeDuJour("2026-10-24")).toBe(1440);
    });
    it("une nuit de 22:00 à 08:00 dure 11 h réelles, pas 10", () => {
      const debut = localVersInstant("2026-10-24", 22 * 60);
      const fin = localVersInstant("2026-10-25", 8 * 60);
      expect((fin - debut) / 60_000).toBe(660);
    });
  });

  it("aller-retour sur quatre jours autour de chaque changement d'heure, par pas de 15 minutes", () => {
    for (const depart of [utc(2026, 3, 27), utc(2026, 10, 23), utc(2027, 3, 26), utc(2027, 10, 29)]) {
      for (let ms = depart; ms < depart + 4 * 86_400_000; ms += 15 * 60_000) {
        const local = instantVersLocal(ms);
        const possibles = [localVersInstant(local.jour, local.minutes, { ambigu: "premier" }), localVersInstant(local.jour, local.minutes, { ambigu: "second" })];
        expect(possibles, instantVersIso(ms)).toContain(ms);
      }
    }
  });
  it("aller-retour toute l'année 2026 par pas d'une demi-heure, en distinguant les heures vues deux fois en octobre", () => {
    let ambigus = 0;
    for (let ms = utc(2026, 1, 1); ms < utc(2027, 1, 1); ms += 30 * 60_000) {
      const local = instantVersLocal(ms);
      const premier = localVersInstant(local.jour, local.minutes, { ambigu: "premier" });
      const second = localVersInstant(local.jour, local.minutes, { ambigu: "second" });
      if (premier !== second) ambigus++;
      expect(ms === premier || ms === second, instantVersIso(ms)).toBe(true);
      if (premier === second) expect(premier).toBe(ms);
    }
    expect(ambigus).toBe(4); // 00:00, 00:30, 01:00 et 01:30 UTC le 25 octobre : deux heures locales (02:00 et 02:30), chacune vue deux fois
  });
  it("debutDeJour : minuit local, en UTC", () => {
    expect(debutDeJour("2026-10-05")).toBe(utc(2026, 10, 4, 22, 0));
    expect(debutDeJour("2026-01-05")).toBe(utc(2026, 1, 4, 23, 0));
    expect(debutDeJour("2026-03-29")).toBe(utc(2026, 3, 28, 23, 0));
    expect(debutDeJour("2026-03-30")).toBe(utc(2026, 3, 29, 22, 0));
  });
  it("une année entière : 365 jours de 1 440 minutes, sauf deux", () => {
    let total = 0;
    for (const j of plage("2026-01-01", "2026-12-31")) total += dureeDuJour(j);
    expect(total).toBe(365 * 1440);
  });

  describe("autres fuseaux et erreurs", () => {
    it("UTC, New York, Calcutta (+5 h 30)", () => {
      expect(localVersInstant("2026-01-15", 600, { fuseau: "UTC" })).toBe(utc(2026, 1, 15, 10, 0));
      expect(localVersInstant("2026-01-15", 600, { fuseau: "America/New_York" })).toBe(utc(2026, 1, 15, 15, 0));
      expect(localVersInstant("2026-07-15", 600, { fuseau: "America/New_York" })).toBe(utc(2026, 7, 15, 14, 0));
      expect(localVersInstant("2026-01-01", 0, { fuseau: "Asia/Kolkata" })).toBe(utc(2025, 12, 31, 18, 30));
      expect(instantVersLocal(utc(2026, 1, 1, 0, 0), { fuseau: "Asia/Kolkata" })).toEqual({ jour: "2026-01-01", minutes: 330, decalageMin: 330 });
    });
    it("fuseau inconnu ou instant invalide", () => {
      expect(() => decalageMinutes(0, "Mars/Olympus")).toThrow(RangeError);
      expect(() => localVersInstant("2026-01-01", 0, { fuseau: "n'importe quoi" })).toThrow(RangeError);
      expect(() => instantVersLocal(1.5)).toThrow(RangeError);
      expect(() => instantVersLocal(NaN)).toThrow(RangeError);
      expect(() => localVersInstant("2026-02-30", 0)).toThrow(RangeError);
    });
    it("le fuseau par défaut est Europe/Paris", () => {
      expect(FUSEAU_PARIS).toBe("Europe/Paris");
      expect(localVersInstant("2026-07-01", 0)).toBe(localVersInstant("2026-07-01", 0, { fuseau: "Europe/Paris" }));
    });
  });

  it("instants ISO : seulement avec « Z »", () => {
    expect(instantVersIso(0)).toBe("1970-01-01T00:00:00.000Z");
    expect(isoVersInstant("2026-10-05T08:00:00Z")).toBe(utc(2026, 10, 5, 8, 0));
    expect(isoVersInstant("2026-10-05T08:00Z")).toBe(utc(2026, 10, 5, 8, 0));
    expect(isoVersInstant("2026-10-05T08:00:00.500Z")).toBe(utc(2026, 10, 5, 8, 0) + 500);
    for (const mauvais of ["2026-10-05T08:00:00", "2026-10-05T08:00:00+02:00", "2026-10-05", "2026-02-30T00:00:00Z", "2026-10-05T25:00:00Z", "n'importe quoi", ""]) {
      expect(isoVersInstant(mauvais), mauvais).toBeNull();
    }
    expect(isoVersInstant(instantVersIso(utc(2026, 3, 29, 1, 0)))).toBe(utc(2026, 3, 29, 1, 0));
  });
});
