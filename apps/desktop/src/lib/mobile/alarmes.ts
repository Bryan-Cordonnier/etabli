// Alarmes locales du téléphone (docs/16 §6) : notifications exactes même application fermée, via Capacitor. Sert
// d'abord à l'essai d'alarme des Paramètres (l'usage principal : rappels de départ et de coucher à l'heure près).

/** Partie du plugin `@capacitor/local-notifications` utilisée ici (permet de la remplacer dans les tests). */
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

/** Vrai dans l'application Android (Capacitor), faux dans un navigateur ou sur PC. */
export function estNatif(): boolean {
  const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!c?.isNativePlatform?.();
}

export async function pluginNatif(): Promise<PluginNotifications> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return LocalNotifications as unknown as PluginNotifications;
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
        title: "Établi — essai d'alarme",
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
