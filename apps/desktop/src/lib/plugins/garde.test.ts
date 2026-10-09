import { describe, expect, it } from "vitest";
import { controler, EXTENSIONS_FICHIER, idAppel, LIMITES, nomFichierSur, type Contexte } from "./garde";
import { connues, estStrict, libelles, majeure, permissionAppel } from "./permissions";

const strict = (permissions: string[] = [], provides: string[] = []): Contexte => ({ permissions, strict: true, provides });
const ancien: Contexte = { permissions: [], strict: false, provides: [] };

const fichier = { name: "piece.dxf", content: "0\nEOF", extension: "dxf", description: "Dessin DXF" };

describe("forme des messages", () => {
  it.each([null, undefined, 3, "update", [], { type: 5 }, { data: 1 }])("refuse %j", (m) => {
    expect(controler(m, strict()).ok).toBe(false);
  });

  it("refuse un type inconnu ou emprunté au prototype", () => {
    expect(controler({ type: "rm -rf" }, strict()).ok).toBe(false);
    expect(controler({ type: "constructor" }, strict()).ok).toBe(false);
    expect(controler({ type: "__proto__" }, strict()).ok).toBe(false);
    expect(controler({ type: "toString" }, strict()).ok).toBe(false);
    // Retirés du moteur : un ancien plugin qui les enverrait est refusé comme tout type inconnu.
    expect(controler({ type: "print", fiche: {} }, strict(["impression"])).ok).toBe(false);
    expect(controler({ type: "addMachine", kind: "scie" }, strict(["reglages"])).ok).toBe(false);
  });

  it("accepte les messages simples et ne garde que les champs connus", () => {
    expect(controler({ type: "ready", extra: "x" }, strict())).toEqual({ ok: true, message: { type: "ready" } });
    expect(controler({ type: "title", title: "Mon calcul", pirate: 1 }, strict())).toEqual({ ok: true, message: { type: "title", title: "Mon calcul" } });
    expect(controler({ type: "update", data: { a: 1 } }, strict())).toEqual({ ok: true, message: { type: "update", data: { a: 1 } } });
  });

  it("borne la hauteur et refuse les valeurs absurdes", () => {
    expect(controler({ type: "height", value: 1e9 }, strict())).toEqual({ ok: true, message: { type: "height", value: LIMITES.hauteurMax } });
    expect(controler({ type: "height", value: -5 }, strict())).toEqual({ ok: true, message: { type: "height", value: LIMITES.hauteurMin } });
    for (const v of [NaN, Infinity, "300", null]) expect(controler({ type: "height", value: v }, strict()).ok).toBe(false);
  });

  it("refuse les textes trop longs et les types erronés", () => {
    expect(controler({ type: "title", title: "x".repeat(301) }, strict()).ok).toBe(false);
    expect(controler({ type: "notify", text: "x".repeat(LIMITES.texte + 1) }, strict()).ok).toBe(false);
    expect(controler({ type: "notify", text: { a: 1 } }, strict()).ok).toBe(false);
  });
});

describe("données", () => {
  it("refuse les données trop volumineuses", () => {
    const grosse = "x".repeat(LIMITES.donnees + 1);
    expect(controler({ type: "update", data: grosse }, strict()).ok).toBe(false);
    expect(controler({ type: "pluginData", data: grosse }, strict()).ok).toBe(false);
  });

  it("refuse les données circulaires (qui feraient échouer le moteur)", () => {
    const a: Record<string, unknown> = {};
    a.moi = a;
    expect(controler({ type: "update", data: a }, strict()).ok).toBe(false);
    expect(controler({ type: "update", data: 10n }, strict()).ok).toBe(false);
  });
});

