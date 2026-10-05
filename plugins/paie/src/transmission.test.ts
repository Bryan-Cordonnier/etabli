// Données, projections et transmission : rejouable, tolérante à l'absence d'un plugin, sans doublon.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ajouterContrat, ajouterMission, ajouterReserve, donneesVides, lireDonnees, modifierMission, regler, supprimerMission } from "./donnees";
import { empreinte, projections } from "./projection";
import { saisirNetRecu, transmettre, type Appeler, type Reponse } from "./transmission";
import { ErreurPaie, REGLAGES_DEFAUT, type Donnees } from "./types";

const AUJ = "2026-10-05";
const brutMission = { libelle: "Mission Dupont", debut: "2026-10-05", fin: "2026-10-09", joursSemaine: [1, 2, 3, 4, 5], debutMin: 480, finMin: 900, pauseMin: 0, tauxHoraireCents: 1300, statut: "prevu" };

function refus(f: () => unknown): ErreurPaie {
  try {
    f();
  } catch (e) {
    if (e instanceof ErreurPaie) return e;
    throw e;
  }
  throw new Error("Un refus était attendu.");
}

const avecMission = (): Donnees => ajouterMission(donneesVides(), brutMission).donnees;

/** Faux destinataires : enregistre les appels, répond selon `reponses`. */
function faux(reponses: Partial<Record<string, Reponse>> = {}) {
  const appels: { service: string; fonction: string; args: Record<string, unknown> }[] = [];
  const appeler: Appeler = async (service, fonction, args) => {
    appels.push({ service, fonction, args: args as Record<string, unknown> });
    return reponses[service] ?? { ok: true, valeur: { ids: [], rejoue: false } };
  };
  return { appels, appeler };
}

