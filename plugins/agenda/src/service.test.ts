// Le service `agenda@1` et le carnet : idempotence, espace propre, refus stricts, et cohérence avec le manifeste.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { carnetVide, lireCarnet } from "./carnet";
import { dateHeureLocale, genererIcs, plier } from "./ics";
import { ajouter, modifier, supprimer } from "./operations";
import { FONCTIONS, executer } from "./service";
import { ErreurAgenda, UTILISATEUR, type Carnet } from "./types";
import { lireBrouillon } from "./carnet";
import { occurrences } from "./calculs";
import { vueJour, vueMois } from "./vue";

const mission = { type: "travail", titre: "Mission Dupont", jour: "2026-10-06", debutMin: 480, finMin: 960 };
const appel = (enregistre: unknown, fonction: string, args: unknown, appelant = "paie") => executer(enregistre, fonction, args, appelant);

/** Applique une exécution : le carnet à enregistrer, ou l'ancien s'il n'a pas changé. */
const suite = (avant: unknown, r: { carnet: Carnet | null }): unknown => r.carnet ?? avant;

function refus(f: () => unknown): ErreurAgenda {
  try {
    f();
  } catch (e) {
    if (e instanceof ErreurAgenda) return e;
    throw e;
  }
  throw new Error("Un refus était attendu.");
}