describe("permissions", () => {
  const exigences: [string, object, string][] = [
    ["copy", { type: "copy", text: "a" }, "presse-papiers"],
    ["saveFile", { type: "saveFile", file: fichier }, "fichiers"],
    ["send", { type: "send", kind: "piece-plate", data: {} }, "envoi"],
    ["openSettings", { type: "openSettings", plugin: "machines" }, "reglages"],
    ["reminders", { type: "reminders", id: "r1", op: "state" }, "notifications"],
  ];

  it.each(exigences)("%s exige la permission en contrat strict", (_nom, message, permission) => {
    expect(controler(message, strict()).ok).toBe(false);
    expect(controler(message, strict(["autre"])).ok).toBe(false);
    expect(controler(message, strict([permission])).ok).toBe(true);
  });

  it.each(exigences)("%s reste permis pour un ancien plugin", (_nom, message) => {
    expect(controler(message, ancien).ok).toBe(true);
  });

  it("un ancien plugin est quand même soumis aux limites", () => {
    expect(controler({ type: "saveFile", file: { ...fichier, extension: "exe", name: "a.exe" } }, ancien).ok).toBe(false);
    expect(controler({ type: "update", data: "x".repeat(LIMITES.donnees + 1) }, ancien).ok).toBe(false);
  });

  it("provide exige un service déclaré", () => {
    expect(controler({ type: "provide", name: "fournisseurs", data: {} }, strict()).ok).toBe(false);
    expect(controler({ type: "provide", name: "fournisseurs", data: {} }, strict([], ["fournisseurs"])).ok).toBe(true);
    expect(controler({ type: "provide", name: "Fournisseurs", data: {} }, strict([], ["Fournisseurs"])).ok).toBe(false);
  });
});

describe("fichiers enregistrés", () => {
  const avec = (file: object) => controler({ type: "saveFile", file }, strict(["fichiers"]));

  it("accepte les formats d'export prévus", () => {
    for (const ext of EXTENSIONS_FICHIER) expect(avec({ ...fichier, name: `a.${ext}`, extension: ext }).ok).toBe(true);
  });

  it("refuse les extensions dangereuses, même déguisées", () => {
    for (const ext of ["exe", "bat", "cmd", "ps1", "lnk", "js", "html", "msi", "vbs", "scr", "dll", "jar", "hta"]) {
      expect(avec({ ...fichier, name: `a.${ext}`, extension: ext }).ok).toBe(false);
    }
    expect(avec({ ...fichier, name: "a.bat", extension: "dxf" }).ok).toBe(false);
    expect(avec({ ...fichier, name: "a.dxf.exe", extension: "dxf" }).ok).toBe(false);
  });

  it("refuse les noms avec chemin, caractères interdits, noms réservés ou cachés", () => {
    for (const nom of ["../a.dxf", "a/b.dxf", "a\\b.dxf", "C:a.dxf", "a:b.dxf", ".a.dxf", "con.dxf", "NUL.dxf", "a\u0000.dxf", "a|b.dxf", "a.dxf."]) {
      expect(avec({ ...fichier, name: nom }).ok, nom).toBe(false);
    }
    expect(nomFichierSur("virole-500.dxf")).toBe("virole-500.dxf");
    expect(nomFichierSur(" a.dxf ")).toBe("a.dxf");
    expect(nomFichierSur("")).toBeNull();
    expect(nomFichierSur("x".repeat(121))).toBeNull();
  });

  it("normalise l'extension en minuscules et refuse un contenu énorme", () => {
    const r = avec({ ...fichier, name: "A.DXF", extension: "DXF" });
    expect(r).toMatchObject({ ok: true, message: { file: { extension: "dxf" } } });
    expect(avec({ ...fichier, content: "x".repeat(LIMITES.fichier + 1) }).ok).toBe(false);
    expect(avec({ ...fichier, content: 5 }).ok).toBe(false);
  });
});

describe("autres messages", () => {
  it("contrôle les raccourcis, ancres et envois", () => {
    expect(controler({ type: "shortcut", key: "t", code: "KeyT", ctrl: true, shift: false, alt: false }, strict()).ok).toBe(true);
    expect(controler({ type: "shortcut", key: "x".repeat(41), ctrl: true, shift: false, alt: false }, strict()).ok).toBe(false);
    expect(controler({ type: "openSettings", plugin: "../x" }, strict(["reglages"])).ok).toBe(false);
    // openPage : sa propre page, aucune permission, mais un identifiant de page propre.
    expect(controler({ type: "openPage", page: "liste" }, strict([])).ok).toBe(true);
    for (const page of ["../x", "", "A B", 4, "x".repeat(70)]) expect(controler({ type: "openPage", page }, strict([])).ok, String(page)).toBe(false);
    expect(controler({ type: "openSettings", plugin: "machines", hash: "add=scie" }, strict(["reglages"])).ok).toBe(true);
    expect(controler({ type: "send", kind: "Pièce Plate", data: {} }, strict(["envoi"])).ok).toBe(false);
  });
});

