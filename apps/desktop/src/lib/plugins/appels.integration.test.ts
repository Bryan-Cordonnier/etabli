// Appel complet entre deux plugins de test (fixtures/appels-entre-plugins), avec le VRAI SDK des deux côtés, le vrai garde
// et le vrai routeur. Seuls manquent le navigateur (des « fenêtres » factices reçoivent le message de connexion) et les
// composants Svelte : `hoteAppelant` et `hoteFournisseur` refont, en quelques lignes, ce que font MiniAppFrame et
// ServiceFrame. Ce que ce test NE prouve PAS : le cadre invisible dans WebView2 ou Android (voir docs/19).
import { CONNECT, PROTOCOL_VERSION, type HostToPlugin, type PluginToHost, type ServiceResult } from "@etabli/sdk/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import appelantManifeste from "../../../../../fixtures/appels-entre-plugins/appelant-essai/manifest.json";
import fournisseurManifeste from "../../../../../fixtures/appels-entre-plugins/fournisseur-essai/manifest.json";
import { RouteurAppels, type EnvAppels, type Invocation, type PluginAppel } from "./appels";
import { controler, idAppel, type Contexte } from "./garde";
import { cheminRelatif, fonctionsDe } from "./manifeste";
import { connues, estStrict } from "./permissions";

type Brut = Record<string, unknown>;
const enPluginAppel = (m: Brut): PluginAppel => ({
  id: m.id as string,
  apiVersion: m.apiVersion as string,
  permissions: connues((m.permissions as string[]) ?? []),
  dependencies: (m.dependencies as Record<string, string>) ?? {},
  optionalDependencies: (m.optionalDependencies as Record<string, string>) ?? {},
  provides: (m.provides as Record<string, string>) ?? {},
  services: (m.services as Record<string, string>) ?? {},
  serviceEntry: cheminRelatif(m.serviceEntry),
  functions: fonctionsDe(m.functions, (m.provides as Record<string, string>) ?? {}),
});

/**
 * Une « fenêtre » minimale : le SDK y écoute le message de connexion. Dès qu'il s'y abonne (au `connect()` de la page), le
 * moteur factice lui envoie le port, comme le fait le vrai moteur au chargement du cadre.
 */
function fenetre(surAbonnement: () => void) {
  const ecouteurs = new Map<string, Set<(e: unknown) => void>>();
  return {
    addEventListener: (type: string, f: (e: unknown) => void) => {
      ecouteurs.set(type, (ecouteurs.get(type) ?? new Set()).add(f));
      if (type === "message") surAbonnement();
    },
    removeEventListener: (type: string, f: (e: unknown) => void) => ecouteurs.get(type)?.delete(f),
    envoyer: (type: string, evenement: unknown) => ecouteurs.get(type)?.forEach((f) => f(evenement)),
  };
}

/** Charge une copie neuve du SDK (un `connect()` par page, comme dans un vrai cadre) reliée à un port côté moteur. */
function pageConnectee<T>(charger: () => Promise<T>): { module: Promise<T>; hote: MessagePort } {
  vi.resetModules();
  const canal = new MessageChannel();
  const w: ReturnType<typeof fenetre> = fenetre(() => queueMicrotask(() => w.envoyer("message", { data: { type: CONNECT }, ports: [canal.port2] })));
  vi.stubGlobal("window", w);
  vi.stubGlobal("document", { documentElement: { style: { setProperty: () => {}, colorScheme: "" }, scrollHeight: 300 } });
  vi.stubGlobal("ResizeObserver", class { observe() {} });
  vi.stubGlobal("requestAnimationFrame", (f: () => void) => setTimeout(f, 0));
  return { module: charger(), hote: canal.port1 };
}

const init = (pluginId: string, appId: string): HostToPlugin => ({
  type: "init",
  protocol: PROTOCOL_VERSION,
  pluginId,
  appId,
  document: { id: null, title: "", data: null },
  theme: {},
  colorScheme: "light",
  services: {},
  pluginData: null,
  incoming: null,
  shortcuts: [],
});

