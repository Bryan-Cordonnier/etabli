import { describe, expect, it } from "vitest";
import type { PluginInfo } from "../fond/types";
import { ClientApi } from "./http";
import { creerFondServeur, originePluginsSure } from "./fond";
import { cheminsAGarder } from "./horsLigne";

const client = (base: string) => new ClientApi({ base, fetch: (async () => new Response("{}")) as unknown as typeof fetch });

describe("origine dédiée aux plugins : jamais la même que l'application", () => {
  it("origine différente : acceptée (autre port, autre hôte)", () => {
    expect(originePluginsSure("http://192.168.1.20:4301/", client("http://192.168.1.20:4300"), "http://192.168.1.20:4300")).toBe("http://192.168.1.20:4301");
    expect(originePluginsSure("https://plugins.exemple.fr", client("https://etabli.exemple.fr"), "https://etabli.exemple.fr")).toBe("https://plugins.exemple.fr");
    expect(originePluginsSure("http://localhost:4301", client(""), "http://localhost:4300")).toBe("http://localhost:4301");
  });

  it("même origine que le serveur ou que la page : refusée (le cadre garderait l'accès à l'application)", () => {
    expect(originePluginsSure("http://192.168.1.20:4300", client("http://192.168.1.20:4300"), "http://192.168.1.20:4300")).toBeUndefined();
    expect(originePluginsSure("http://localhost:4300/autre", client(""), "http://localhost:4300")).toBeUndefined();
    // Page servie par une autre origine que le serveur : l'origine des plugins ne doit être aucune des deux.
    expect(originePluginsSure("http://localhost:4300", client("http://serveur:4300"), "http://localhost:4300")).toBeUndefined();
  });

  it("absente ou invalide : refusée", () => {
    for (const mauvais of [undefined, "", "pas une adresse", "javascript:alert(1)", "ftp://x.fr", "data:text/html,x"]) {
      expect(originePluginsSure(mauvais, client(""), "http://localhost:4300"), String(mauvais)).toBeUndefined();
    }
  });

  it("le fond annonce l'isolation opaque sans origine dédiée, et le cadre à origine propre avec elle", () => {
    const sans = creerFondServeur(client("https://s.fr"));
    expect(sans.capacites.isolationComplete).toBe(true);
    expect(sans.urlPlugins).toBe("https://s.fr/plugins");
    expect(sans.originePlugins).toBeUndefined();

    const avec = creerFondServeur(client("https://s.fr"), "https://plugins.s.fr");
    expect(avec.capacites.isolationComplete).toBe(false);
    expect(avec.urlPlugins).toBe("https://plugins.s.fr/plugins");
    expect(avec.originePlugins).toBe("https://plugins.s.fr");

    // Une origine dédiée qui serait en fait celle du serveur est ignorée : on reste en isolation opaque.
    const piege = creerFondServeur(client("https://s.fr"), "https://s.fr");
    expect(piege.capacites.isolationComplete).toBe(true);
    expect(piege.originePlugins).toBeUndefined();
  });
});

describe("fichiers à garder hors ligne", () => {
  it("chemins absolus, échappés, uniquement ceux d'un plugin valide", () => {
    const plugins: PluginInfo[] = [
      { manifest: { id: "maths" }, official: true, fichiers: ["manifest.json", "apps/pythagore/index.html", "assets/a b.js"] },
      { manifest: { id: "sans-liste" }, official: true },
      { manifest: {}, official: true, fichiers: ["x"] },
      { manifest: { id: "piege" }, official: true, fichiers: ["../secret", "a//b", "ok.js"] },
    ];
    expect(cheminsAGarder(plugins)).toEqual([
      "/plugins/maths/manifest.json",
      "/plugins/maths/apps/pythagore/index.html",
      "/plugins/maths/assets/a%20b.js",
      "/plugins/piege/ok.js",
    ]);
  });
});
