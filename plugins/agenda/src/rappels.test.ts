// Rappels de l'Agenda : service `rappels@1`, rappels calculés (pars maintenant, coucher) et liste complète envoyée au téléphone.
// Les heures sont celles d'Europe/Paris (UTC+2 jusqu'au 25 octobre 2026, UTC+1 ensuite).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lireCarnet } from "./carnet";
import { HORIZON_MS, rappelsHoraires, rappelsPourLeMoteur } from "./rappels";
import { FONCTIONS_RAPPELS, executer, reponseRappels, type Execution } from "./service";
import { ErreurAgenda, type Carnet } from "./types";

// Lundi 5 octobre 2026, 10 h 00 à Paris = 08 h 00 UTC.
const MAINTENANT = Date.UTC(2026, 9, 5, 8, 0, 0);
const H = 3600_000;
const appel = (enregistre: unknown, fonction: string, args: unknown, appelant = "paie") => executer(enregistre, fonction, args, appelant, MAINTENANT);
const rappel = (id: string, dans: number, extra: object = {}) => ({ id, at: MAINTENANT + dans, titre: `Rappel ${id}`, ...extra });
const suite = (avant: unknown, r: Execution): unknown => r.carnet ?? avant;

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
  it("le service rappels, sa permission et ses fonctions sont dans le manifeste", () => {
    const m = JSON.parse(readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"));
    expect(Object.fromEntries(Object.entries(m.functions.rappels as Record<string, { acces: string }>).map(([k, v]) => [k, v.acces]))).toEqual(FONCTIONS_RAPPELS);
    expect(m.provides.rappels).toBe("1");
    expect(m.permissions).toContain("notifications");
  });
});