describe("appel complet entre deux plugins de test", () => {
  const appelantP = enPluginAppel(appelantManifeste as Brut);
  const fournisseurP = enPluginAppel(fournisseurManifeste as Brut);
  let plugins: PluginAppel[];
  let ouverts: MessagePort[];
  let cadresOuverts: number;
  let maxSimultanes: number;
  let routeur: RouteurAppels;

  /** Ce que fait ServiceFrame : charge la page `serviceEntry`, attend `serviceReady`, envoie l'appel, rend la réponse. */
  function hoteFournisseur(invocation: Invocation, delaiMs: number): Promise<ServiceResult> {
    return new Promise((resolve) => {
      cadresOuverts++;
      maxSimultanes = Math.max(maxSimultanes, cadresOuverts);
      const fin = (r: ServiceResult) => {
        cadresOuverts--;
        resolve(r);
      };
      const minuteur = setTimeout(() => fin({ ok: false, code: "delai_depasse", message: "délai" }), delaiMs);
      // La page du fournisseur se connecte en haut de son module (`await connect()`) : on n'attend pas l'import.
      {
        const { hote } = pageConnectee(() => import("../../../../../fixtures/appels-entre-plugins/fournisseur-essai/service/main"));
        ouverts.push(hote);
        const ctx: Contexte = { permissions: [], strict: estStrict(fournisseurP.apiVersion), provides: Object.keys(fournisseurP.provides), service: true };
        hote.onmessage = (e: MessageEvent<PluginToHost>) => {
          const v = controler(e.data, ctx);
          if (!v.ok) return;
          if (v.message.type === "serviceReady") {
            hote.postMessage({ type: "serviceInvoke", id: invocation.id, service: invocation.service, fn: invocation.fn, args: invocation.args, caller: invocation.appelant } satisfies HostToPlugin);
          } else if (v.message.type === "serviceResult" && v.message.id === invocation.id) {
            clearTimeout(minuteur);
            fin(v.message.result);
          }
        };
        hote.postMessage(init(invocation.fournisseur, "service"));
      }
    });
  }

  beforeEach(() => {
    plugins = [appelantP, fournisseurP];
    ouverts = [];
    cadresOuverts = 0;
    maxSimultanes = 0;
    const env: EnvAppels = { plugins: () => plugins, actif: () => true, executer: hoteFournisseur };
    routeur = new RouteurAppels(env);
  });
  afterEach(() => {
    for (const p of ouverts) p.close();
  });
  // Les simulations de navigateur restent en place (pas de unstubAllGlobals) : les minuteries du SDK tombent après un test.
  // Chaque fichier de test a son propre environnement, rien ne fuit vers les autres.

  /** Ce que fait MiniAppFrame pour l'appelant : garde, puis routeur, puis réponse sur le port. */
  async function lancerScenario(appelantCtx?: Partial<Contexte>) {
    const { module: charge, hote } = pageConnectee(() => import("../../../../../fixtures/appels-entre-plugins/appelant-essai/scenario"));
    const module = await charge;
    ouverts.push(hote);
    const ctx: Contexte = { permissions: appelantP.permissions as string[], strict: true, provides: [], ...appelantCtx };
    hote.onmessage = (e: MessageEvent<PluginToHost>) => {
      const v = controler(e.data, ctx);
      if (!v.ok) {
        const id = idAppel(e.data);
        if (id) hote.postMessage({ type: "serviceReply", id, result: { ok: false, code: v.code ?? "argument_invalide", message: v.raison } } satisfies HostToPlugin);
        return;
      }
      if (v.message.type !== "serviceCall") return;
      const { id, service, fn, args, timeoutMs } = v.message;
      void routeur.appeler(appelantP.id, { service, fn, args, timeoutMs }).then((result) => hote.postMessage({ type: "serviceReply", id, result } satisfies HostToPlugin));
    };
    // `scenario()` appelle `connect()` : c'est alors que le moteur factice envoie le port, puis `init`.
    const fini = module.scenario();
    hote.postMessage(init(appelantP.id, "scenario"));
    return fini;
  }

  it("ajoute une écriture, la lit, refuse l'invalide et l'inconnu, rejoue sans doublon", async () => {
    const r = await lancerScenario();
    expect(r.ajout).toEqual({ ok: true, valeur: { cle: "paie-oct", doublon: false } });
    expect(r.invalide).toMatchObject({ ok: false, code: "argument_invalide" });
    expect(r.inconnue).toMatchObject({ ok: false, code: "introuvable" });
    // L'identité vue par le fournisseur est celle que le moteur a écrite.
    expect(r.identite).toEqual({ ok: true, valeur: "appelant-essai" });
    // Chaque appel charge une page neuve du fournisseur (cadre ouvert puis fermé) : l'état n'est pas conservé d'un appel
    // à l'autre, comme dans le vrai moteur — d'où `doublon: false` et un total vide. Un vrai fournisseur range son
    // registre dans ses réglages (pluginData), pas en mémoire.
    expect(r.doublon).toEqual({ ok: true, valeur: { cle: "paie-oct", doublon: false } });
    expect(r.total).toEqual({ ok: true, valeur: { total: 0, nombre: 0 } });
    expect(cadresOuverts).toBe(0);
    expect(maxSimultanes).toBe(1);
  });

  it("fournisseur absent : réponse `service_absent`, aucune exception, aucun cadre ouvert", async () => {
    plugins = [appelantP];
    const r = await lancerScenario();
    for (const reponse of Object.values(r)) expect(reponse).toMatchObject({ ok: false, code: "service_absent" });
    expect(cadresOuverts).toBe(0);
    expect(ouverts).toHaveLength(1);
  });

  it("fournisseur désactivé après coup, puis réinstallé", async () => {
    const actifs = new Set(["appelant-essai", "fournisseur-essai"]);
    routeur = new RouteurAppels({ plugins: () => plugins, actif: (id) => actifs.has(id), executer: hoteFournisseur });
    actifs.delete("fournisseur-essai");
    expect((await lancerScenario()).ajout).toMatchObject({ ok: false, code: "service_absent" });
    actifs.add("fournisseur-essai");
    expect((await lancerScenario()).ajout).toMatchObject({ ok: true });
  });

  it("contrat incompatible : le fournisseur passe au contrat 2", async () => {
    plugins = [appelantP, { ...fournisseurP, provides: { registre: "2" } }];
    expect((await lancerScenario()).ajout).toMatchObject({ ok: false, code: "contrat_incompatible" });
    expect(cadresOuverts).toBe(0);
  });

  it("l'appelant sans permission d'écriture ne peut pas écrire (lecture seule)", async () => {
    const lecteur = { ...appelantP, permissions: ["appelle:registre:lecture"] };
    plugins = [lecteur, fournisseurP];
    const r = await lancerScenario({ permissions: lecteur.permissions as string[] });
    expect(r.ajout).toMatchObject({ ok: false, code: "permission_refusee" });
    expect(r.total).toMatchObject({ ok: true });
    expect(r.identite).toMatchObject({ ok: true, valeur: "appelant-essai" });
  });

  it("une page sans aucune permission d'appel est refusée dès le garde, avec une réponse", async () => {
    const r = await lancerScenario({ permissions: [] });
    for (const reponse of Object.values(r)) expect(reponse).toMatchObject({ ok: false, code: "permission_refusee" });
    expect(cadresOuverts).toBe(0);
  });
});