describe("permissions du manifeste", () => {
  it("lit la version majeure d'un contrat", () => {
    expect(majeure("^1")).toBe(1);
    expect(majeure("^2.3.0")).toBe(2);
    expect(majeure(">=2")).toBe(2);
    expect(majeure(undefined)).toBe(1);
    expect(majeure("abc")).toBe(1);
    expect(estStrict("^2")).toBe(true);
    expect(estStrict("^1")).toBe(false);
  });

  it("ignore les permissions inconnues et les décrit en clair", () => {
    expect(connues(["fichiers", "root", "fichiers"])).toEqual(["fichiers"]);
    expect(libelles(["fichiers", "nimporte"])).toHaveLength(1);
  });
});

describe("appels de service : serviceCall", () => {
  const appelant = strict(["appelle:finances:ecriture"]);
  const appel = { type: "serviceCall", id: "c1", service: "finances", fn: "ecritures.ajouter", args: { montant: 1250 } };

  it("accepte un appel bien formé et ne garde que les champs connus", () => {
    expect(controler(appel, appelant)).toEqual({ ok: true, message: appel });
    const v = controler({ ...appel, caller: "banque", appelant: "banque", pluginId: "banque", timeoutMs: 2500.4 }, appelant);
    expect(v).toEqual({ ok: true, message: { ...appel, timeoutMs: 2500 } });
  });

  it("l'identité de l'appelant n'est jamais lue dans le message (usurpation)", () => {
    const v = controler({ ...appel, caller: "usurpe", appelant: "usurpe", from: "usurpe" }, appelant);
    expect(v.ok && JSON.stringify(v.message)).not.toContain("usurpe");
  });

  it("refuse sans permission d'appel pour ce service, avec le code à renvoyer", () => {
    for (const ctx of [strict(), strict(["appelle:agenda:lecture"]), strict(["fichiers"])]) {
      expect(controler(appel, ctx)).toMatchObject({ ok: false, code: "permission_refusee" });
    }
  });

  it("refuse l'appel d'un plugin de contrat ^1, même avec la permission écrite", () => {
    expect(controler(appel, { ...ancien, permissions: ["appelle:finances:ecriture"] })).toMatchObject({ ok: false, code: "permission_refusee" });
  });

  it("l'accès lecture ou écriture est jugé par le routage : le garde accepte l'un comme l'autre", () => {
    expect(controler(appel, strict(["appelle:finances:lecture"])).ok).toBe(true);
  });

  it.each([
    [{ id: "" }],
    [{ id: "a b" }],
    [{ id: "x".repeat(65) }],
    [{ id: 5 }],
    [{ service: "Finances" }],
    [{ service: "../autre" }],
    [{ service: "finances ecritures" }],
    [{ fn: "" }],
    [{ fn: "__proto__" }],
    [{ fn: "ecritures..ajouter" }],
    [{ fn: "Ecritures.ajouter" }],
    [{ fn: "ecritures.ajouter;drop" }],
    [{ fn: "a.b.c.d.e" }],
    [{ fn: 12 }],
    [{ timeoutMs: "5000" }],
    [{ timeoutMs: NaN }],
    [{ timeoutMs: Infinity }],
  ])("refuse un appel mal formé %j", (champs) => {
    expect(controler({ ...appel, ...champs }, appelant).ok).toBe(false);
  });

  it("ramène le délai dans ses bornes (100 ms à 10 s)", () => {
    expect(controler({ ...appel, timeoutMs: 1 }, appelant)).toMatchObject({ ok: true, message: { timeoutMs: 100 } });
    expect(controler({ ...appel, timeoutMs: 1e9 }, appelant)).toMatchObject({ ok: true, message: { timeoutMs: 10_000 } });
  });

  it("borne la taille des arguments et refuse les arguments circulaires", () => {
    expect(controler({ ...appel, args: "x".repeat(LIMITES.donnees + 1) }, appelant)).toMatchObject({ ok: false, code: "argument_invalide" });
    const a: Record<string, unknown> = {};
    a.a = a;
    expect(controler({ ...appel, args: a }, appelant)).toMatchObject({ ok: false, code: "argument_invalide" });
  });

  it("sans arguments, l'appel porte null", () => {
    const { args: _args, ...sans } = appel;
    expect(controler(sans, appelant)).toMatchObject({ ok: true, message: { args: null } });
  });

  it("idAppel retrouve l'identifiant d'un appel refusé, sinon rien", () => {
    expect(idAppel({ ...appel, fn: "__proto__" })).toBe("c1");
    expect(idAppel({ ...appel, id: "a b" })).toBeNull();
    expect(idAppel({ type: "notify", id: "c1" })).toBeNull();
    expect(idAppel(null)).toBeNull();
  });
});