describe("manifeste", () => {
  it("les fonctions et leur niveau d'accès sont ceux du manifeste", () => {
    const manifeste = JSON.parse(readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"));
    const declarees = manifeste.functions.agenda as Record<string, { acces: string }>;
    expect(Object.fromEntries(Object.entries(declarees).map(([k, v]) => [k, v.acces]))).toEqual(FONCTIONS);
  });
});

describe("carnet", () => {
  it("rien d'enregistré : carnet vide ; données illisibles : erreur, jamais un carnet vide", () => {
    expect(lireCarnet(null)).toEqual(carnetVide());
    expect(refus(() => lireCarnet({ schema: 2 })).code).toBe("illisible");
    expect(refus(() => lireCarnet("n'importe quoi")).code).toBe("illisible");
    expect(refus(() => lireCarnet({ schema: 1, evenements: [{ id: "e1" }], reglages: {}, dernierNumero: 1, cles: {} })).code).toBe("illisible");
  });

  it("un carnet écrit par le service se relit à l'identique", () => {
    const r = appel(null, "evenements.remplacer", { ref: "mission:1", evenements: [mission], cle: "k1" });
    expect(lireCarnet(r.carnet)).toEqual(r.carnet);
  });
});

describe("evenements.remplacer", () => {
  it("pose les événements, avec l'appelant comme source, et rend leurs identifiants", () => {
    const r = appel(null, "evenements.remplacer", { ref: "mission:1", evenements: [mission], cle: "k1" });
    expect(r.valeur).toEqual({ ids: ["e1"], rejoue: false });
    expect(r.carnet?.evenements[0]?.source).toEqual({ plugin: "paie", ref: "mission:1" });
  });

  it("rejouer la même clé ne crée aucun doublon", () => {
    const un = appel(null, "evenements.remplacer", { ref: "mission:1", evenements: [mission], cle: "k1" });
    const deux = appel(un.carnet, "evenements.remplacer", { ref: "mission:1", evenements: [mission], cle: "k1" });
    expect(deux.valeur).toEqual({ ids: ["e1"], rejoue: true });
    expect(deux.carnet).toBeNull();
  });

  it("remplace le groupe (appelant, ref) et laisse les autres intacts", () => {
    let c: unknown = null;
    c = suite(c, appel(c, "evenements.remplacer", { ref: "mission:1", evenements: [mission], cle: "k1" }));
    c = suite(c, appel(c, "evenements.remplacer", { ref: "mission:2", evenements: [{ ...mission, titre: "Autre" }], cle: "k2" }));
    c = suite(c, appel(c, "evenements.remplacer", { ref: "mission:1", evenements: [{ ...mission, titre: "Mission modifiée" }], cle: "k3" }));
    const titres = lireCarnet(c).evenements.map((e) => e.titre).sort();
    expect(titres).toEqual(["Autre", "Mission modifiée"]);
  });

  it("espace propre : un plugin ne touche pas aux événements d'un autre, même avec la même référence", () => {
    let c: unknown = null;
    c = suite(c, appel(c, "evenements.remplacer", { ref: "x", evenements: [mission], cle: "k1" }, "paie"));
    c = suite(c, appel(c, "evenements.remplacer", { ref: "x", evenements: [], cle: "k2" }, "finances"));
    expect(lireCarnet(c).evenements).toHaveLength(1);
    const s = appel(c, "evenements.supprimer", { ref: "x" }, "finances");
    expect(s.valeur).toEqual({ supprimes: 0 });
    expect(s.carnet).toBeNull();
  });

  it("evenements.supprimer retire le groupe de l'appelant", () => {
    const un = appel(null, "evenements.remplacer", { ref: "x", evenements: [mission, { ...mission, jour: "2026-10-07" }], cle: "k1" });
    const s = appel(un.carnet, "evenements.supprimer", { ref: "x" });
    expect(s.valeur).toEqual({ supprimes: 2 });
    expect(s.carnet?.evenements).toEqual([]);
  });

  it("les identifiants ne sont jamais réutilisés", () => {
    let c: unknown = null;
    c = suite(c, appel(c, "evenements.remplacer", { ref: "x", evenements: [mission], cle: "k1" }));
    c = suite(c, appel(c, "evenements.supprimer", { ref: "x" }));
    const r = appel(c, "evenements.remplacer", { ref: "x", evenements: [mission], cle: "k2" });
    expect(r.valeur).toEqual({ ids: ["e2"], rejoue: false });
  });

  it("refuse un champ inconnu, un type inconnu, une durée nulle et une heure hors journée", () => {
    const essai = (e: unknown) => refus(() => appel(null, "evenements.remplacer", { ref: "x", evenements: [e], cle: "k" })).code;
    expect(essai({ ...mission, rappels: [] })).toBe("argument_invalide");
    expect(essai({ ...mission, type: "vacances" })).toBe("argument_invalide");
    expect(essai({ ...mission, debutMin: 480, finMin: 480 })).toBe("argument_invalide");
    expect(essai({ ...mission, finMin: 1440 })).toBe("argument_invalide");
    expect(essai({ ...mission, jour: "2026-02-30" })).toBe("argument_invalide");
  });

  it("refuse une répétition de plus de 5 ans et trop d'événements d'un coup", () => {
    const rep = { ...mission, repetition: { frequence: "jour", jusquau: "2032-01-01" } };
    expect(refus(() => appel(null, "evenements.remplacer", { ref: "x", evenements: [rep], cle: "k" })).code).toBe("limite_atteinte");
    const trop = Array.from({ length: 501 }, () => mission);
    expect(refus(() => appel(null, "evenements.remplacer", { ref: "x", evenements: trop, cle: "k" })).code).toBe("limite_atteinte");
  });

  it("une fonction inconnue est introuvable", () => {
    expect(refus(() => appel(null, "evenements.exploser", {})).code).toBe("introuvable");
  });
});

describe("lectures", () => {
  const avec = appel(null, "evenements.remplacer", {
    ref: "x",
    evenements: [mission, { type: "rdv", titre: "Dentiste", jour: "2026-10-07", debutMin: 600, finMin: 660 }, { ...mission, titre: "Nuit", jour: "2026-10-08", debutMin: 1320, finMin: 360 }],
    cle: "k",
  }).carnet;

  it("evenements.liste : fenêtre et filtre par type", () => {
    const tout = appel(avec, "evenements.liste", { du: "2026-10-06", au: "2026-10-08" }).valeur as { titre: string }[];
    expect(tout.map((o) => o.titre)).toEqual(["Mission Dupont", "Dentiste", "Nuit"]);
    const rdv = appel(avec, "evenements.liste", { du: "2026-10-06", au: "2026-10-08", types: ["rdv"] }).valeur as { titre: string }[];
    expect(rdv.map((o) => o.titre)).toEqual(["Dentiste"]);
  });

  it("plages.occupees : jour, début, fin et type seulement", () => {
    const plages = appel(avec, "plages.occupees", { du: "2026-10-06", au: "2026-10-06" }).valeur;
    expect(plages).toEqual([{ jour: "2026-10-06", debutMin: 480, finMin: 960, type: "travail" }]);
  });

  it("refuse une fenêtre à l'envers ou de plus de 5 ans", () => {
    expect(refus(() => appel(avec, "plages.occupees", { du: "2026-10-08", au: "2026-10-06" })).code).toBe("argument_invalide");
    expect(refus(() => appel(avec, "plages.occupees", { du: "2020-01-01", au: "2026-01-01" })).code).toBe("limite_atteinte");
  });

  it("une lecture sur des données illisibles est une erreur, pas une liste vide", () => {
    expect(refus(() => appel({ schema: 9 }, "evenements.liste", { du: "2026-10-06", au: "2026-10-06" })).code).toBe("illisible");
  });
});

describe("écran : ajouter, modifier, supprimer", () => {
  const moi = { appelant: UTILISATEUR, proprietaire: true };
  it("l'utilisateur ajoute, modifie et supprime ; les autres plugins ne peuvent pas modifier l'événement d'un autre", () => {
    let c = carnetVide();
    c = ajouter(c, lireBrouillon(mission), moi).carnet;
    c = modifier(c, "e1", lireBrouillon({ ...mission, titre: "Renommée" }), moi).carnet;
    expect(c.evenements[0]?.titre).toBe("Renommée");
    expect(refus(() => modifier(c, "e1", lireBrouillon(mission), { appelant: "paie", proprietaire: false })).code).toBe("permission_refusee");
    expect(refus(() => supprimer(c, "e9", moi)).code).toBe("introuvable");
    c = supprimer(c, "e1", moi).carnet;
    expect(c.evenements).toEqual([]);
  });
});

describe("export iCalendar", () => {
  it("heures locales flottantes, y compris la veille et le lendemain", () => {
    expect(dateHeureLocale("2026-10-05", 480)).toBe("20261005T080000");
    expect(dateHeureLocale("2026-10-05", -90)).toBe("20261004T223000");
    expect(dateHeureLocale("2026-12-31", 1500)).toBe("20270101T010000");
  });

  it("un événement de nuit finit le lendemain ; les virgules et points-virgules du titre sont échappés", () => {
    const c = appel(null, "evenements.remplacer", { ref: "x", evenements: [{ type: "travail", titre: "Nuit; garde, mission", lieu: "Lyon", jour: "2026-10-05", debutMin: 1320, finMin: 360 }], cle: "k" }).carnet!;
    const ics = genererIcs(occurrences(c.evenements, "2026-10-05", "2026-10-05"), Date.UTC(2026, 9, 5, 12, 0, 0));
    expect(ics).toContain("DTSTART:20261005T220000");
    expect(ics).toContain("DTEND:20261006T060000");
    expect(ics).toContain("SUMMARY:Nuit\\; garde\\, mission");
    expect(ics).toContain("LOCATION:Lyon");
    expect(ics).toContain("DTSTAMP:20261005T120000Z");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("les lignes de plus de 75 octets sont pliées sans couper un caractère accentué", () => {
    const longue = `SUMMARY:${"é".repeat(60)}`;
    const pliee = plier(longue);
    const lignes = pliee.split("\r\n");
    expect(lignes.length).toBeGreaterThan(1);
    expect(lignes.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(lignes.join("").replaceAll(" ", "")).toBe(longue.replaceAll(" ", ""));
  });
});

describe("vue", () => {
  it("le mois d'octobre 2026 : six semaines à partir du lundi 28 septembre, et les événements dans leur case", () => {
    const c = appel(null, "evenements.remplacer", { ref: "x", evenements: [mission], cle: "k" }).carnet!;
    const v = vueMois(c, "2026-10-15");
    expect(v.cases).toHaveLength(42);
    expect(v.cases[0]?.jour).toBe("2026-09-28");
    expect(v.cases.find((x) => x.jour === "2026-10-06")?.occurrences).toHaveLength(1);
    expect(v.cases.find((x) => x.jour === "2026-09-28")?.dansLeMois).toBe(false);
  });

  it("la chronologie à rebours n'est calculée que pour le premier événement avec trajet", () => {
    const c = appel(null, "evenements.remplacer", {
      ref: "x",
      evenements: [{ ...mission, trajetMin: 30 }, { ...mission, titre: "Deuxième", debutMin: 1000, finMin: 1100, trajetMin: 20 }],
      cle: "k",
    }).carnet!;
    const lignes = vueJour(c, "2026-10-06");
    expect(lignes[0]?.chronologie?.decisionMin).toBe(430);
    expect(lignes[1]?.chronologie).toBeNull();
  });
});
