import type { ServiceResult } from "@etabli/sdk/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteurAppels, type EnvAppels, type Invocation, type PluginAppel } from "./appels";
import { cheminRelatif, fonctionsDe } from "./manifeste";

const finances: PluginAppel = {
  id: "finances",
  apiVersion: "^2",
  permissions: [],
  dependencies: {},
  optionalDependencies: {},
  provides: { finances: "1" },
  services: {},
  serviceEntry: "service/index.html",
  functions: fonctionsDe({ finances: { "ecritures.ajouter": { acces: "ecriture" }, "soldes.aLaDate": { acces: "lecture" } } }, { finances: "1" }),
};

const paie: PluginAppel = {
  id: "paie",
  apiVersion: "^2",
  permissions: ["appelle:finances:ecriture"],
  dependencies: {},
  optionalDependencies: { finances: "^1" },
  provides: {},
  services: { finances: "^1" },
  serviceEntry: null,
  functions: {},
};

const demande = { service: "finances", fn: "ecritures.ajouter", args: { cle: "p1", montant: 125000 } };
const reussite: ServiceResult = { ok: true, valeur: { id: "e1" } };

interface Banc {
  routeur: RouteurAppels;
  executions: Invocation[];
  plugins: PluginAppel[];
  inactifs: Set<string>;
  executer: ReturnType<typeof vi.fn>;
}

function banc(options: { plugins?: PluginAppel[]; executer?: (i: Invocation, d: number) => Promise<ServiceResult>; limites?: { parFournisseur: number; parAppelant: number } } = {}): Banc {
  const plugins = options.plugins ?? [paie, finances];
  const inactifs = new Set<string>();
  const executions: Invocation[] = [];
  const executer = vi.fn(async (i: Invocation, d: number) => {
    executions.push(i);
    return options.executer ? options.executer(i, d) : reussite;
  });
  const env: EnvAppels = { plugins: () => plugins, actif: (id) => !inactifs.has(id), executer };
  return { routeur: new RouteurAppels(env, options.limites), executions, plugins, inactifs, executer };
}

const modifie = (p: PluginAppel, champs: Partial<PluginAppel>): PluginAppel => ({ ...p, ...champs });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("appel qui aboutit", () => {
  it("rend la valeur du fournisseur et lui transmet l'identité de l'appelant, imposée par le moteur", async () => {
    const b = banc();
    const r = await b.routeur.appeler("paie", { ...demande, caller: "banque", appelant: "banque" } as never);
    expect(r).toEqual(reussite);
    expect(b.executions).toHaveLength(1);
    expect(b.executions[0]).toMatchObject({ fournisseur: "finances", entree: "service/index.html", service: "finances", fn: "ecritures.ajouter", appelant: "paie" });
    expect(JSON.stringify(b.executions[0])).not.toContain("banque");
  });

  it("l'identifiant interne vient du moteur et change à chaque appel", async () => {
    const b = banc();
    await b.routeur.appeler("paie", demande);
    await b.routeur.appeler("paie", demande);
    expect(b.executions[0]!.id).not.toBe(b.executions[1]!.id);
  });

  it("une fonction en lecture demande seulement l'accès lecture", async () => {
    const lecteur = modifie(paie, { permissions: ["appelle:finances:lecture"] });
    const b = banc({ plugins: [lecteur, finances] });
    expect(await b.routeur.appeler("paie", { service: "finances", fn: "soldes.aLaDate", args: null })).toEqual(reussite);
    expect(await b.routeur.appeler("paie", demande)).toMatchObject({ ok: false, code: "permission_refusee" });
  });

  it("une dépendance obligatoire convient autant qu'une facultative", async () => {
    const b = banc({ plugins: [modifie(paie, { dependencies: { finances: "^1" }, optionalDependencies: {} }), finances] });
    expect(await b.routeur.appeler("paie", demande)).toEqual(reussite);
  });
});