describe("rappels.remplacer", () => {
  it("garde les rappels du plugin appelant et demande l'envoi de la liste complète au téléphone", () => {
    const r = appel(null, "rappels.remplacer", { groupe: "paie", rappels: [rappel("m1", 2 * H, { texte: "Net attendu" })], cle: "k1" });
    expect(r.valeur).toEqual({ nombre: 1, rejoue: false });
    expect(r.hote).toBe("programmer");
    expect(r.courant.rappels.paie?.paie).toEqual([{ id: "m1", at: MAINTENANT + 2 * H, titre: "Rappel m1", texte: "Net attendu" }]);
  });

  it("remplacer un groupe ne touche ni aux autres groupes ni aux autres plugins", () => {
    let c: unknown = null;
    c = suite(c, appel(c, "rappels.remplacer", { groupe: "a", rappels: [rappel("x", H)], cle: "k1" }, "paie"));
    c = suite(c, appel(c, "rappels.remplacer", { groupe: "b", rappels: [rappel("y", H)], cle: "k2" }, "paie"));
    c = suite(c, appel(c, "rappels.remplacer", { groupe: "a", rappels: [rappel("z", 2 * H)], cle: "k3" }, "finances"));
    c = suite(c, appel(c, "rappels.remplacer", { groupe: "a", rappels: [rappel("w", 3 * H)], cle: "k4" }, "paie"));
    const tout = rappelsPourLeMoteur(lireCarnet(c), MAINTENANT).map((r) => r.id);
    expect(tout).toEqual(["paie/b/y", "finances/a/z", "paie/a/w"]);
  });

  it("rejouer la même clé ne change rien et rend la même réponse", () => {
    const un = appel(null, "rappels.remplacer", { groupe: "paie", rappels: [rappel("m1", H), rappel("m2", 2 * H)], cle: "k1" });
    const deux = appel(un.carnet, "rappels.remplacer", { groupe: "paie", rappels: [rappel("m1", H), rappel("m2", 2 * H)], cle: "k1" });
    expect(deux.valeur).toEqual({ nombre: 2, rejoue: true });
    expect(deux.carnet).toBeNull();
  });

  it("une liste vide supprime le groupe", () => {
    const un = appel(null, "rappels.remplacer", { groupe: "paie", rappels: [rappel("m1", H)], cle: "k1" });
    const deux = appel(un.carnet, "rappels.remplacer", { groupe: "paie", rappels: [], cle: "k2" });
    expect(rappelsPourLeMoteur(deux.courant, MAINTENANT)).toEqual([]);
  });

  it("refuse le passé, une alarme, un champ inconnu (ouvre), un titre vide, un doublon d'identifiant, trop de rappels", () => {
    const essai = (rappels: unknown[]) => refus(() => appel(null, "rappels.remplacer", { groupe: "g", rappels, cle: "k" })).code;
    expect(essai([rappel("a", -H)])).toBe("argument_invalide");
    expect(essai([rappel("a", H, { niveau: "alarme" })])).toBe("argument_invalide");
    expect(essai([rappel("a", H, { ouvre: "x" })])).toBe("argument_invalide");
    expect(essai([rappel("a", H, { titre: "" })])).toBe("argument_invalide");
    expect(essai([rappel("a", H), rappel("a", 2 * H)])).toBe("argument_invalide");
    expect(essai([rappel("a b", H)])).toBe("argument_invalide");
    expect(essai(Array.from({ length: 201 }, (_, i) => rappel(`r${i}`, H + i)))).toBe("limite_atteinte");
    expect(refus(() => appel(null, "rappels.remplacer", { groupe: "g h", rappels: [], cle: "k" })).code).toBe("argument_invalide");
  });

  it("au plus 200 rappels par plugin, tous groupes confondus", () => {
    const cent = (p: string) => Array.from({ length: 100 }, (_, i) => rappel(`${p}${i}`, H + i));
    let c: unknown = suite(null, appel(null, "rappels.remplacer", { groupe: "a", rappels: cent("a"), cle: "k1" }));
    c = suite(c, appel(c, "rappels.remplacer", { groupe: "b", rappels: cent("b"), cle: "k2" }));
    expect(refus(() => appel(c, "rappels.remplacer", { groupe: "c", rappels: [rappel("z", H)], cle: "k3" })).code).toBe("limite_atteinte");
    // Un autre plugin a son propre plafond.
    expect(appel(c, "rappels.remplacer", { groupe: "c", rappels: [rappel("z", H)], cle: "k4" }, "finances").valeur).toMatchObject({ nombre: 1 });
  });
});

describe("rappels.annuler et rappels.etat", () => {
  it("annule un groupe, seulement celui de l'appelant ; annuler deux fois est sans effet", () => {
    let c: unknown = suite(null, appel(null, "rappels.remplacer", { groupe: "g", rappels: [rappel("a", H)], cle: "k1" }, "paie"));
    expect(appel(c, "rappels.annuler", { groupe: "g" }, "finances").valeur).toEqual({ annules: 0 });
    const r = appel(c, "rappels.annuler", { groupe: "g" }, "paie");
    expect(r.valeur).toEqual({ annules: 1 });
    expect(r.hote).toBe("programmer");
    c = suite(c, r);
    const encore = appel(c, "rappels.annuler", { groupe: "g" }, "paie");
    expect(encore.valeur).toEqual({ annules: 0 });
    expect(encore.hote).toBeNull();
  });

  it("rappels.etat demande l'état au téléphone et ne change rien", () => {
    const r = appel(null, "rappels.etat", undefined);
    expect(r.hote).toBe("etat");
    expect(r.carnet).toBeNull();
  });
});

