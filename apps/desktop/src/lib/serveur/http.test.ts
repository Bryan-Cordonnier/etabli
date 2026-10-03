import { describe, expect, it, vi } from "vitest";
import { creerFondServeur } from "./fond";
import { ClientApi, ErreurApi, ErreurReseau } from "./http";

type Appel = { methode: string; url: string; en_tetes: Record<string, string>; corps: unknown };

/** Faux `fetch` : enregistre les appels et répond avec ce que `repondre` renvoie. */
function faux(repondre: (appel: Appel) => Response | Promise<Response>) {
  const appels: Appel[] = [];
  const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const appel: Appel = {
      methode: init?.method ?? "GET",
      url: String(url),
      en_tetes: (init?.headers ?? {}) as Record<string, string>,
      corps: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    };
    appels.push(appel);
    return repondre(appel);
  });
  return { f: f as unknown as typeof fetch, appels };
}

const json = (corps: unknown, statut = 200, entetes: Record<string, string> = {}) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json", ...entetes } });

describe("client HTTP", () => {
  it("envoie le jeton et le corps JSON", async () => {
    const { f, appels } = faux(() => json({ ok: true }));
    const client = new ClientApi({ base: "https://etabli.exemple.fr/", jeton: "abc", fetch: f });
    expect(await client.requete("PUT", "/api/reglages", { a: 1 })).toEqual({ ok: true });
    expect(appels[0]).toMatchObject({ methode: "PUT", url: "https://etabli.exemple.fr/api/reglages", corps: { a: 1 } });
    expect(appels[0]?.en_tetes).toMatchObject({ Authorization: "Bearer abc", "Content-Type": "application/json" });
  });

  it("pas d'en-tête d'autorisation sans jeton", async () => {
    const { f, appels } = faux(() => json({}));
    await new ClientApi({ base: "", fetch: f }).requete("GET", "/api/etat");
    expect(appels[0]?.en_tetes.Authorization).toBeUndefined();
    expect(appels[0]?.url).toBe("/api/etat");
  });

  it("réponse vide (204) = undefined", async () => {
    const { f } = faux(() => new Response(null, { status: 204 }));
    expect(await new ClientApi({ base: "", fetch: f }).requete("DELETE", "/api/session")).toBeUndefined();
  });

  it("paquet binaire envoyé tel quel", async () => {
    const { f, appels } = faux(() => json({ id: "essai", version: "1.0.0" }, 201));
    const octets = new Uint8Array([1, 2, 3]);
    await new ClientApi({ base: "", jeton: "t", fetch: f }).requete("POST", "/api/admin/plugins", octets);
    expect(appels[0]?.corps).toBe(octets);
    expect(appels[0]?.en_tetes["Content-Type"]).toBe("application/octet-stream");
  });

  it("erreur du serveur = ErreurApi avec sa phrase, sa version et son délai", async () => {
    const { f } = faux(() => json({ erreur: "Ce calcul a été modifié ailleurs.", versionActuelle: 4 }, 409));
    const e = await new ClientApi({ base: "", fetch: f }).requete("PUT", "/api/documents", {}).catch((x) => x);
    expect(e).toBeInstanceOf(ErreurApi);
    expect(e).toMatchObject({ statut: 409, message: "Ce calcul a été modifié ailleurs.", versionActuelle: 4 });

    const { f: f429 } = faux(() => json({ erreur: "Trop d'essais." }, 429, { "retry-after": "42" }));
    const e429 = await new ClientApi({ base: "", fetch: f429 }).requete("POST", "/api/session", {}).catch((x) => x);
    expect(e429).toMatchObject({ statut: 429, retryApres: 42 });
  });

  it("réseau coupé, délai dépassé, proxy sans serveur : ErreurReseau", async () => {
    const coupe = new ClientApi({ base: "", fetch: (async () => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch });
    await expect(coupe.requete("GET", "/api/moi")).rejects.toBeInstanceOf(ErreurReseau);

    const lent = new ClientApi({
      base: "",
      delai: 20,
      fetch: ((_: unknown, init?: RequestInit) =>
        new Promise((_ok, ko) => init?.signal?.addEventListener("abort", () => ko(new DOMException("annulé", "AbortError"))))) as typeof fetch,
    });
    await expect(lent.requete("GET", "/api/moi")).rejects.toBeInstanceOf(ErreurReseau);

    for (const statut of [502, 503, 504]) {
      const { f } = faux(() => new Response("<html>Bad gateway</html>", { status: statut }));
      await expect(new ClientApi({ base: "", fetch: f }).requete("GET", "/api/moi")).rejects.toBeInstanceOf(ErreurReseau);
    }
  });

  it("réponse qui n'est pas du JSON : phrase générique", async () => {
    const { f } = faux(() => new Response("<html>oups</html>", { status: 500 }));
    const e = await new ClientApi({ base: "", fetch: f }).requete("GET", "/api/moi").catch((x) => x);
    expect(e).toMatchObject({ statut: 500, message: "Erreur du serveur (500)." });
  });
});

describe("fond serveur : routes de l'API", () => {
  it("chaque méthode du fond appelle la bonne route", async () => {
    const { f, appels } = faux((a) => (a.url.includes("/api/donnees/") && a.methode === "GET" ? json(null) : json({})));
    const fond = creerFondServeur(new ClientApi({ base: "https://s.fr", jeton: "t", fetch: f }));
    await fond.pluginsList();
    await fond.documentsList({ pluginId: "maths", appId: "pythagore", limit: 3 });
    await fond.documentsList();
    await fond.documentRead("3f2a9c1e");
    await fond.documentSave({ pluginId: "p", appId: "a", dataVersion: 1, title: "T", summary: "", data: {}, versionAttendue: 2 });
    await fond.documentDelete("3f2a9c1e");
    await fond.storeLoad();
    await fond.storeSave({ settings: {} });
    expect(await fond.dataRead("plugin.economie")).toBeNull();
    await fond.dataWrite("plugin.economie", { a: 1 });
    expect(appels.map((a) => `${a.methode} ${a.url.replace("https://s.fr", "")}`)).toEqual([
      "GET /api/plugins",
      "GET /api/documents?plugin=maths&app=pythagore&limite=3",
      "GET /api/documents",
      "GET /api/documents/3f2a9c1e",
      "PUT /api/documents",
      "DELETE /api/documents/3f2a9c1e",
      "GET /api/reglages",
      "PUT /api/reglages",
      "GET /api/donnees/plugin.economie",
      "PUT /api/donnees/plugin.economie",
    ]);
    expect(appels[4]?.corps).toMatchObject({ versionAttendue: 2 });
  });

  it("noms échappés dans l'adresse", async () => {
    const { f, appels } = faux(() => json(null));
    const fond = creerFondServeur(new ClientApi({ base: "", fetch: f }));
    await fond.dataRead("../x?y=1");
    expect(appels[0]?.url).toBe("/api/donnees/..%2Fx%3Fy%3D1");
  });

  it("catalogue et installation de plugins : gérés par l'administrateur", async () => {
    const fond = creerFondServeur(new ClientApi({ base: "", fetch: faux(() => json({})).f }));
    await expect(fond.catalogueRead()).rejects.toThrow("administrateur");
    await expect(fond.pluginInstall("x", "u")).rejects.toThrow("administrateur");
    await expect(fond.pluginInstallFile()).rejects.toThrow("administrateur");
    await expect(fond.pluginUninstall("x")).rejects.toThrow("administrateur");
  });

  it("identité et capacités : isolation complète, adresse des plugins du serveur", () => {
    const fond = creerFondServeur(new ClientApi({ base: "https://s.fr/", fetch: faux(() => json({})).f }));
    expect(fond.id).toBe("serveur");
    expect(fond.urlPlugins).toBe("https://s.fr/plugins");
    expect(fond.capacites).toMatchObject({ isolationComplete: true, catalogue: false, miseAJour: false, fenetresNatives: false });
  });
});
