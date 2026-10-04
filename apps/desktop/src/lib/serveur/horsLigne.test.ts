import { describe, expect, it } from "vitest";
import type { PluginInfo } from "../fond/types";
import { ClientApi } from "./http";
import { creerFondServeur, idEstHote, modelePluginsSur, originePlugin } from "./fond";
import { cheminsAGarder } from "./horsLigne";

const client = (base: string) => new ClientApi({ base, fetch: (async () => new Response("{}")) as unknown as typeof fetch });

describe("origine propre à chaque plugin : jamais celle de l'application", () => {
  const sur = (modele: string | undefined, base: string, page: string) => modelePluginsSur(modele, client(base), page);

  it("modèle sûr : accepté (autre hôte ou autre port)", () => {
    expect(sur("http://{id}.plugins.home.lan:4301/", "http://192.168.1.20:4300", "http://192.168.1.20:4300")).toBe("http://{id}.plugins.home.lan:4301");
    expect(sur("https://{id}.plugins.exemple.fr", "https://etabli.exemple.fr", "https://etabli.exemple.fr")).toBe("https://{id}.plugins.exemple.fr");
    expect(sur("http://{id}.localhost:4301", "", "http://localhost:4300")).toBe("http://{id}.localhost:4301");
  });

  it("modèle qui retombe sur l'origine de l'application ou du serveur : refusé", () => {
    expect(sur("http://{id}.localhost:4300", "", "http://x.localhost:4300")).toBeUndefined();
    expect(sur("http://{id}.exemple.fr", "http://exemple.fr", "http://exemple.fr")).toBeDefined();
    // Application servie sur l'hôte « exemple.plugins.exemple.fr » : le plugin « exemple » aurait son origine.
    expect(sur("https://{id}.plugins.exemple.fr", "https://exemple.plugins.exemple.fr", "https://exemple.plugins.exemple.fr")).toBeUndefined();
  });

  it("modèle absent, partagé ou invalide : refusé", () => {
    for (const mauvais of [
      undefined,
      "",
      "pas une adresse",
      "javascript:alert(1)",
      "ftp://{id}.x.fr",
      "http://plugins.exemple.fr",
      "http://exemple.fr:4301",
      "http://{id}.exemple.fr/plugins",
      "http://a.{id}.exemple.fr",
      "http://{id}{id}.exemple.fr",
      "http://{id}.exemple.fr;frame-src *",
    ]) {
      expect(sur(mauvais, "", "http://localhost:4300"), String(mauvais)).toBeUndefined();
    }
  });

  it("l'origine d'un plugin ne se calcule que pour un identifiant utilisable comme nom d'hôte", () => {
    const m = "https://{id}.plugins.s.fr";
    expect(originePlugin(m, "maths")).toBe("https://maths.plugins.s.fr");
    expect(originePlugin(m, "economie-3d")).toBe("https://economie-3d.plugins.s.fr");
    for (const mauvais of ["", "-x", "x-", "a.b", "A", "a_b", "x".repeat(64), "a/b", "a@evil.com"]) {
      expect(originePlugin(m, mauvais), mauvais).toBeUndefined();
    }
    expect(idEstHote("x".repeat(63))).toBe(true);
  });

  it("le fond annonce une origine par plugin avec le modèle, et seulement le chemin du serveur sans lui", () => {
    const sans = creerFondServeur(client("https://s.fr"));
    expect(sans.capacites.isolationComplete).toBe(true);
    expect(sans.urlPlugins).toBe("https://s.fr/plugins");
    expect(sans.originePlugin).toBeUndefined();

    const avec = creerFondServeur(client("https://s.fr"), "https://{id}.plugins.s.fr");
    expect(avec.originePlugin?.("maths")).toBe("https://maths.plugins.s.fr");
    expect(avec.originePlugin?.("autre")).toBe("https://autre.plugins.s.fr");
    expect(avec.originePlugin?.("a.b")).toBeUndefined();

    // Un modèle qui serait en fait l'hôte du serveur est ignoré : on reste en isolation opaque.
    const piege = creerFondServeur(client("https://maths.s.fr"), "https://{id}.s.fr");
    expect(piege.originePlugin).toBeUndefined();
  });
});

describe("fichiers à garder hors ligne", () => {
  it("chemins absolus sur l'origine du plugin, échappés, sans évasion", () => {
    const plugin = (fichiers?: string[]): PluginInfo => ({ manifest: { id: "maths" }, official: true, ...(fichiers ? { fichiers } : {}) });
    expect(cheminsAGarder(plugin(["manifest.json", "apps/pythagore/index.html", "assets/a b.js"]))).toEqual([
      "/manifest.json",
      "/apps/pythagore/index.html",
      "/assets/a%20b.js",
    ]);
    expect(cheminsAGarder(plugin())).toEqual([]);
    expect(cheminsAGarder(plugin(["../secret", "a//b", "ok.js", ""]))).toEqual(["/ok.js"]);
  });
});