describe("rappels sur le téléphone", () => {
  const rappel = { id: "paie/mission:m1", at: Date.UTC(2026, 9, 12, 6, 0), title: "Pars maintenant", text: "Mission Dupont" };
  const demande = (items: unknown) => ({ type: "reminders", id: "r1", op: "set", items });
  const permis = strict(["notifications"]);

  it("accepte une liste de rappels et ne garde que les champs connus", () => {
    const r = controler(demande([{ ...rappel, pirate: 1 }]), permis);
    expect(r).toEqual({ ok: true, message: { type: "reminders", id: "r1", op: "set", items: [rappel] } });
    expect(controler(demande([]), permis).ok).toBe(true);
  });

  it("refuse une demande mal formée : opération, identifiant, trop de rappels, doublon", () => {
    expect(controler({ type: "reminders", id: "r1", op: "tout-casser" }, permis).ok).toBe(false);
    expect(controler({ type: "reminders", id: "a b", op: "state" }, permis).ok).toBe(false);
    expect(controler({ type: "reminders", op: "state" }, permis).ok).toBe(false);
    expect(controler(demande("pas une liste"), permis).ok).toBe(false);
    expect(controler(demande(Array.from({ length: 201 }, (_, i) => ({ ...rappel, id: `r${i}` }))), permis).ok).toBe(false);
    expect(controler(demande(Array.from({ length: 200 }, (_, i) => ({ ...rappel, id: `r${i}` }))), permis).ok).toBe(true);
    expect(controler(demande([rappel, rappel]), permis).ok).toBe(false);
  });

  it("refuse un rappel invalide : instant, titre, texte, identifiant", () => {
    for (const mauvais of [
      { ...rappel, at: "demain" },
      { ...rappel, at: -1 },
      { ...rappel, at: 1.5 },
      { ...rappel, at: Infinity },
      { ...rappel, title: "" },
      { ...rappel, title: "x".repeat(121) },
      { ...rappel, text: "x".repeat(301) },
      { ...rappel, id: "../etc" },
      { ...rappel, id: "" },
      null,
    ]) {
      expect(controler(demande([mauvais]), permis).ok, JSON.stringify(mauvais)).toBe(false);
    }
  });

  it("le cadre de service du fournisseur peut programmer des rappels, avec la permission seulement", () => {
    const service = (permissions: string[]): Contexte => ({ permissions, strict: true, provides: ["agenda"], service: true });
    expect(controler(demande([rappel]), service(["notifications"])).ok).toBe(true);
    expect(controler(demande([rappel]), service([])).ok).toBe(false);
  });
});

