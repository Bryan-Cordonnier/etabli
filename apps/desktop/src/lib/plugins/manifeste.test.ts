import { describe, expect, it } from "vitest";
import type { ParameterManifest } from "../types";
import { appsDe, pagesDe, parametresDe, raisonDeRefus, valeurValide, valeursDe, widgetsDe } from "./manifeste";

describe("widgetsDe", () => {
  const apps = appsDe([{ id: "resume", name: "Résumé", entry: "apps/resume/index.html" }]);

  it("garde les widgets d'une app qui existe, avec des tailles valables", () => {
    const w = widgetsDe(
      [
        { id: "estime", title: "Estimé", icon: "wallet", app: "resume", sizes: ["2x1", "9x9", "2x2", "2x1"], default: "2x2" },
        { id: "sans-app", title: "x", app: "absente", sizes: ["1x1"] },
        { id: "sans-taille", title: "x", app: "resume", sizes: ["grand"] },
        { id: "estime", title: "Doublon", app: "resume", sizes: ["1x1"] },
      ],
      apps,
    );
    expect(w).toEqual([{ id: "estime", title: "Estimé", icon: "wallet", app: "resume", sizes: ["2x1", "2x2"], default: "2x2" }]);
  });

  it("la taille par défaut est la première si elle n'est pas dans la liste", () => {
    expect(widgetsDe([{ id: "a", app: "resume", sizes: ["1x1", "4x2"], default: "3x3" }], apps)[0]?.default).toBe("1x1");
  });

  it("renvoie une liste vide si ce n'est pas une liste", () => {
    expect(widgetsDe(undefined, apps)).toEqual([]);
  });
});

describe("appsDe", () => {
  it("garde les apps à identifiant et à page d'entrée valides, sans doublon", () => {
    const apps = appsDe([
      { id: "courbe", name: "Courbe", entry: "apps/courbe/index.html", accepts: ["piece-plate"] },
      { id: "courbe", name: "Doublon", entry: "apps/autre/index.html" },
      { id: "Mauvais Id", name: "x", entry: "apps/x/index.html" },
      { id: "sans-entree", name: "x" },
      { id: "dehors", name: "x", entry: "../secret.html" },
      { id: "absolu", name: "x", entry: "/etc/passwd" },
    ]);
    expect(apps).toEqual([{ id: "courbe", name: "Courbe", entry: "apps/courbe/index.html", accepts: ["piece-plate"] }]);
  });

  it("renvoie une liste vide si ce n'est pas une liste", () => {
    expect(appsDe(undefined)).toEqual([]);
    expect(appsDe({ id: "a" })).toEqual([]);
  });
});

describe("pagesDe", () => {
  const apps = appsDe([{ id: "courbe", name: "Courbe", entry: "apps/courbe/index.html" }]);

  it("garde les pages qui affichent une app qui existe", () => {
    const pages = pagesDe(
      [
        { id: "mois", title: "Ce mois-ci", icon: "wallet", layout: { type: "app", app: "courbe" } },
        { id: "fantome", title: "Fantôme", icon: "wallet", layout: { type: "app", app: "inconnue" } },
        { id: "colonnes", title: "Colonnes", icon: "wallet", layout: { type: "columns", apps: ["courbe"] } },
        { id: "mois", title: "Doublon", icon: "wallet", layout: { type: "app", app: "courbe" } },
      ],
      apps,
    );
    expect(pages.map((p) => p.id)).toEqual(["mois"]);
    expect(pages[0]).toMatchObject({ title: "Ce mois-ci", icon: "wallet", app: "courbe" });
  });

  it("remplace une icône inconnue par l'icône par défaut", () => {
    const pages = pagesDe([{ id: "p", title: "P", icon: "n-existe-pas", layout: { type: "app", app: "courbe" } }], apps);
    expect(pages[0]?.icon).toBe("puzzle");
  });
});