describe("réponse finale", () => {
  const envoi = appel(null, "rappels.remplacer", { groupe: "paie", rappels: [rappel("m1", H)], cle: "k1" });

  it("ajoute ce que le téléphone a programmé", () => {
    const r = { ok: true as const, autorise: true, alarmeExacte: true, programmes: 1, jusquau: MAINTENANT + HORIZON_MS };
    expect(reponseRappels(envoi, "rappels.remplacer", r, MAINTENANT)).toEqual({ nombre: 1, rejoue: false, programmes: 1, jusquau: MAINTENANT + HORIZON_MS });
  });

  it("notifications refusées ou PC : ce n'est pas une erreur, `programmes: 0` et la raison, les rappels restent gardés", () => {
    expect(reponseRappels(envoi, "rappels.remplacer", { ok: true, autorise: false, alarmeExacte: false, programmes: 0, jusquau: null }, MAINTENANT)).toMatchObject({ programmes: 0, raison: "notifications_refusees" });
    expect(reponseRappels(envoi, "rappels.remplacer", { ok: false, code: "telephone_seulement", message: "PC" }, MAINTENANT)).toMatchObject({ programmes: 0, jusquau: null, raison: "telephone_seulement" });
  });

  it("l'état rend les autorisations, l'horizon et le nombre de rappels gardés", () => {
    const etat = appel(envoi.carnet, "rappels.etat", {});
    const r = reponseRappels({ ...etat, courant: envoi.courant }, "rappels.etat", { ok: true, autorise: true, alarmeExacte: false, programmes: 1, jusquau: 123 }, MAINTENANT);
    expect(r).toEqual({ autorise: true, alarmeExacte: false, jusquau: 123, total: 1 });
  });

  it("les fonctions d'événements gardent leur contrat : aucun champ de rappel ajouté", () => {
    const ev = appel(null, "evenements.remplacer", { ref: "x", evenements: [{ type: "travail", titre: "M", jour: "2026-10-06", debutMin: 480, finMin: 960 }], cle: "k" }, "paie");
    expect(ev.hote).toBe("programmer");
    expect(reponseRappels(ev, "evenements.remplacer", { ok: true, autorise: true, alarmeExacte: true, programmes: 3, jusquau: 1 }, MAINTENANT)).toEqual({ ids: ["e1"], rejoue: false });
  });
});