describe("manifeste", () => {
  it("Paie n'a que des dépendances facultatives et les permissions d'appel exactes", () => {
    const m = JSON.parse(readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"));
    expect(m.dependencies).toBeUndefined();
    expect(Object.keys(m.optionalDependencies).sort()).toEqual(["agenda", "budget", "finances"]);
    expect([...m.permissions].sort()).toEqual(["appelle:agenda:ecriture", "appelle:budget:ecriture", "appelle:finances:ecriture", "appelle:finances:lecture"]);
    expect(m.provides).toBeUndefined();
  });
});

describe("données", () => {
  it("rien d'enregistré : données vides ; données illisibles : erreur, jamais des données vides", () => {
    expect(lireDonnees(null)).toEqual(donneesVides());
    expect(refus(() => lireDonnees({ schema: 2 })).code).toBe("illisible");
    expect(refus(() => lireDonnees("n'importe quoi")).code).toBe("illisible");
    expect(refus(() => lireDonnees({ ...avecMission(), missions: [{ id: "m1" }] })).code).toBe("illisible");
  });

  it("des données écrites se relisent à l'identique", () => {
    let d = avecMission();
    d = ajouterReserve(d, { libelle: "Réserve", jours: ["2026-10-07"], horsBase: 1 }).donnees;
    d = ajouterContrat(d, { libelle: "CDI", type: "cdi", brutMensuelCents: 300_000, debut: "2026-10-15", jourDePaie: 28 }).donnees;
    expect(lireDonnees(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("refuse une mission incohérente : fin avant début, aucun jour, durée nulle, CDD sans fin, champ inconnu", () => {
    const essai = (x: unknown) => refus(() => ajouterMission(donneesVides(), { ...brutMission, ...(x as object) })).code;
    expect(essai({ fin: "2026-10-01" })).toBe("argument_invalide");
    expect(essai({ joursSemaine: [] })).toBe("argument_invalide");
    expect(essai({ joursSemaine: [1, 1] })).toBe("argument_invalide");
    expect(essai({ finMin: 480 })).toBe("argument_invalide");
    expect(essai({ tauxHoraireCents: 0 })).toBe("argument_invalide");
    expect(essai({ gain: 1 })).toBe("argument_invalide");
    expect(essai({ fin: "2028-10-09" })).toBe("limite_atteinte");
    expect(refus(() => ajouterContrat(donneesVides(), { libelle: "CDD", type: "cdd", brutMensuelCents: 100_000, debut: "2026-10-01", jourDePaie: 28 })).code).toBe("argument_invalide");
  });

  it("modifier et supprimer une mission ; les taux se règlent sans rien perdre", () => {
    let d = avecMission();
    d = modifierMission(d, "m1", { ...brutMission, libelle: "Renommée" });
    expect(d.missions[0]?.libelle).toBe("Renommée");
    expect(refus(() => modifierMission(d, "m9", brutMission)).code).toBe("introuvable");
    d = regler(d, { ...REGLAGES_DEFAUT, cotisationsBp: 2000 });
    expect(d.reglages.cotisationsBp).toBe(2000);
    expect(supprimerMission(d, "m1").missions).toEqual([]);
    expect(refus(() => regler(d, { ...REGLAGES_DEFAUT, cotisationsBp: 9999 })).code).toBe("argument_invalide");
  });
});

describe("projections", () => {
  it("une mission → une prévision de net (429,43 €, le 16 octobre) chez Budget et un événement par jour chez l'Agenda", () => {
    const p = projections(avecMission(), AUJ);
    const budget = p.find((x) => x.service === "budget" && x.ref === "mission:m1");
    expect(budget?.contenu).toEqual([{ montantCents: 42_943, jour: "2026-10-16", libelle: "Mission Dupont (paie)" }]);
    const agenda = p.find((x) => x.service === "agenda" && x.ref === "mission:m1");
    expect(agenda?.contenu).toHaveLength(5);
    expect(agenda?.contenu[0]).toEqual({ type: "travail", titre: "Mission Dupont", jour: "2026-10-05", debutMin: 480, finMin: 900 });
  });

  it("l'empreinte est stable et change avec le contenu", () => {
    expect(empreinte([{ a: 1 }])).toBe(empreinte([{ a: 1 }]));
    expect(empreinte([{ a: 1 }])).not.toBe(empreinte([{ a: 2 }]));
  });
});

describe("transmission", () => {
  it("envoie une fois, avec une clé liée au contenu ; la fois suivante tout est à jour et rien ne part", async () => {
    const { appels, appeler } = faux();
    const un = await transmettre(avecMission(), AUJ, appeler);
    expect(un.rapport).toMatchObject({ envoyees: 2, aJour: 0, enAttente: 0, erreurs: [] });
    const fonctions = appels.map((a) => `${a.service}.${a.fonction}`).sort();
    expect(fonctions).toEqual(["agenda.evenements.remplacer", "budget.previsions.remplacer"]);
    expect(String(appels[0]?.args.cle)).toMatch(/^mission:m1@[0-9a-f]{8}$/);
    const avant = appels.length;
    const deux = await transmettre(un.donnees, AUJ, appeler);
    expect(deux.rapport).toMatchObject({ envoyees: 0, aJour: 2 });
    expect(appels).toHaveLength(avant);
  });

  it("une modification est renvoyée (nouvelle clé), l'autre groupe reste à jour", async () => {
    const { appels, appeler } = faux();
    const un = await transmettre(avecMission(), AUJ, appeler);
    const modifie = modifierMission(un.donnees, "m1", { ...brutMission, tauxHoraireCents: 1400 });
    appels.length = 0;
    const deux = await transmettre(modifie, AUJ, appeler);
    // Le taux change le net (Budget) mais pas les jours travaillés (Agenda).
    expect(deux.rapport).toMatchObject({ envoyees: 1, aJour: 1 });
    expect(appels.map((a) => a.service)).toEqual(["budget"]);
  });

  it("Budget absent : Paie ne plante pas, le compte « en attente » le dit, l'Agenda part quand même", async () => {
    const { appels, appeler } = faux({ budget: { ok: false, code: "service_absent", message: "x" } });
    const r = await transmettre(avecMission(), AUJ, appeler);
    expect(r.rapport.envoyees).toBe(1);
    expect(r.rapport.enAttente).toBe(1);
    expect(r.rapport.indisponibles).toEqual([{ service: "budget", message: expect.stringContaining("Installez Budget") }]);
    expect(appels.filter((a) => a.service === "budget")).toHaveLength(1);
    // Réparable en rejouant : une fois Budget installé, il reçoit ce qui manquait.
    const rejeu = faux();
    const suite = await transmettre(r.donnees, AUJ, rejeu.appeler);
    expect(suite.rapport).toMatchObject({ envoyees: 1, aJour: 1, enAttente: 0 });
  });

  it("un refus de fond (argument invalide) est un défaut à corriger, pas une indisponibilité", async () => {
    const { appeler } = faux({ budget: { ok: false, code: "argument_invalide", message: "Montant refusé." } });
    const r = await transmettre(avecMission(), AUJ, appeler);
    expect(r.rapport.erreurs).toEqual([{ ref: "mission:m1", service: "budget", message: "Montant refusé." }]);
    expect(r.rapport.indisponibles).toEqual([]);
  });

  it("une mission supprimée est retirée chez Budget et chez l'Agenda", async () => {
    const { appels, appeler } = faux();
    const un = await transmettre(avecMission(), AUJ, appeler);
    appels.length = 0;
    const deux = await transmettre(supprimerMission(un.donnees, "m1"), AUJ, appeler);
    expect(appels.map((a) => `${a.service}.${a.fonction}`).sort()).toEqual(["agenda.evenements.supprimer", "budget.previsions.supprimer"]);
    expect(deux.donnees.transmis).toEqual({});
  });
});

describe("net reçu", () => {
  const saisie = { ref: "mission:m1", netCents: 43_000, jour: "2026-10-16", compteId: "c1", libelle: "Mission Dupont", jourPrevu: "2026-10-16" };
  const maintenant = Date.parse("2026-10-16T15:00:00Z");

  it("écrit dans Finances, marque la prévision réalisée chez Budget, enregistre le bulletin", async () => {
    const { appels, appeler } = faux({ finances: { ok: true, valeur: { id: "e12", rejoue: false } } });
    const r = await saisirNetRecu(avecMission(), saisie, appeler, maintenant);
    expect(appels.map((a) => `${a.service}.${a.fonction}`)).toEqual(["finances.ecritures.ajouter", "budget.previsions.realiser"]);
    expect(appels[0]?.args).toMatchObject({ compteId: "c1", montantCents: 43_000, cle: "paie-mission:m1-2026-10-16" });
    expect(appels[1]?.args).toEqual({ ref: "mission:m1", jour: "2026-10-16", ecritureId: "e12" });
    expect(r.donnees.bulletins["mission:m1"]).toEqual({ netCents: 43_000, jour: "2026-10-16", ecritureId: "e12" });
    expect(r.avertissements).toEqual([]);
  });

  it("après le bulletin, Budget n'a plus rien d'attendu pour cette mission (pas de double compte)", async () => {
    const { appeler } = faux();
    const { donnees } = await saisirNetRecu(avecMission(), saisie, appeler, maintenant);
    expect(projections(donnees, AUJ).find((p) => p.service === "budget" && p.ref === "mission:m1")?.contenu).toEqual([]);
  });

  it("Finances absent : le bulletin est quand même noté, avec un avertissement clair", async () => {
    const { appeler } = faux({ finances: { ok: false, code: "service_absent", message: "x" } });
    const r = await saisirNetRecu(avecMission(), saisie, appeler, maintenant);
    expect(r.donnees.bulletins["mission:m1"]?.ecritureId).toBeNull();
    expect(r.avertissements[0]).toContain("Installez Finances");
  });

  it("sans compte choisi : rien n'est écrit dans Finances, et on le dit", async () => {
    const { appels, appeler } = faux();
    const r = await saisirNetRecu(avecMission(), { ...saisie, compteId: null }, appeler, maintenant);
    expect(appels.map((a) => a.service)).toEqual(["budget"]);
    expect(r.avertissements[0]).toContain("Aucun compte");
  });

  it("une mission inconnue est refusée", async () => {
    const { appeler } = faux();
    await expect(saisirNetRecu(avecMission(), { ...saisie, ref: "mission:m9" }, appeler, maintenant)).rejects.toThrow(ErreurPaie);
  });
});
