import { describe, expect, it, vi } from "vitest";
import { annulerEssai, autoriser, CANAL, estNatif, ID_ESSAI, lireEtat, programmerEssai, type PluginNotifications } from "./alarmes";

function faux(refus = false): PluginNotifications & { appels: string[] } {
  const appels: string[] = [];
  let notif = refus ? "denied" : "prompt";
  let exact = "denied";
  return {
    appels,
    checkPermissions: async () => ({ display: notif }),
    requestPermissions: async () => {
      appels.push("demande");
      notif = refus ? "denied" : "granted";
      return { display: notif };
    },
    checkExactNotificationSetting: async () => ({ exact_alarm: exact }),
    changeExactNotificationSetting: async () => {
      appels.push("exactes");
      exact = "granted";
      return { exact_alarm: exact };
    },
    createChannel: async () => void appels.push("canal"),
    schedule: vi.fn(async () => undefined),
    getPending: async () => ({ notifications: [] }),
    cancel: vi.fn(async () => undefined),
  };
}

describe("alarmes", () => {
  it("n'est natif que dans Capacitor", () => {
    expect(estNatif()).toBe(false);
    (globalThis as Record<string, unknown>).Capacitor = { isNativePlatform: () => true };
    expect(estNatif()).toBe(true);
    delete (globalThis as Record<string, unknown>).Capacitor;
  });

  it("demande notifications puis alarmes exactes", async () => {
    const p = faux();
    expect(await lireEtat(p)).toEqual({ notifications: false, exactes: false });
    expect(await autoriser(p)).toEqual({ notifications: true, exactes: true });
    expect(p.appels).toEqual(["demande", "exactes"]);
  });

  it("ne demande pas les alarmes exactes si les notifications sont refusées", async () => {
    const p = faux(true);
    expect(await autoriser(p)).toEqual({ notifications: false, exactes: false });
    expect(p.appels).toEqual(["demande"]);
  });

  it("programme l'essai à l'heure demandée, en autorisant le mode veille", async () => {
    const p = faux();
    const t0 = new Date("2026-10-03T20:00:00Z");
    const at = await programmerEssai(p, 5, t0);
    expect(at.toISOString()).toBe("2026-10-03T20:05:00.000Z");
    const arg = vi.mocked(p.schedule).mock.calls[0]![0].notifications[0]!;
    expect(arg).toMatchObject({ id: ID_ESSAI, channelId: CANAL, schedule: { at, allowWhileIdle: true } });
  });

  it("refuse une durée absurde et annule l'essai", async () => {
    const p = faux();
    await expect(programmerEssai(p, 0)).rejects.toThrow();
    await expect(programmerEssai(p, 99999)).rejects.toThrow();
    await annulerEssai(p);
    expect(p.cancel).toHaveBeenCalledWith({ notifications: [{ id: ID_ESSAI }] });
  });
});
