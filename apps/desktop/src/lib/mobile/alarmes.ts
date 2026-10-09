import { invoke, isTauri } from "@tauri-apps/api/core";
import { distribution } from "../distribution";

// Alarmes locales du téléphone (docs/16 §6) : notifications exactes même application fermée, via le plugin Tauri. Sert
// d'abord à l'essai d'alarme des Paramètres (l'usage principal : rappels de départ et de coucher à l'heure près).

/** Forme des notifications utilisée ici (celle de l'ancien plugin Capacitor) : pluginNatif l'adapte au plugin Tauri, et les tests la remplacent. */
export interface PluginNotifications {
  checkPermissions(): Promise<{ display: string }>;
  requestPermissions(): Promise<{ display: string }>;
  checkExactNotificationSetting(): Promise<{ exact_alarm: string }>;
  changeExactNotificationSetting(): Promise<{ exact_alarm: string }>;
  createChannel(canal: { id: string; name: string; importance: 1 | 2 | 3 | 4 | 5; vibration: boolean }): Promise<void>;
  schedule(options: {
    notifications: {
      id: number;
      title: string;
      body: string;
      channelId: string;
      schedule: { at: Date; allowWhileIdle: boolean };
      /** Données gardées avec la notification (par exemple le plugin qui l'a demandée). */
      extra?: Record<string, unknown>;
    }[];
  }): Promise<unknown>;
  getPending(): Promise<{ notifications: { id: number }[] }>;
  cancel(options: { notifications: { id: number }[] }): Promise<void>;
}

export interface EtatAlarmes {
  notifications: boolean;
  /** Android 12+ : l'utilisateur peut refuser les alarmes exactes ; sans elles, l'heure n'est pas garantie. */
  exactes: boolean;
}

export const CANAL = "rappels";
export const ID_ESSAI = 900001;

/** Vrai dans l'application Android (Tauri mobile), faux dans un navigateur ou sur PC. */
export function estNatif(): boolean {
  return isTauri() && typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

/**
 * Le plugin Tauri de notifications, sous la forme attendue ici. Les alarmes exactes sont déclarées dans le manifeste Android
 * (USE_EXACT_ALARM, accordée d'office aux applications installées hors Play Store) : il n'y a ni réglage à ouvrir ni état à lire,
 * exactes vaut toujours « accordée ».
 */
export async function pluginNatif(): Promise<PluginNotifications> {
  const n = await import("@tauri-apps/plugin-notification");
  return {
    checkPermissions: async () => ({ display: (await n.isPermissionGranted()) ? "granted" : "prompt" }),
    requestPermissions: async () => ({ display: (await n.requestPermission()) === "granted" ? "granted" : "denied" }),
    checkExactNotificationSetting: async () => ({ exact_alarm: "granted" }),
    changeExactNotificationSetting: async () => ({ exact_alarm: "granted" }),
    // Android connaît des importances de 1 à 5 ; le plugin Tauri s'arrête à 4 (« haute » : bandeau et son).
    createChannel: (c) => n.createChannel({ id: c.id, name: c.name, importance: Math.min(c.importance, 4) as 1 | 2 | 3 | 4, vibration: c.vibration }),
    // atch et non sendNotification : seule la commande atch enregistre la notification (pour la rendre après un
    // redémarrage du téléphone et pour pending). Le plugin garde sourceJson tel quel et le relit au redémarrage : sans lui,
    // il stocke « null » et ne restaure rien.
    schedule: async ({ notifications }) => {
      await invoke("plugin:notification|batch", {
        notifications: notifications.map((x) => {
          const options = {
            id: x.id,
            title: x.title,
            body: x.body,
            channelId: x.channelId,
            schedule: n.Schedule.at(x.schedule.at, false, x.schedule.allowWhileIdle),
            ...(x.extra ? { extra: x.extra } : {}),
          };
          return { ...options, sourceJson: JSON.stringify(options) };
        }),
      });
    },
    getPending: async () => ({ notifications: (await n.pending()).map((p) => ({ id: p.id })) }),
    cancel: async ({ notifications }) => n.cancel(notifications.map((x) => x.id)),
  };
}

export async function lireEtat(plugin: PluginNotifications): Promise<EtatAlarmes> {
  const [n, e] = await Promise.all([plugin.checkPermissions(), plugin.checkExactNotificationSetting()]);
  return { notifications: n.display === "granted", exactes: e.exact_alarm === "granted" };
}

/** Demande les autorisations manquantes (la seconde ouvre les réglages Android). */
export async function autoriser(plugin: PluginNotifications): Promise<EtatAlarmes> {
  let etat = await lireEtat(plugin);
  if (!etat.notifications) await plugin.requestPermissions();
  etat = await lireEtat(plugin);
  if (etat.notifications && !etat.exactes) await plugin.changeExactNotificationSetting();
  return lireEtat(plugin);
}

/** Programme l'alarme d'essai à `maintenant + minutes` ; renvoie l'heure prévue. */
export async function programmerEssai(plugin: PluginNotifications, minutes: number, maintenant = new Date()): Promise<Date> {
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 24 * 60) throw new Error("Durée d'essai invalide (1 minute à 24 h).");
  await plugin.createChannel({ id: CANAL, name: "Rappels", importance: 5, vibration: true });
  const at = new Date(maintenant.getTime() + minutes * 60_000);
  await plugin.schedule({
    notifications: [
      {
        id: ID_ESSAI,
        title: `${distribution.name} — essai d'alarme`,
        body: `Programmée pour ${at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`,
        channelId: CANAL,
        schedule: { at, allowWhileIdle: true },
      },
    ],
  });
  return at;
}

export async function annulerEssai(plugin: PluginNotifications): Promise<void> {
  await plugin.cancel({ notifications: [{ id: ID_ESSAI }] });
}

export async function essaiEnAttente(plugin: PluginNotifications): Promise<boolean> {
  return (await plugin.getPending()).notifications.some((n) => n.id === ID_ESSAI);
}
