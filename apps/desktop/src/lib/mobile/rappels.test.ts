// Rappels sur le téléphone : un plugin remplace SA liste, jamais celle d'un autre ; refus de l'utilisateur = pas d'erreur ; rien sur PC.
import { REMINDERS_HORIZON_MS, REMINDERS_MAX, type Reminder } from "@etabli/sdk/protocol";
import { describe, expect, it } from "vitest";
import { ID_ESSAI, type PluginNotifications } from "./alarmes";
import { CANAL_RAPPELS, etatRappels, idNatif, programmerRappels, type DepsRappels } from "./rappels";

const MAINTENANT = Date.parse("2026-10-05T10:00:00Z");
const H = 3600_000;

function faux(options: { notifications?: boolean; exactes?: boolean; echecSchedule?: boolean } = {}) {
  const { notifications = true, exactes = true, echecSchedule = false } = options;
  const programmees = new Map<number, { title: string; body: string; at: Date; extra?: Record<string, unknown> }>();
  const canaux: unknown[] = [];
  const annulations: number[][] = [];
  const plugin: PluginNotifications = {
    checkPermissions: async () => ({ display: notifications ? "granted" : "denied" }),
    requestPermissions: async () => ({ display: "denied" }),
    checkExactNotificationSetting: async () => ({ exact_alarm: exactes ? "granted" : "denied" }),
    changeExactNotificationSetting: async () => ({ exact_alarm: "denied" }),
    createChannel: async (c) => void canaux.push(c),
    schedule: async ({ notifications: liste }) => {
      if (echecSchedule) throw new Error("boom");
      for (const n of liste) programmees.set(n.id, { title: n.title, body: n.body, at: n.schedule.at, extra: n.extra });
      return {};
    },
    getPending: async () => ({ notifications: [...programmees.keys()].map((id) => ({ id })) }),
    cancel: async ({ notifications: liste }) => {
      annulations.push(liste.map((n) => n.id));
      for (const n of liste) programmees.delete(n.id);
    },
  };
  const stockage = new Map<string, number[]>();
  const deps: DepsRappels = {
    plugin,
    lireIds: async (id) => stockage.get(id) ?? [],
    ecrireIds: async (id, ids) => void stockage.set(id, ids),
    maintenant: () => MAINTENANT,
  };
  return { deps, programmees, canaux, annulations, stockage };
}

const rappel = (id: string, dans: number, extra: Partial<Reminder> = {}): Reminder => ({ id, at: MAINTENANT + dans, title: `Rappel ${id}`, ...extra });

describe("identifiants natifs", () => {
  it("stables, différents d'un plugin à l'autre, jamais celui de l'essai d'alarme", () => {
    expect(idNatif("agenda", "a")).toBe(idNatif("agenda", "a"));
    expect(idNatif("agenda", "a")).not.toBe(idNatif("budget", "a"));
    expect(idNatif("agenda", "a")).toBeGreaterThan(0);
    expect(idNatif("agenda", "a")).toBeLessThanOrEqual(2_000_000_000);
    expect(idNatif("x", "y", new Set([idNatif("x", "y")]))).not.toBe(idNatif("x", "y"));
    expect(idNatif("x", "y")).not.toBe(ID_ESSAI);
  });
});