describe("rappels calculés par l'Agenda", () => {
  // Mission le mardi 6 octobre à 8 h (Paris), trajet 30 min. Réglages de départ : marge 10, mise en route 10, préparation 45, sommeil 8 h,
  // endormissement 15, pré-alerte 5, rappel de coucher 30. Départ (décision) à 7 h 10 ; coucher à 22 h 10 la veille (-110 min).
  const avecTrajet = (extra: object = {}): Carnet =>
    appel(null, "evenements.remplacer", { ref: "x", evenements: [{ type: "travail", titre: "Mission", jour: "2026-10-06", debutMin: 480, finMin: 960, trajetMin: 30, ...extra }], cle: "k" }, "paie").courant;

  it("« pars dans 5 min » à 7 h 05, « pars maintenant » à 7 h 10, coucher à 21 h 40 la veille (heure de Paris)", () => {
    const r = rappelsHoraires(avecTrajet(), MAINTENANT);
    const par = Object.fromEntries(r.map((x) => [x.id.split(":")[0], x]));
    // 7 h 05 à Paris (UTC+2) = 05 h 05 UTC ; 7 h 10 → 05 h 10 UTC ; 21 h 40 le 5 octobre → 19 h 40 UTC.
    expect(par.pre?.at).toBe(Date.UTC(2026, 9, 6, 5, 5));
    expect(par.depart?.at).toBe(Date.UTC(2026, 9, 6, 5, 10));
    expect(par.coucher?.at).toBe(Date.UTC(2026, 9, 5, 19, 40));
    expect(par.pre).toMatchObject({ titre: "Pars dans 5 min", texte: "Mission" });
    expect(par.depart).toMatchObject({ titre: "Pars maintenant", texte: "Mission à 08:00" });
    expect(par.coucher).toMatchObject({ titre: "Coucher dans 30 min", texte: "Réveil à 06:25 pour « Mission »" });
  });

  it("sans trajet, aucun rappel ; désactivés dans les réglages, aucun rappel ; le passé est ignoré", () => {
    expect(rappelsHoraires(avecTrajet({ trajetMin: undefined }), MAINTENANT)).toEqual([]);
    expect(rappelsHoraires({ ...avecTrajet(), rappelsHoraires: false }, MAINTENANT)).toEqual([]);
    expect(rappelsHoraires(avecTrajet(), Date.UTC(2026, 9, 6, 6, 0))).toEqual([]);
  });

  it("deux événements avec trajet le même jour : un seul rappel de coucher", () => {
    const c = appel(null, "evenements.remplacer", {
      ref: "x",
      evenements: [
        { type: "travail", titre: "Matin", jour: "2026-10-06", debutMin: 480, finMin: 720, trajetMin: 30 },
        { type: "rdv", titre: "Après-midi", jour: "2026-10-06", debutMin: 840, finMin: 900, trajetMin: 20 },
      ],
      cle: "k",
    }).courant;
    const genres = rappelsHoraires(c, MAINTENANT).map((r) => r.id.split(":")[0]);
    expect(genres.filter((g) => g === "coucher")).toHaveLength(1);
    expect(genres.filter((g) => g === "depart")).toHaveLength(2);
  });

  it("la liste envoyée au téléphone réunit tout, du plus proche au plus lointain, sans dépasser 200", () => {
    let c: unknown = avecTrajet();
    c = suite(c, appel(c, "rappels.remplacer", { groupe: "paie", rappels: [rappel("m1", H)], cle: "k1" }, "paie"));
    const liste = rappelsPourLeMoteur(lireCarnet(c), MAINTENANT);
    expect(liste.map((r) => r.id.split("/")[0])).toEqual(["paie", "agenda", "agenda", "agenda"]);
    expect(liste.every((r, i) => i === 0 || liste[i - 1]!.at <= r.at)).toBe(true);
    const beaucoup = lireCarnet({ ...(c as Carnet), rappels: { x: { g: Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, at: MAINTENANT + (i + 1) * 60_000, titre: "t", texte: null })) } } });
    expect(rappelsPourLeMoteur(beaucoup, MAINTENANT)).toHaveLength(200);
  });

  it("un rappel de l'utilisateur (essai) part avec un identifiant accepté par le moteur, sans « @ »", () => {
    const c = lireCarnet(suite(null, executer(null, "rappels.remplacer", { groupe: "essai", rappels: [rappel("essai", H)], cle: "k" }, "@utilisateur", MAINTENANT)));
    expect(rappelsPourLeMoteur(c, MAINTENANT).map((r) => r.id)).toEqual(["utilisateur/essai/essai"]);
  });

  it("les identifiants envoyés au téléphone sont uniques et acceptés par la garde du moteur", () => {
    const c = lireCarnet(suite(avecTrajet(), appel(avecTrajet(), "rappels.remplacer", { groupe: "paie", rappels: [rappel("m1", H)], cle: "k1" }, "paie")));
    const ids = rappelsPourLeMoteur(c, MAINTENANT).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/);
  });
});

describe("carnet d'une version précédente", () => {
  it("un carnet sans rappels ni réglages de rappels se relit, avec les valeurs de départ", () => {
    const ancien = { schema: 1, evenements: [], reglages: { margeArriveeMin: 10, miseEnRouteMin: 10, preparationMin: 45, sommeilMin: 480, endormissementMin: 15, majorationTrajetBp: 0 }, dernierNumero: 0, cles: {} };
    const c = lireCarnet(ancien);
    expect(c.reglages.preAlerteMin).toBe(5);
    expect(c.reglages.rappelCoucherMin).toBe(30);
    expect(c.rappels).toEqual({});
    expect(c.rappelsHoraires).toBe(true);
  });

  it("des rappels abîmés sont une erreur, jamais un carnet vide", () => {
    expect(refus(() => lireCarnet({ ...lireCarnet(null), rappels: { paie: { g: [{ id: "x" }] } } })).code).toBe("illisible");
    expect(refus(() => lireCarnet({ ...lireCarnet(null), rappels: "oups" })).code).toBe("illisible");
  });
});