describe("refus", () => {
  it("appelant inconnu ou désactivé", async () => {
    const b = banc();
    expect(await b.routeur.appeler("inconnu", demande)).toMatchObject({ ok: false, code: "permission_refusee" });
    b.inactifs.add("paie");
    expect(await b.routeur.appeler("paie", demande)).toMatchObject({ ok: false, code: "permission_refusee" });
    expect(b.executer).not.toHaveBeenCalled();
  });

  it("plugin de contrat ^1", async () => {
    const b = banc({ plugins: [modifie(paie, { apiVersion: "^1" }), finances] });
    expect(await b.routeur.appeler("paie", demande)).toMatchObject({ ok: false, code: "permission_refusee" });
    expect(b.executer).not.toHaveBeenCalled();
  });

  it("permission absente : refus, sans révéler si le fournisseur est installé", async () => {
    const sans = modifie(paie, { permissions: [] });
    const avecFournisseur = banc({ plugins: [sans, finances] });
    const sansFournisseur = banc({ plugins: [sans] });
    const a = await avecFournisseur.routeur.appeler("paie", demande);
    const c = await sansFournisseur.routeur.appeler("paie", demande);
    expect(a).toMatchObject({ ok: false, code: "permission_refusee" });
    expect(c).toMatchObject({ ok: false, code: "permission_refusee" });
    expect(a).toEqual(c);
  });

  it("permission pour un autre service", async () => {
    const b = banc({ plugins: [modifie(paie, { permissions: ["appelle:agenda:ecriture"] }), finances] });
    expect(await b.routeur.appeler("paie", demande)).toMatchObject({ ok: false, code: "permission_refusee" });
  });

  it("fournisseur installé mais non déclaré en dépendance", async () => {
    const b = banc({ plugins: [modifie(paie, { optionalDependencies: {} }), finances] });
    expect(await b.routeur.appeler("paie", demande)).toMatchObject({ ok: false, code: "permission_refusee" });
    expect(b.executer).not.toHaveBeenCalled();
  });

  it("un plugin n'appelle pas son propre service", async () => {
    const soi = modifie(finances, { permissions: ["appelle:finances:ecriture"], services: { finances: "^1" }, optionalDependencies: { finances: "^1" } });
    const b = banc({ plugins: [soi] });
    expect(await b.routeur.appeler("finances", demande)).toMatchObject({ ok: false, code: "service_absent" });
  });

  it("fonction non déclarée, y compris les noms de l'objet de base", async () => {
    const b = banc();
    for (const fn of ["ecritures.supprimer", "constructor", "toString", "hasOwnProperty", "__proto__", "ecritures"]) {
      expect(await b.routeur.appeler("paie", { service: "finances", fn, args: null }), fn).toMatchObject({ ok: false, code: "introuvable" });
    }
    expect(b.executer).not.toHaveBeenCalled();
  });

  it("service nommé comme une propriété de l'objet de base", async () => {
    const b = banc({ plugins: [modifie(paie, { permissions: ["appelle:constructor:lecture"] }), finances] });
    expect(await b.routeur.appeler("paie", { service: "constructor", fn: "a.b", args: null })).toMatchObject({ ok: false, code: "service_absent" });
  });

  it("arguments trop volumineux ou circulaires", async () => {
    const b = banc();
    const a: Record<string, unknown> = {};
    a.a = a;
    expect(await b.routeur.appeler("paie", { ...demande, args: a })).toMatchObject({ ok: false, code: "argument_invalide" });
    expect(await b.routeur.appeler("paie", { ...demande, args: "x".repeat(4 * 1024 * 1024 + 1) })).toMatchObject({ ok: false, code: "argument_invalide" });
    expect(b.executer).not.toHaveBeenCalled();
  });

  it("pas de boucle : un appel venu du cadre de service d'un fournisseur est refusé", async () => {
    const b = banc();
    expect(await b.routeur.appeler("paie", demande, { depuisService: true })).toMatchObject({ ok: false, code: "profondeur_max" });
    expect(b.executer).not.toHaveBeenCalled();
  });

  it("fournisseur sans point d'entrée", async () => {
    const b = banc({ plugins: [paie, modifie(finances, { serviceEntry: null })] });
    expect(await b.routeur.appeler("paie", demande)).toMatchObject({ ok: false, code: "erreur" });
  });
});

describe("fournisseur absent : jamais d'exception", () => {
  it("jamais installé", async () => {
    const b = banc({ plugins: [paie] });
    await expect(b.routeur.appeler("paie", demande)).resolves.toMatchObject({ ok: false, code: "service_absent" });
  });

  it("désactivé", async () => {
    const b = banc();
    b.inactifs.add("finances");
    await expect(b.routeur.appeler("paie", demande)).resolves.toMatchObject({ ok: false, code: "service_absent" });
    expect(b.executer).not.toHaveBeenCalled();
  });

  it("désinstallé entre deux appels", async () => {
    const b = banc();
    expect(await b.routeur.appeler("paie", demande)).toEqual(reussite);
    b.plugins.splice(b.plugins.indexOf(finances), 1);
    expect(await b.routeur.appeler("paie", demande)).toMatchObject({ ok: false, code: "service_absent" });
  });

  it("le plugin qui publie le service n'est pas celui de la dépendance", async () => {
    const autre = modifie(finances, { id: "autre" });
    const b = banc({ plugins: [paie, autre] });
    expect(await b.routeur.appeler("paie", demande)).toMatchObject({ ok: false, code: "permission_refusee" });
  });

  it("un exécuteur qui jette ne fait pas jeter l'appelant", async () => {
    const b = banc({
      executer: async () => {
        throw new Error("boum");
      },
    });
    await expect(b.routeur.appeler("paie", demande)).resolves.toMatchObject({ ok: false, code: "erreur" });
  });

  it("l'erreur du fournisseur est rendue telle quelle", async () => {
    const b = banc({ executer: async () => ({ ok: false, code: "argument_invalide", message: "montant nul" }) });
    expect(await b.routeur.appeler("paie", demande)).toEqual({ ok: false, code: "argument_invalide", message: "montant nul" });
  });
});

