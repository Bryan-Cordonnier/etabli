import { describe, expect, it } from "vitest";
import { controler, EXTENSIONS_FICHIER, LIMITES, nomFichierSur, type Contexte } from "./garde";
import { connues, estStrict, libelles, majeure } from "./permissions";

const strict = (permissions: string[] = [], provides: string[] = []): Contexte => ({ permissions, strict: true, provides });
const ancien: Contexte = { permissions: [], strict: false, provides: [] };

const fichier = { name: "piece.dxf", content: "0\nEOF", extension: "dxf", description: "Dessin DXF" };
const fiche = { kind: "Fiche", title: "t", subtitle: "", ident: [["Poste", "Scie"]], pages: ["<p>x</p>"] };

describe("forme des messages", () => {
  it.each([null, undefined, 3, "update", [], { type: 5 }, { data: 1 }])("refuse %j", (m) => {
    expect(controler(m, strict()).ok).toBe(false);
  });

  it("refuse un type inconnu ou emprunté au prototype", () => {
    expect(controler({ type: "rm -rf" }, strict()).ok).toBe(false);
    expect(controler({ type: "constructor" }, strict()).ok).toBe(false);
    expect(controler({ type: "__proto__" }, strict()).ok).toBe(false);
    expect(controler({ type: "toString" }, strict()).ok).toBe(false);
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
    ["print", { type: "print", fiche }, "impression"],
    ["saveFile", { type: "saveFile", file: fichier }, "fichiers"],
    ["send", { type: "send", kind: "piece-plate", data: {} }, "envoi"],
    ["openSettings", { type: "openSettings", plugin: "machines" }, "reglages"],
    ["addMachine", { type: "addMachine", kind: "ruban" }, "reglages"],
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

describe("fiches imprimées", () => {
  const imprimer = (f: object) => controler({ type: "print", fiche: f }, strict(["impression"]));

  it("accepte une fiche normale et refuse les formes invalides", () => {
    expect(imprimer(fiche).ok).toBe(true);
    expect(imprimer({ ...fiche, pages: "x" }).ok).toBe(false);
    expect(imprimer({ ...fiche, ident: [["a"]] }).ok).toBe(false);
    expect(imprimer({ ...fiche, ident: [["a", 1]] }).ok).toBe(false);
    expect(imprimer({ ...fiche, pages: new Array(LIMITES.pagesFiche + 1).fill("x") }).ok).toBe(false);
    expect(imprimer({ ...fiche, pages: ["x".repeat(LIMITES.pageFiche + 1)] }).ok).toBe(false);
    expect(imprimer({ ...fiche, css: "x".repeat(LIMITES.cssFiche + 1) }).ok).toBe(false);
  });
});

describe("autres messages", () => {
  it("contrôle les raccourcis, ancres et envois", () => {
    expect(controler({ type: "shortcut", key: "t", code: "KeyT", ctrl: true, shift: false, alt: false }, strict()).ok).toBe(true);
    expect(controler({ type: "shortcut", key: "x".repeat(41), ctrl: true, shift: false, alt: false }, strict()).ok).toBe(false);
    expect(controler({ type: "openSettings", plugin: "../x" }, strict(["reglages"])).ok).toBe(false);
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
    expect(libelles(["impression", "nimporte"])).toHaveLength(1);
  });
});
