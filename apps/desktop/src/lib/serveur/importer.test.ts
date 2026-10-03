import { describe, expect, it } from "vitest";
import type { DocumentFile, ExportComplet } from "../fond/types";
import { ClientApi } from "./http";
import { apercu, importer } from "./importer";

const doc = (id: string, titre: string): DocumentFile => ({
  format: 1, id, pluginId: "maths", appId: "pythagore", dataVersion: 1, title: titre, summary: "", created: 1, modified: 2, appVersion: "t", data: { a: "3" },
});

/** Faux serveur : ce qu'il contient déjà, et ce qu'il reçoit. */
function serveur(existants: { documents?: string[]; donnees?: Record<string, unknown>; reglages?: Record<string, unknown> } = {}) {
  const recus: { methode: string; chemin: string; corps?: unknown }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const chemin = String(url);
    const methode = init?.method ?? "GET";
    recus.push({ methode, chemin, corps: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (c: unknown, statut = 200) => new Response(JSON.stringify(c), { status: statut });
    if (methode === "GET" && chemin === "/api/documents") return json((existants.documents ?? []).map((id) => ({ id })));
    if (methode === "GET" && chemin.startsWith("/api/donnees/")) return json(existants.donnees?.[decodeURIComponent(chemin.slice(13))] ?? null);
    if (methode === "GET" && chemin === "/api/reglages") return json(existants.reglages ?? {});
    if (methode === "PUT" && chemin === "/api/documents" && JSON.parse(String(init?.body)).title === "Refusé") return json({ erreur: "Trop volumineux." }, 413);
    return json({ ok: true });
  }) as unknown as typeof fetch;
  return { client: new ClientApi({ base: "", jeton: "t", fetch: f }), recus };
}

const tout = (): ExportComplet => ({
  documents: [doc("aaaaaaaa", "Un"), doc("bbbbbbbb", "Deux")],
  donnees: { "plugin.economie": { barre: 6000 }, "plugin.machines": { scies: [] } },
  reglages: { settings: { theme: "sombre" } },
});

describe("import des données locales vers le serveur", () => {
  it("aperçu : ce qui sera importé", () => {
    expect(apercu(tout())).toEqual({ documents: 2, donnees: 2, reglages: true });
    expect(apercu({ documents: [], donnees: {}, reglages: {} })).toEqual({ documents: 0, donnees: 0, reglages: false });
  });

  it("serveur vide : tout est envoyé, calculs avec leur identifiant", async () => {
    const { client, recus } = serveur();
    const progres: string[] = [];
    const bilan = await importer(client, tout(), (f, t) => progres.push(`${f}/${t}`));
    expect(bilan).toMatchObject({ documentsImportes: 2, documentsDejaPresents: 0, donneesImportees: 2, reglagesImportes: true, refus: [] });
    const envoyes = recus.filter((r) => r.methode === "PUT" && r.chemin === "/api/documents").map((r) => (r.corps as { id: string }).id);
    expect(envoyes).toEqual(["aaaaaaaa", "bbbbbbbb"]);
    expect(progres.at(-1)).toBe("5/5");
  });

  it("n'écrase jamais ce que le serveur a déjà", async () => {
    const { client, recus } = serveur({ documents: ["aaaaaaaa"], donnees: { "plugin.economie": { barre: 1 } }, reglages: { settings: { theme: "clair" } } });
    const bilan = await importer(client, tout(), () => {});
    expect(bilan).toMatchObject({ documentsImportes: 1, documentsDejaPresents: 1, donneesImportees: 1, donneesDejaPresentes: 1, reglagesImportes: false });
    expect(recus.filter((r) => r.methode === "PUT").map((r) => r.chemin)).toEqual(["/api/documents", "/api/donnees/plugin.machines"]);
  });

  it("un calcul refusé est signalé sans arrêter les suivants", async () => {
    const { client } = serveur();
    const bilan = await importer(client, { ...tout(), documents: [doc("aaaaaaaa", "Refusé"), doc("bbbbbbbb", "Bon")] }, () => {});
    expect(bilan.documentsImportes).toBe(1);
    expect(bilan.refus).toEqual(["« Refusé » : Trop volumineux."]);
  });
});