describe("version du contrat (pas celle du plugin)", () => {
  it("un fournisseur en version 5.0.0 qui garde le contrat 1 reste joignable", async () => {
    // La version du plugin n'apparaît même pas dans ce que lit le routeur : seul le contrat compte.
    const b = banc({ plugins: [paie, { ...finances, provides: { finances: "1" } }] });
    expect(await b.routeur.appeler("paie", demande)).toEqual(reussite);
  });

  it("contrat trop récent ou trop ancien", async () => {
    const recent = banc({ plugins: [paie, { ...finances, provides: { finances: "2" } }] });
    expect(await recent.routeur.appeler("paie", demande)).toMatchObject({ ok: false, code: "contrat_incompatible" });
    const ancien = banc({ plugins: [modifie(paie, { services: { finances: "^2" } }), finances] });
    expect(await ancien.routeur.appeler("paie", demande)).toMatchObject({ ok: false, code: "contrat_incompatible" });
    expect(recent.executer).not.toHaveBeenCalled();
  });

  it("l'appelant doit déclarer sa plage de contrat", async () => {
    const b = banc({ plugins: [modifie(paie, { services: {} }), finances] });
    expect(await b.routeur.appeler("paie", demande)).toMatchObject({ ok: false, code: "contrat_incompatible" });
  });
});

