// Le plan, ses opérations, le service `budget@1` et le lien avec Finances : idempotence, espace propre, refus stricts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chargerFinances, confirmer, messageIndisponible, type Appeler, type Reponse } from "./finances";
import { abandonner, creerAbonnement, creerVirement, fixerEnveloppe, realiser, supprimerAbonnement, supprimerVirement } from "./operations";
import { lirePlan, planVide, synchroniser } from "./plan";
import { FONCTIONS, executer } from "./service";
import { ErreurBudget, type Plan } from "./types";

const AUJ = "2026-10-05";
const ligne = { montantCents: 42_943, jour: "2026-10-10", libelle: "Paie mission", compteId: "c1" };
const appel = (enregistre: unknown, fonction: string, args: unknown, appelant = "paie") => executer(enregistre, fonction, args, appelant);
const suite = (avant: unknown, r: { plan: Plan | null }): unknown => r.plan ?? avant;

function refus(f: () => unknown): ErreurBudget {
  try {
    f();
  } catch (e) {
    if (e instanceof ErreurBudget) return e;
    throw e;
  }
  throw new Error("Un refus était attendu.");
}

describe("manifeste", () => {
  it("les fonctions et leur niveau d'accès sont ceux du manifeste, et Finances est une dépendance obligatoire", () => {
    const m = JSON.parse(readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"));
    expect(Object.fromEntries(Object.entries(m.functions.budget as Record<string, { acces: string }>).map(([k, v]) => [k, v.acces]))).toEqual(FONCTIONS);
    expect(m.dependencies.finances).toBe("^1");
    expect(m.permissions).toContain("appelle:finances:ecriture");
  });
});

describe("plan", () => {
  it("rien d'enregistré : plan vide ; données illisibles : erreur, jamais un plan vide", () => {
    expect(lirePlan(null)).toEqual(planVide());
    expect(refus(() => lirePlan({ schema: 2 })).code).toBe("illisible");
    expect(refus(() => lirePlan("n'importe quoi")).code).toBe("illisible");
    expect(refus(() => appel({ schema: 9 }, "previsions.liste", {})).code).toBe("illisible");
  });

  it("un plan écrit par le service se relit à l'identique", () => {
    const r = appel(null, "previsions.remplacer", { ref: "mission:1", previsions: [ligne], cle: "k1" });
    expect(lirePlan(r.plan)).toEqual(r.plan);
  });
});

describe("previsions.remplacer", () => {
  it("pose les prévisions avec l'appelant comme source", () => {
    const r = appel(null, "previsions.remplacer", { ref: "mission:1", previsions: [ligne], cle: "k1" });
    expect(r.valeur).toEqual({ ids: ["p1"], rejoue: false });
    expect(r.plan?.previsions[0]?.source).toEqual({ plugin: "paie", ref: "mission:1" });
  });

  it("rejouer la même clé ne crée aucun doublon", () => {
    const un = appel(null, "previsions.remplacer", { ref: "mission:1", previsions: [ligne], cle: "k1" });
    const deux = appel(un.plan, "previsions.remplacer", { ref: "mission:1", previsions: [ligne], cle: "k1" });
    expect(deux.valeur).toEqual({ ids: ["p1"], rejoue: true });
    expect(deux.plan).toBeNull();
  });

  it("remplace les attendues du groupe, garde les réalisées et les autres groupes", () => {
    let c: unknown = null;
    c = suite(c, appel(c, "previsions.remplacer", { ref: "m1", previsions: [ligne, { ...ligne, jour: "2026-10-17" }], cle: "k1" }));
    c = suite(c, appel(c, "previsions.remplacer", { ref: "m2", previsions: [{ ...ligne, libelle: "Autre" }], cle: "k2" }));
    c = suite(c, appel(c, "previsions.realiser", { ref: "m1", jour: "2026-10-10", ecritureId: "e7" }));
    c = suite(c, appel(c, "previsions.remplacer", { ref: "m1", previsions: [{ ...ligne, jour: "2026-10-24", libelle: "Nouvelle" }], cle: "k3" }));
    const l = lirePlan(c).previsions.map((p) => `${p.libelle}:${p.jour}:${p.statut}`).sort();
    expect(l).toEqual(["Autre:2026-10-10:attendue", "Nouvelle:2026-10-24:attendue", "Paie mission:2026-10-10:realisee"]);
  });

  it("espace propre : un plugin ne touche pas aux prévisions d'un autre, même avec la même référence", () => {
    let c: unknown = null;
    c = suite(c, appel(c, "previsions.remplacer", { ref: "x", previsions: [ligne], cle: "k1" }, "paie"));
    c = suite(c, appel(c, "previsions.remplacer", { ref: "x", previsions: [], cle: "k2" }, "autre"));
    expect(lirePlan(c).previsions).toHaveLength(1);
    const s = appel(c, "previsions.supprimer", { ref: "x" }, "autre");
    expect(s.valeur).toEqual({ supprimees: 0 });
    expect(s.plan).toBeNull();
    expect(appel(c, "previsions.realiser", { ref: "x" }, "autre").valeur).toEqual({ realisees: 0 });
  });

  it("previsions.realiser : sans jour, toutes les attendues du groupe ; avec jour, celles de ce jour", () => {
    let c: unknown = suite(null, appel(null, "previsions.remplacer", { ref: "x", previsions: [ligne, { ...ligne, jour: "2026-10-17" }, { ...ligne, jour: "2026-10-24" }], cle: "k1" }));
    expect(appel(c, "previsions.realiser", { ref: "x", jour: "2026-10-17" }).valeur).toEqual({ realisees: 1 });
    c = suite(c, appel(c, "previsions.realiser", { ref: "x", jour: "2026-10-17" }));
    expect(appel(c, "previsions.realiser", { ref: "x" }).valeur).toEqual({ realisees: 2 });
  });

  it("refuse un champ inconnu, un montant nul ou à virgule, un jour inexistant, trop de lignes", () => {
    const essai = (p: unknown) => refus(() => appel(null, "previsions.remplacer", { ref: "x", previsions: [p], cle: "k" })).code;
    expect(essai({ ...ligne, rappel: true })).toBe("argument_invalide");
    expect(essai({ ...ligne, montantCents: 0 })).toBe("argument_invalide");
    expect(essai({ ...ligne, montantCents: 12.5 })).toBe("argument_invalide");
    expect(essai({ ...ligne, jour: "2026-02-30" })).toBe("argument_invalide");
    const trop = Array.from({ length: 501 }, () => ligne);
    expect(refus(() => appel(null, "previsions.remplacer", { ref: "x", previsions: trop, cle: "k" })).code).toBe("limite_atteinte");
    expect(refus(() => appel(null, "previsions.exploser", {})).code).toBe("introuvable");
  });
});

describe("previsions.liste", () => {
  const avec = appel(null, "previsions.remplacer", { ref: "x", previsions: [ligne, { ...ligne, jour: "2026-10-03", libelle: "Avant" }, { ...ligne, jour: "2026-10-20", compteId: "c2" }], cle: "k" }).plan;

  it("fenêtre, compte, source et statut ; ordre par jour ; la clé d'idempotence n'est pas rendue", () => {
    const r = appel(avec, "previsions.liste", { du: "2026-10-05", au: "2026-10-31", compteId: "c1" }).valeur as { previsions: Record<string, unknown>[] };
    expect(r.previsions.map((p) => p.jour)).toEqual(["2026-10-10"]);
    expect(r.previsions[0]).toMatchObject({ source: "paie", ref: "x", statut: "attendue" });
    const tout = appel(avec, "previsions.liste", {}).valeur as { previsions: { jour: string }[] };
    expect(tout.previsions.map((p) => p.jour)).toEqual(["2026-10-03", "2026-10-10", "2026-10-20"]);
    expect(appel(avec, "previsions.liste", { statut: "realisee" }).valeur).toEqual({ previsions: [] });
  });

  it("refuse une fenêtre à l'envers ou de plus de 5 ans, et un curseur inventé", () => {
    expect(refus(() => appel(avec, "previsions.liste", { du: "2026-10-08", au: "2026-10-06" })).code).toBe("argument_invalide");
    expect(refus(() => appel(avec, "previsions.liste", { du: "2020-01-01", au: "2026-01-01" })).code).toBe("limite_atteinte");
    expect(refus(() => appel(avec, "previsions.liste", { curseur: "abc" })).code).toBe("argument_invalide");
  });
});

describe("virements et abonnements", () => {
  const virement = { libelle: "Épargne", montantCents: 25_000, compteSourceId: "c1", compteCibleId: "c2", jour: "2026-10-05", repetition: { frequence: "mois", jusquau: "2027-03-05" } };

  it("un virement mensuel crée deux prévisions par échéance (sortie du compte source, entrée sur la cible)", () => {
    const { plan } = creerVirement(planVide(), virement, AUJ);
    const oct = plan.previsions.filter((p) => p.jour === "2026-10-05");
    expect(oct.map((p) => [p.compteId, p.montantCents])).toEqual([["c1", -25_000], ["c2", 25_000]]);
    // D'octobre à mars : 6 échéances dans la fenêtre (horizon de 180 jours), deux lignes chacune.
    expect(new Set(plan.previsions.map((p) => p.jour)).size).toBe(6);
    expect(plan.previsions.every((p) => p.source.plugin === "@budget" && p.source.ref === "virement:v1")).toBe(true);
  });

  it("refuse un virement vers le même compte", () => {
    expect(refus(() => creerVirement(planVide(), { ...virement, compteCibleId: "c1" }, AUJ)).code).toBe("argument_invalide");
  });

  it("resynchroniser n'ajoute rien de nouveau et ne ressuscite pas ce qui a été abandonné", () => {
    let { plan } = creerVirement(planVide(), virement, AUJ);
    expect(synchroniser(plan, AUJ)).toBe(plan);
    const premiere = plan.previsions[0]!;
    plan = abandonner(plan, premiere.id);
    const apres = synchroniser(plan, AUJ);
    expect(apres.previsions.filter((p) => p.statut === "abandonnee")).toHaveLength(1);
    expect(apres.previsions).toHaveLength(plan.previsions.length);
  });

  it("supprimer un virement retire les échéances attendues et garde l'historique réalisé", () => {
    let { plan } = creerVirement(planVide(), virement, AUJ);
    plan = realiser(plan, plan.previsions[0]!.id, "e1");
    plan = supprimerVirement(plan, "v1");
    expect(plan.virements).toEqual([]);
    expect(plan.previsions.map((p) => p.statut)).toEqual(["realisee"]);
  });

  it("un abonnement mensuel crée une sortie par mois ; la suppression retire les échéances attendues", () => {
    const { plan } = creerAbonnement(planVide(), { libelle: "Forfait", montantCents: 999, periodicite: "mois", jour: "2026-10-12", categorieId: "k1" }, AUJ);
    expect(plan.previsions.map((p) => p.jour)).toEqual(["2026-10-12", "2026-11-12", "2026-12-12", "2027-01-12", "2027-02-12", "2027-03-12"]);
    expect(plan.previsions.every((p) => p.montantCents === -999 && p.categorieId === "k1")).toBe(true);
    expect(supprimerAbonnement(plan, "a1").previsions).toEqual([]);
  });

  it("réaliser ou abandonner deux fois la même prévision est refusé", () => {
    let { plan } = creerVirement(planVide(), virement, AUJ);
    const id = plan.previsions[0]!.id;
    plan = realiser(plan, id, "e1");
    expect(refus(() => abandonner(plan, id)).code).toBe("argument_invalide");
    expect(refus(() => realiser(plan, "p999", null)).code).toBe("introuvable");
  });

  it("un plafond nul retire l'enveloppe", () => {
    let plan = fixerEnveloppe(planVide(), "k1", 40_000);
    expect(plan.enveloppes).toEqual([{ categorieId: "k1", plafondCents: 40_000 }]);
    plan = fixerEnveloppe(plan, "k1", null);
    expect(plan.enveloppes).toEqual([]);
  });
});

describe("Finances", () => {
  const ok = <T>(valeur: T): Reponse => ({ ok: true, valeur });

  it("charge comptes, catégories, solde total et sorties du mois (comptes archivés exclus du solde)", async () => {
    const appels: string[] = [];
    const appeler: Appeler = async (fonction, args) => {
      appels.push(fonction);
      if (fonction === "comptes.liste") return ok([{ id: "c1", nom: "Courant", archive: false }, { id: "c2", nom: "Vieux", archive: true }]);
      if (fonction === "categories.liste") return ok([{ id: "k1", nom: "Courses", sens: "sortie" }]);
      if (fonction === "soldes.aLaDate") {
        expect(args).toEqual({ jour: AUJ, comptes: ["c1"] });
        return ok({ c1: 123_456 });
      }
      if (fonction === "totaux.parCategorie") {
        expect(args).toEqual({ du: "2026-10-01", au: "2026-10-31", sens: "sortie" });
        return ok([{ categorieId: "k1", cents: -4_000 }]);
      }
      throw new Error(fonction);
    };
    const r = await chargerFinances(appeler, AUJ);
    expect(r).toMatchObject({ ok: true, donnees: { soldeCents: 123_456, sortiesDuMois: [{ categorieId: "k1", cents: -4_000 }] } });
    expect(appels).toEqual(["comptes.liste", "categories.liste", "soldes.aLaDate", "totaux.parCategorie"]);
  });

  it("Finances absent : une phrase qui dit quoi faire", async () => {
    const r = await chargerFinances(async () => ({ ok: false, code: "service_absent", message: "x" }), AUJ);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(messageIndisponible(r.code, r.message)).toContain("installez-le");
  });

  const prevision = { id: "p7", jour: "2026-10-05", montantCents: -1_250, compteId: "c1", categorieId: "k1", libelle: "Courses", source: { plugin: "@utilisateur", ref: "ui" }, statut: "attendue" as const, ecritureId: null };
  const midi = Date.parse("2026-10-05T14:00:00Z");

  it("confirmer ajoute l'écriture avec une clé d'idempotence liée à la prévision et rend son identifiant", async () => {
    let recu: unknown;
    const r = await confirmer(async (f, a) => ((recu = a), ok({ id: "e42", rejoue: false })), prevision, midi);
    expect(r).toEqual({ ok: true, ecritureId: "e42" });
    expect(recu).toMatchObject({ compteId: "c1", montantCents: -1_250, libelle: "Courses", categorieId: "k1", cle: "budget-p7", ref: "budget:p7" });
    expect((recu as { quand: number }).quand).toBeLessThanOrEqual(midi);
  });

  it("confirmer refuse sans compte et avant le jour prévu, sans appeler Finances", async () => {
    let appels = 0;
    const compte = async () => (appels++, ok({ id: "e1" }));
    expect(await confirmer(compte, { ...prevision, compteId: null }, midi)).toMatchObject({ ok: false, code: "argument_invalide" });
    expect(await confirmer(compte, { ...prevision, jour: "2026-10-06" }, midi)).toMatchObject({ ok: false, code: "argument_invalide" });
    expect(appels).toBe(0);
  });

  it("une erreur de Finances est rendue telle quelle", async () => {
    expect(await confirmer(async () => ({ ok: false, code: "introuvable", message: "Compte introuvable." }), prevision, midi)).toEqual({ ok: false, code: "introuvable", message: "Compte introuvable." });
  });
});
