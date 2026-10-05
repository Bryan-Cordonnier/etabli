// Une lecture de réglages qui échoue ne doit jamais passer pour « rien d'enregistré » : sinon un plugin repart de zéro
// et écrase ses vraies données (cahier de bord, Finances, point 6).
import { beforeEach, describe, expect, it, vi } from "vitest";

const dataRead = vi.fn();
const dataWrite = vi.fn(async (_fichier: string, _valeur: unknown): Promise<void> => undefined);
const notify = vi.fn();

vi.mock("$lib/api", () => ({ api: { dataRead, dataWrite } }));
vi.mock("./ui.svelte", () => ({ ui: { notify } }));
// Écriture immédiate : on teste ici la décision d'écrire, pas le délai de 400 ms.
vi.mock("$lib/dataFiles", () => ({
  DataFiles: class {
    pending = () => false;
    schedule = (file: string, valeur: () => unknown) => void dataWrite(file, valeur());
  },
}));

// Vitest ne compile pas les runes Svelte : `$state(x)` et `$state.snapshot(x)` valent `x` pour ce test.
const g = globalThis as Record<string, unknown>;
g["$state"] = Object.assign(<T>(valeur: T) => valeur, { snapshot: <T>(valeur: T) => valeur });

const { pluginData } = await import("./pluginData.svelte");

beforeEach(() => {
  dataRead.mockReset();
  dataWrite.mockClear();
  notify.mockClear();
});

describe("réglages de plugin", () => {
  it("fichier absent : null, et l'enregistrement reste permis", async () => {
    dataRead.mockResolvedValue(null);
    expect(await pluginData.load("vide")).toBeNull();
    expect(pluginData.illisible("vide")).toBe(false);
    pluginData.set("vide", { v: 1 });
    expect(dataWrite).toHaveBeenCalledWith("plugin.vide", { v: 1 });
  });

  it("lecture en échec : le plugin est signalé, l'utilisateur prévenu, rien n'est écrit", async () => {
    dataRead.mockRejectedValue("Les données « plugin.finances » sont abîmées.");
    expect(await pluginData.load("finances")).toBeNull();
    expect(pluginData.illisible("finances")).toBe(true);
    expect(notify).toHaveBeenCalledOnce();
    pluginData.set("finances", { ecritures: [] });
    expect(dataWrite).not.toHaveBeenCalled();
  });

  it("une lecture réussie ensuite lève le blocage", async () => {
    dataRead.mockRejectedValueOnce("abîmé");
    await pluginData.load("recupere");
    expect(pluginData.illisible("recupere")).toBe(true);
    dataRead.mockResolvedValueOnce({ ok: true });
    expect(await pluginData.load("recupere")).toEqual({ ok: true });
    expect(pluginData.illisible("recupere")).toBe(false);
    pluginData.set("recupere", { ok: false });
    expect(dataWrite).toHaveBeenCalledWith("plugin.recupere", { ok: false });
  });
});
