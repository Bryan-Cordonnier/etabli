import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const listen = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import { fondTauri } from "./tauri";

// Ces tests figent le contrat avec le cœur Rust : noms des commandes et forme des arguments
// (apps/desktop/src-tauri/src). Un renommage côté Rust doit les faire échouer.
describe("fond Tauri : commandes du cœur Rust", () => {
  beforeEach(() => {
    invoke.mockReset().mockResolvedValue(undefined);
    listen.mockReset().mockResolvedValue(() => {});
  });

  it("documents", async () => {
    await fondTauri.documentsList({ pluginId: "maths", limit: 3 });
    expect(invoke).toHaveBeenLastCalledWith("documents_list", { pluginId: "maths", limit: 3 });
    await fondTauri.documentsList();
    expect(invoke).toHaveBeenLastCalledWith("documents_list", {});
    await fondTauri.documentRead("abc");
    expect(invoke).toHaveBeenLastCalledWith("document_read", { id: "abc" });
    const document = { pluginId: "p", appId: "a", dataVersion: 1, title: "t", summary: "s", data: {} };
    await fondTauri.documentSave(document);
    expect(invoke).toHaveBeenLastCalledWith("document_save", { document });
    await fondTauri.documentDelete("abc");
    expect(invoke).toHaveBeenLastCalledWith("document_delete", { id: "abc" });
  });

  it("réglages et données", async () => {
    await fondTauri.storeLoad();
    expect(invoke).toHaveBeenLastCalledWith("store_load");
    await fondTauri.storeSave({ settings: {} });
    expect(invoke).toHaveBeenLastCalledWith("store_save", { value: { settings: {} } });
    await fondTauri.dataRead("plugin.economie");
    expect(invoke).toHaveBeenLastCalledWith("donnees_lire", { nom: "plugin.economie" });
    await fondTauri.dataWrite("plugin.economie", { a: 1 });
    expect(invoke).toHaveBeenLastCalledWith("donnees_ecrire", { nom: "plugin.economie", valeur: { a: 1 } });
  });

  it("plugins et catalogue", async () => {
    await fondTauri.pluginsList();
    expect(invoke).toHaveBeenLastCalledWith("plugins_list");
    await fondTauri.catalogueRead();
    expect(invoke).toHaveBeenLastCalledWith("catalogue_lire");
    await fondTauri.pluginInstall("maths", "https://exemple/maths.etabli-plugin");
    expect(invoke).toHaveBeenLastCalledWith("plugin_installer", { id: "maths", url: "https://exemple/maths.etabli-plugin" });
    await fondTauri.pluginInstallFile();
    expect(invoke).toHaveBeenLastCalledWith("plugin_installer_fichier");
    await fondTauri.pluginUninstall("maths");
    expect(invoke).toHaveBeenLastCalledWith("plugin_desinstaller", { id: "maths" });
  });

  it("enregistrement de fichier : arguments en français pour Rust", async () => {
    await fondTauri.saveFile({ name: "piece.dxf", content: "0\nSECTION", extension: "dxf", description: "Dessin DXF" });
    expect(invoke).toHaveBeenLastCalledWith("fichier_enregistrer", {
      nom: "piece.dxf",
      contenu: "0\nSECTION",
      extension: "dxf",
      description: "Dessin DXF",
    });
  });

  it("événements", async () => {
    const handler = vi.fn();
    await fondTauri.onPluginsChanged(handler);
    expect(listen).toHaveBeenLastCalledWith("etabli:plugins", expect.any(Function));
    const rappel = listen.mock.calls[0]?.[1] as () => void;
    rappel();
    expect(handler).toHaveBeenCalledTimes(1);

    const progression = vi.fn();
    await fondTauri.onInstallProgress(progression);
    expect(listen).toHaveBeenLastCalledWith("etabli:installation", expect.any(Function));
    (listen.mock.calls[1]?.[1] as (e: { payload: unknown }) => void)({ payload: { id: "maths", pourcent: 40 } });
    expect(progression).toHaveBeenCalledWith({ id: "maths", pourcent: 40 });
  });

  it("capacités : toutes vraies", () => {
    expect(fondTauri.id).toBe("tauri");
    expect(Object.values(fondTauri.capacites)).toEqual([true, true, true, true, true]);
  });
});
