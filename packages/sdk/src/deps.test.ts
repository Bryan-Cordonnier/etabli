import { describe, expect, it } from "vitest";
import {
  compareVersions,
  dependentsOf,
  optionalDependentsOf,
  planInstall,
  problemsOf,
  satisfies,
  type DepNode,
  type InstalledNode,
} from "./deps";

describe("compareVersions", () => {
  it("compare numériquement, pas comme du texte", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("0.3.0", "0.3.1")).toBeLessThan(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("v2.0.0-beta", "2.0.0")).toBe(0);
  });
});

describe("satisfies", () => {
  it("accepte tout avec * ou une plage vide", () => {
    expect(satisfies("7.1.0", "*")).toBe(true);
    expect(satisfies("7.1.0", "")).toBe(true);
  });

  it("^ : même version majeure", () => {
    expect(satisfies("1.0.0", "^1")).toBe(true);
    expect(satisfies("1.9.3", "^1.2")).toBe(true);
    expect(satisfies("1.1.9", "^1.2")).toBe(false);
    expect(satisfies("2.0.0", "^1")).toBe(false);
    expect(satisfies("0.9.0", "^1")).toBe(false);
  });

  it("^0.x : la mineure fait office de majeure", () => {
    expect(satisfies("0.3.5", "^0.3.1")).toBe(true);
    expect(satisfies("0.4.0", "^0.3.1")).toBe(false);
  });

  it("~ : même version mineure", () => {
    expect(satisfies("1.2.9", "~1.2.3")).toBe(true);
    expect(satisfies("1.3.0", "~1.2.3")).toBe(false);
  });

  it("x, comparaisons et version exacte", () => {
    expect(satisfies("1.7.0", "1.x")).toBe(true);
    expect(satisfies("2.0.0", "1.x")).toBe(false);
    expect(satisfies("1.2.7", "1.2.x")).toBe(true);
    expect(satisfies("1.3.0", "1.2.x")).toBe(false);
    expect(satisfies("1.5.0", ">=1.2 <2")).toBe(true);
    expect(satisfies("2.0.0", ">=1.2 <2")).toBe(false);
    expect(satisfies("1.2.3", "1.2.3")).toBe(true);
    expect(satisfies("1.2.4", "1.2.3")).toBe(false);
  });
});

const node = (
  id: string,
  version: string,
  dependencies: Record<string, string> = {},
  optionalDependencies: Record<string, string> = {},
): DepNode => ({ id, version, dependencies, optionalDependencies });

const installed = (n: DepNode, enabled = true): InstalledNode => ({ ...n, enabled });

describe("problemsOf", () => {
  const tubes = node("tubes", "1.0.0", { fournisseurs: "^1" }, { machines: "^1" });

  it("ne signale rien quand tout est là", () => {
    expect(problemsOf(tubes, [installed(node("fournisseurs", "1.2.0"))])).toEqual([]);
  });

  it("signale une dépendance absente, trop récente ou désactivée, mais pas une facultative", () => {
    expect(problemsOf(tubes, [])).toEqual([{ kind: "missing", id: "fournisseurs", range: "^1" }]);
    expect(problemsOf(tubes, [installed(node("fournisseurs", "2.0.0"))])).toEqual([
      { kind: "incompatible", id: "fournisseurs", range: "^1", found: "2.0.0" },
    ]);
    expect(problemsOf(tubes, [installed(node("fournisseurs", "1.0.0"), false)])).toEqual([
      { kind: "disabled", id: "fournisseurs", range: "^1" },
    ]);
  });
});

describe("dependentsOf", () => {
  const all = [
    node("fournisseurs", "1.0.0"),
    node("tubes", "1.0.0", { fournisseurs: "^1" }),
    node("chiffrage", "1.0.0", { tubes: "^1" }),
    node("economie", "1.0.0", {}, { fournisseurs: "^1" }),
  ];

  it("suit les dépendances obligatoires, directes ou en chaîne", () => {
    expect(dependentsOf("fournisseurs", all).sort()).toEqual(["chiffrage", "tubes"]);
    expect(dependentsOf("tubes", all)).toEqual(["chiffrage"]);
    expect(dependentsOf("chiffrage", all)).toEqual([]);
  });

  it("ne compte pas les dépendances facultatives à part", () => {
    expect(optionalDependentsOf("fournisseurs", all)).toEqual(["economie"]);
  });

  it("supporte un cycle sans boucler", () => {
    const cycle = [node("a", "1.0.0", { b: "*" }), node("b", "1.0.0", { a: "*" })];
    expect(dependentsOf("a", cycle)).toEqual(["b"]);
  });
});

describe("planInstall", () => {
  const catalogue = [
    node("fournisseurs", "1.0.0"),
    node("fournisseurs", "1.3.0"),
    node("machines", "1.0.0"),
    node("tubes", "1.0.0", { fournisseurs: "^1" }, { machines: "^1" }),
    node("chiffrage", "1.0.0", { tubes: "^1" }),
    node("futur", "1.0.0", { fournisseurs: "^2" }),
  ];
  const target = (id: string) => catalogue.find((e) => e.id === id)!;
  const ids = (list: DepNode[]) => list.map((e) => `${e.id}@${e.version}`);

  it("installe d'abord les dépendances obligatoires, en prenant la plus récente compatible", () => {
    const plan = planInstall(target("tubes"), catalogue, []);
    expect(ids(plan.order)).toEqual(["fournisseurs@1.3.0", "tubes@1.0.0"]);
    expect(ids(plan.optional)).toEqual(["machines@1.0.0"]);
    expect(plan.missing).toEqual([]);
  });

  it("suit une chaîne de dépendances", () => {
    expect(ids(planInstall(target("chiffrage"), catalogue, []).order)).toEqual([
      "fournisseurs@1.3.0",
      "tubes@1.0.0",
      "chiffrage@1.0.0",
    ]);
  });

  it("ajoute les facultatives quand on les demande", () => {
    const plan = planInstall(target("tubes"), catalogue, [], true);
    expect(ids(plan.order)).toEqual(["fournisseurs@1.3.0", "tubes@1.0.0", "machines@1.0.0"]);
    expect(plan.optional).toEqual([]);
  });

  it("ne réinstalle pas ce qui est déjà là et compatible", () => {
    const plan = planInstall(target("tubes"), catalogue, [node("fournisseurs", "1.0.0"), node("machines", "1.0.0")]);
    expect(ids(plan.order)).toEqual(["tubes@1.0.0"]);
    expect(plan.optional).toEqual([]);
  });

  it("signale une dépendance introuvable ou dans une version incompatible", () => {
    expect(planInstall(target("futur"), catalogue, []).missing).toEqual([
      { kind: "missing", id: "fournisseurs", range: "^2" },
    ]);
    expect(planInstall(target("futur"), catalogue, [node("fournisseurs", "1.0.0")]).missing).toEqual([
      { kind: "incompatible", id: "fournisseurs", range: "^2", found: "1.0.0" },
    ]);
  });

  it("ne tourne pas en rond si deux plugins dépendent l'un de l'autre", () => {
    const cycle = [node("a", "1.0.0", { b: "*" }), node("b", "1.0.0", { a: "*" })];
    expect(planInstall(cycle[0]!, cycle, []).order.length).toBe(2);
  });
});