describe("parametresDe", () => {
  it("lit les cinq types et leurs valeurs par défaut", () => {
    const defs = parametresDe([
      { id: "ifm", label: "Indemnité", type: "number", default: 10, unit: "%", min: 0, max: 100, step: 0.5, group: "Intérim", hint: "légal" },
      { id: "nom", label: "Nom", type: "text", default: "Bryan" },
      { id: "report", label: "Report", type: "boolean", default: true },
      { id: "lever", label: "Lever", type: "time", default: "07:30" },
      { id: "jour", label: "Jour", type: "select", default: "6", options: [{ value: "0", label: "dimanche" }, { value: "6", label: "samedi" }] },
    ]);
    expect(defs.map((d) => d.type)).toEqual(["number", "text", "boolean", "time", "select"]);
    expect(defs[0]).toMatchObject({ default: 10, unit: "%", min: 0, max: 100, step: 0.5, group: "Intérim", hint: "légal" });
    expect(defs[3]).toMatchObject({ default: "07:30" });
  });

  it("ignore les paramètres illisibles, en double ou à type inconnu", () => {
    const defs = parametresDe([
      { id: "ok", label: "Ok", type: "number", default: 1 },
      { id: "ok", label: "Doublon", type: "number", default: 2 },
      { id: "Mauvais", label: "x", type: "number" },
      { id: "inconnu", label: "x", type: "couleur" },
      { id: "vide", label: "x", type: "select", options: [] },
      "pas un objet",
    ]);
    expect(defs.map((d) => d.id)).toEqual(["ok"]);
  });

  it("corrige les valeurs par défaut incohérentes", () => {
    const [heure, choix, pas] = parametresDe([
      { id: "heure", label: "h", type: "time", default: "25:99" },
      { id: "choix", label: "c", type: "select", default: "z", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
      { id: "pas", label: "p", type: "number", default: 3, step: -2 },
    ]) as ParameterManifest[];
    expect(heure?.default).toBe("00:00");
    expect(choix?.default).toBe("a");
    expect(pas).toMatchObject({ default: 3, step: 1 });
  });
});

describe("valeurValide et valeursDe", () => {
  const defs = parametresDe([
    { id: "ifm", label: "Indemnité", type: "number", default: 10, min: 0, max: 100 },
    { id: "lever", label: "Lever", type: "time", default: "08:00" },
    { id: "report", label: "Report", type: "boolean", default: false },
    { id: "jour", label: "Jour", type: "select", default: "6", options: [{ value: "6", label: "samedi" }, { value: "0", label: "dimanche" }] },
  ]);

  it("refuse ce qui sort des bornes ou du type, et rend la valeur par défaut", () => {
    expect(valeurValide(defs[0]!, 12.5)).toBe(12.5);
    expect(valeurValide(defs[0]!, 150)).toBe(10);
    expect(valeurValide(defs[0]!, -1)).toBe(10);
    expect(valeurValide(defs[0]!, Number.NaN)).toBe(10);
    expect(valeurValide(defs[0]!, "12")).toBe(10);
    expect(valeurValide(defs[1]!, "25:00")).toBe("08:00");
    expect(valeurValide(defs[2]!, "oui")).toBe(false);
    expect(valeurValide(defs[3]!, "1")).toBe("6");
  });

  it("complète avec les valeurs par défaut et ne se laisse pas piéger par un nom comme « constructor »", () => {
    const v = valeursDe(defs, { ifm: 20, lever: "06:30", constructor: "x", __proto__: { ifm: 99 } });
    expect(v).toEqual({ ifm: 20, lever: "06:30", report: false, jour: "6" });
    expect(Object.getPrototypeOf(v)).toBeNull();
  });

  it("accepte l'absence totale de valeurs enregistrées", () => {
    expect(valeursDe(defs, null)).toEqual({ ifm: 10, lever: "08:00", report: false, jour: "6" });
  });
});

describe("raisonDeRefus", () => {
  it("exige le contrat 3 et une liste « pages » (même vide) et « apps »", () => {
    expect(raisonDeRefus({ apiVersion: "^2", pages: [], apps: [] }, 2)).toMatch(/\^3/);
    expect(raisonDeRefus({ apiVersion: "^3", apps: [] }, 3)).toMatch(/pages/);
    expect(raisonDeRefus({ apiVersion: "^3", pages: [] }, 3)).toMatch(/apps/);
    expect(raisonDeRefus({ apiVersion: "^3", pages: [], apps: [] }, 3)).toBeNull();
  });
});