describe("appels de service : cadre invisible du fournisseur", () => {
  const service: Contexte = { permissions: ["fichiers", "presse-papiers", "envoi", "reglages"], strict: true, provides: ["finances"], service: true };

  it("n'autorise que réglages, publication, signes de vie et réponses", () => {
    expect(controler({ type: "pluginData", data: { a: 1 } }, service).ok).toBe(true);
    expect(controler({ type: "provide", name: "finances", data: {} }, service).ok).toBe(true);
    expect(controler({ type: "ready" }, service).ok).toBe(true);
    expect(controler({ type: "height", value: 300 }, service).ok).toBe(true);
    expect(controler({ type: "serviceReady" }, service).ok).toBe(true);
  });

  it("refuse tout ce qui toucherait l'utilisateur ou le disque, même avec les permissions", () => {
    const interdits = [
      { type: "notify", text: "hameçonnage" },
      { type: "saveFile", file: fichier },
      { type: "copy", text: "x" },
      { type: "send", kind: "piece-plate", data: {} },
      { type: "openSettings", plugin: "machines" },
      { type: "update", data: {} },
      { type: "title", title: "t" },
      { type: "shortcut", key: "a", ctrl: true, shift: false, alt: false },
      { type: "serviceCall", id: "c1", service: "agenda", fn: "rappels.liste", args: null },
    ];
    for (const m of interdits) expect(controler(m, service).ok, m.type).toBe(false);
  });

  it("une page ordinaire ne peut pas se faire passer pour un cadre de service", () => {
    expect(controler({ type: "serviceReady" }, strict()).ok).toBe(false);
    expect(controler({ type: "serviceResult", id: "i1", result: { ok: true, valeur: 1 } }, strict()).ok).toBe(false);
  });

  it("valide la réponse : forme, taille, codes permis au fournisseur", () => {
    expect(controler({ type: "serviceResult", id: "i1", result: { ok: true, valeur: { total: 5 }, extra: 1 } }, service)).toEqual({
      ok: true,
      message: { type: "serviceResult", id: "i1", result: { ok: true, valeur: { total: 5 } } },
    });
    expect(controler({ type: "serviceResult", id: "i1", result: { ok: true } }, service)).toMatchObject({ ok: true, message: { result: { ok: true, valeur: null } } });
    expect(controler({ type: "serviceResult", id: "i1", result: { ok: false, code: "introuvable", message: "pas là" } }, service).ok).toBe(true);
    for (const code of ["service_absent", "contrat_incompatible", "delai_depasse", "profondeur_max", "n'importe quoi", 5]) {
      expect(controler({ type: "serviceResult", id: "i1", result: { ok: false, code, message: "x" } }, service).ok, String(code)).toBe(false);
    }
    expect(controler({ type: "serviceResult", id: "i1", result: { ok: false, code: "erreur", message: "x".repeat(LIMITES.messageErreur + 1) } }, service).ok).toBe(false);
    expect(controler({ type: "serviceResult", id: "i1", result: { ok: true, valeur: "x".repeat(LIMITES.donnees + 1) } }, service).ok).toBe(false);
    expect(controler({ type: "serviceResult", id: "i1", result: "ok" }, service).ok).toBe(false);
    expect(controler({ type: "serviceResult", id: "i1", result: { ok: "oui" } }, service).ok).toBe(false);
    expect(controler({ type: "serviceResult", id: "a b", result: { ok: true, valeur: 1 } }, service).ok).toBe(false);
  });
});

describe("permissions d'appel", () => {
  it("reconnaît appelle:<service>:<accès> et rien d'autre", () => {
    expect(permissionAppel("appelle:finances:ecriture")).toEqual({ service: "finances", acces: "ecriture" });
    expect(permissionAppel("appelle:agenda:lecture")).toEqual({ service: "agenda", acces: "lecture" });
    for (const p of ["appelle:finances", "appelle:finances:tout", "appelle::lecture", "appelle:Finances:lecture", "appelle:a:b:lecture", " appelle:a:lecture", "appelle:finances:lecture\n"]) {
      expect(permissionAppel(p), p).toBeNull();
    }
  });

  it("garde les permissions d'appel dans `connues`, sans doublon, et écarte le reste", () => {
    expect(connues(["fichiers", "appelle:finances:lecture", "appelle:finances:lecture", "appelle:x:admin", "inconnue"])).toEqual(["fichiers", "appelle:finances:lecture"]);
  });

  it("écrit une phrase par permission d'appel, avec le nom du fournisseur si on le connaît", () => {
    const l = libelles(["appelle:finances:ecriture", "appelle:agenda:lecture", "fichiers"], (s) => (s === "agenda" ? "Agenda" : undefined));
    expect(l).toEqual([
      "Enregistrer des fichiers (CSV, ICS…) à l'endroit que vous choisissez",
      "Lire des données dans le service « agenda » du plugin Agenda",
      "Ajouter ou modifier des données dans le service « finances » d'un autre plugin",
    ]);
  });
});