describe("file par fournisseur, délais et plafonds", () => {
  /** Exécuteur dont on décide quand chaque appel se termine. */
  function manuel() {
    const portes: { invocation: Invocation; fin: (r: ServiceResult) => void }[] = [];
    const executer = (invocation: Invocation) => new Promise<ServiceResult>((fin) => portes.push({ invocation, fin }));
    return { portes, executer };
  }

  it("un seul appel à la fois chez un fournisseur, dans l'ordre d'arrivée", async () => {
    const m = manuel();
    const b = banc({ executer: m.executer });
    const r1 = b.routeur.appeler("paie", { ...demande, args: 1 });
    const r2 = b.routeur.appeler("paie", { ...demande, args: 2 });
    const r3 = b.routeur.appeler("paie", { ...demande, args: 3 });
    await vi.advanceTimersByTimeAsync(0);
    expect(m.portes.map((p) => p.invocation.args)).toEqual([1]);
    expect(b.routeur.enAttente("finances")).toBe(3);
    m.portes[0]!.fin({ ok: true, valeur: "un" });
    await vi.advanceTimersByTimeAsync(0);
    expect(m.portes.map((p) => p.invocation.args)).toEqual([1, 2]);
    m.portes[1]!.fin({ ok: true, valeur: "deux" });
    await vi.advanceTimersByTimeAsync(0);
    m.portes[2]!.fin({ ok: true, valeur: "trois" });
    expect(await Promise.all([r1, r2, r3])).toEqual([
      { ok: true, valeur: "un" },
      { ok: true, valeur: "deux" },
      { ok: true, valeur: "trois" },
    ]);
    expect(b.routeur.enAttente("finances")).toBe(0);
  });

  it("le délai couvre l'attente : un appel qui n'a pas démarré à temps n'est jamais exécuté", async () => {
    const m = manuel();
    const b = banc({ executer: m.executer });
    const lent = b.routeur.appeler("paie", { ...demande, args: 1, timeoutMs: 10_000 });
    const pressee = b.routeur.appeler("paie", { ...demande, args: 2, timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pressee).toMatchObject({ ok: false, code: "delai_depasse" });
    m.portes[0]!.fin(reussite);
    await lent;
    await vi.advanceTimersByTimeAsync(0);
    expect(m.portes).toHaveLength(1);
  });

  it("transmet à l'exécuteur le temps qui reste, 5 s par défaut", async () => {
    const delais: number[] = [];
    const b = banc({
      executer: async (_i, d) => {
        delais.push(d);
        return reussite;
      },
    });
    await b.routeur.appeler("paie", demande);
    await b.routeur.appeler("paie", { ...demande, timeoutMs: 800 });
    await b.routeur.appeler("paie", { ...demande, timeoutMs: 1e9 });
    expect(delais).toEqual([5000, 800, 10_000]);
  });

  it("un exécuteur qui ne rend jamais la main n'enlise pas la file", async () => {
    const b = banc({ executer: (i) => (i.args === 1 ? new Promise<ServiceResult>(() => {}) : Promise.resolve(reussite)) });
    const bloque = b.routeur.appeler("paie", { ...demande, args: 1, timeoutMs: 1000 });
    const suivant = b.routeur.appeler("paie", { ...demande, args: 2, timeoutMs: 10_000 });
    await vi.advanceTimersByTimeAsync(1300);
    expect(await bloque).toMatchObject({ ok: false, code: "delai_depasse" });
    expect(await suivant).toEqual(reussite);
    expect(b.routeur.enAttente("finances")).toBe(0);
  });

  it("deux fournisseurs ne s'attendent pas l'un l'autre", async () => {
    const agenda = modifie(finances, { id: "agenda", provides: { agenda: "1" }, functions: fonctionsDe({ agenda: { "rappels.liste": { acces: "lecture" } } }, { agenda: "1" }) });
    const p = modifie(paie, { permissions: ["appelle:finances:ecriture", "appelle:agenda:lecture"], services: { finances: "^1", agenda: "^1" }, optionalDependencies: { finances: "^1", agenda: "^1" } });
    const m = manuel();
    const b = banc({ plugins: [p, finances, agenda], executer: m.executer });
    void b.routeur.appeler("paie", demande);
    void b.routeur.appeler("paie", { service: "agenda", fn: "rappels.liste", args: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(m.portes.map((x) => x.invocation.fournisseur).sort()).toEqual(["agenda", "finances"]);
  });

  it("plafond par appelant et par fournisseur : `occupe`, sans exécuter", async () => {
    const m = manuel();
    const b = banc({ executer: m.executer, limites: { parFournisseur: 3, parAppelant: 2 } });
    void b.routeur.appeler("paie", demande);
    void b.routeur.appeler("paie", demande);
    expect(await b.routeur.appeler("paie", demande)).toMatchObject({ ok: false, code: "occupe" });
    expect(b.routeur.enAttente("finances")).toBe(2);

    // Un autre plugin occupe la dernière place du fournisseur ; le suivant est refusé par le plafond du fournisseur.
    const autre = (id: string) => modifie(paie, { id });
    const c = banc({ plugins: [autre("a"), autre("b"), autre("c"), finances], executer: m.executer, limites: { parFournisseur: 2, parAppelant: 5 } });
    void c.routeur.appeler("a", demande);
    void c.routeur.appeler("b", demande);
    expect(await c.routeur.appeler("c", demande)).toMatchObject({ ok: false, code: "occupe" });
  });

  it("le plafond d'un appelant est rendu quand ses appels se terminent", async () => {
    const b = banc({ limites: { parFournisseur: 10, parAppelant: 1 } });
    expect(await b.routeur.appeler("paie", demande)).toEqual(reussite);
    expect(await b.routeur.appeler("paie", demande)).toEqual(reussite);
  });
});

describe("lecture du manifeste", () => {
  it("fonctionsDe ne garde que les services publiés, les noms valides et les accès connus", () => {
    const brut = {
      finances: { "ecritures.ajouter": { acces: "ecriture" }, "soldes.aLaDate": { acces: "lecture" }, "mauvais nom": { acces: "lecture" }, "x.y": { acces: "admin" }, "z.z": null },
      agenda: { "rappels.liste": { acces: "lecture" } },
    };
    const f = fonctionsDe(brut, { finances: "1" });
    expect(Object.keys(f)).toEqual(["finances"]);
    expect(Object.keys(f.finances!).sort()).toEqual(["ecritures.ajouter", "soldes.aLaDate"]);
  });

  it("fonctionsDe : des objets sans prototype, et les entrées absurdes ne cassent rien", () => {
    const f = fonctionsDe({ finances: { "ecritures.ajouter": { acces: "ecriture" } } }, { finances: "1" });
    expect(Object.getPrototypeOf(f)).toBeNull();
    expect(f.finances!["constructor"]).toBeUndefined();
    for (const v of [null, undefined, 5, "x", [], { finances: [] }, { finances: "x" }]) expect(Object.keys(fonctionsDe(v, { finances: "1" }))).toEqual(expect.any(Array));
  });

  it("cheminRelatif refuse ce qui sort du plugin", () => {
    expect(cheminRelatif("service/index.html")).toBe("service/index.html");
    for (const v of ["/etc/passwd", "../x.html", "a/../b", "a//b", "a\\b", "", 5, null, "x".repeat(201)]) expect(cheminRelatif(v), String(v)).toBeNull();
  });
});