describe("programmer", () => {
  it("programme des notifications (canal à importance 4, pas une alarme) avec le titre, le texte et le plugin d'origine", async () => {
    const f = faux();
    const r = await programmerRappels(f.deps, "agenda", [rappel("r1", 2 * H, { text: "Pars dans 5 min" })]);
    expect(r).toEqual({ ok: true, autorise: true, alarmeExacte: true, programmes: 1, jusquau: MAINTENANT + REMINDERS_HORIZON_MS });
    expect(f.canaux).toEqual([{ id: CANAL_RAPPELS, name: "Rappels", importance: 4, vibration: true }]);
    const [n] = [...f.programmees.values()];
    expect(n).toMatchObject({ title: "Rappel r1", body: "Pars dans 5 min", extra: { plugin: "agenda", rappel: "r1" } });
    expect(n?.at.getTime()).toBe(MAINTENANT + 2 * H);
  });

  it("remplace la liste du plugin : l'ancienne est annulée, la nouvelle programmée, les autres plugins ne sont pas touchés", async () => {
    const f = faux();
    await programmerRappels(f.deps, "budget", [rappel("b1", H)]);
    await programmerRappels(f.deps, "agenda", [rappel("a1", H), rappel("a2", 2 * H)]);
    expect(f.programmees.size).toBe(3);
    const r = await programmerRappels(f.deps, "agenda", [rappel("a3", 3 * H)]);
    expect(r).toMatchObject({ ok: true, programmes: 1 });
    expect(f.programmees.size).toBe(2);
    expect([...f.programmees.values()].map((n) => n.title).sort()).toEqual(["Rappel a3", "Rappel b1"]);
    expect(f.annulations.at(-1)).toHaveLength(2);
  });

  it("une liste vide annule tout ce que le plugin avait programmé", async () => {
    const f = faux();
    await programmerRappels(f.deps, "agenda", [rappel("a1", H)]);
    const r = await programmerRappels(f.deps, "agenda", []);
    expect(r).toMatchObject({ ok: true, programmes: 0 });
    expect(f.programmees.size).toBe(0);
    expect(f.stockage.get("agenda")).toEqual([]);
  });

  it("ignore le passé, l'instant trop proche et ce qui dépasse l'horizon de 60 jours", async () => {
    const f = faux();
    const r = await programmerRappels(f.deps, "agenda", [rappel("passe", -H), rappel("trop-proche", 2000), rappel("ok", H), rappel("loin", REMINDERS_HORIZON_MS + H)]);
    expect(r).toMatchObject({ ok: true, programmes: 1 });
    expect([...f.programmees.values()].map((n) => n.title)).toEqual(["Rappel ok"]);
  });

  it("notifications refusées par l'utilisateur : ce n'est pas une erreur, rien n'est programmé, le plugin peut le dire", async () => {
    const f = faux({ notifications: false });
    const r = await programmerRappels(f.deps, "agenda", [rappel("r1", H)]);
    expect(r).toEqual({ ok: true, autorise: false, alarmeExacte: true, programmes: 0, jusquau: null });
    expect(f.programmees.size).toBe(0);
  });

  it("alarmes exactes refusées (Android 12+) : programmé quand même, avec l'avertissement", async () => {
    const r = await programmerRappels(faux({ exactes: false }).deps, "agenda", [rappel("r1", H)]);
    expect(r).toMatchObject({ ok: true, programmes: 1, alarmeExacte: false });
  });

  it("sur PC (pas de plugin natif) : « téléphone seulement », sans rien tenter", async () => {
    const f = faux();
    const r = await programmerRappels({ ...f.deps, plugin: null }, "agenda", [rappel("r1", H)]);
    expect(r).toMatchObject({ ok: false, code: "telephone_seulement" });
    expect(await etatRappels({ ...f.deps, plugin: null }, "agenda")).toMatchObject({ ok: false, code: "telephone_seulement" });
  });

  it("une panne du téléphone est une erreur typée, et ne laisse pas d'identifiants fantômes", async () => {
    const f = faux({ echecSchedule: true });
    const r = await programmerRappels(f.deps, "agenda", [rappel("r1", H)]);
    expect(r).toMatchObject({ ok: false, code: "erreur" });
    expect(f.stockage.get("agenda")).toEqual([]);
  });

  it("plus de 200 rappels : refusé", async () => {
    const trop = Array.from({ length: REMINDERS_MAX + 1 }, (_, i) => rappel(`r${i}`, H + i));
    expect(await programmerRappels(faux().deps, "agenda", trop)).toMatchObject({ ok: false, code: "argument_invalide" });
  });
});

describe("état", () => {
  it("dit les autorisations et combien de rappels de CE plugin sont programmés", async () => {
    const f = faux();
    await programmerRappels(f.deps, "budget", [rappel("b1", H)]);
    await programmerRappels(f.deps, "agenda", [rappel("a1", H), rappel("a2", 2 * H)]);
    expect(await etatRappels(f.deps, "agenda")).toEqual({ ok: true, autorise: true, alarmeExacte: true, programmes: 2, jusquau: MAINTENANT + REMINDERS_HORIZON_MS });
    expect(await etatRappels(faux({ notifications: false }).deps, "agenda")).toMatchObject({ ok: true, autorise: false, jusquau: null });
  });
});
