import { api, inTauri } from "$lib/api";
import { ICONS, type IconName } from "$lib/icons";
import type { MiniAppManifest, PluginManifest } from "$lib/types";

/** Plugins installés, remplis une fois au démarrage par `loadPlugins()`. */
export const PLUGINS: PluginManifest[] = [];

export interface MiniAppRef {
  plugin: PluginManifest;
  app: MiniAppManifest;
}

/**
 * Charge les manifestes (cahier des charges, section 8.2) : depuis le cœur Rust dans
 * l'application, depuis les fichiers du dépôt dans l'aperçu navigateur.
 */
export async function loadPlugins(): Promise<void> {
  const raw = inTauri ? await api.pluginsList().catch(() => []) : repositoryManifests();
  const plugins = raw.map(({ manifest, official }) => normalize(manifest, official)).filter((p) => p !== null);
  plugins.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "fr"));
  PLUGINS.splice(0, PLUGINS.length, ...plugins);
}

/** Ordre par défaut de la colonne : les plugins officiels dans l'ordre du cahier des charges, puis les autres. */
const OFFICIAL_ORDER = ["maths", "economie", "tolerie", "materiaux", "chaudronnerie"];
const rank = (plugin: PluginManifest) => {
  const index = OFFICIAL_ORDER.indexOf(plugin.id);
  return plugin.official && index >= 0 ? index : OFFICIAL_ORDER.length;
};

function repositoryManifests(): { manifest: unknown; official: boolean }[] {
  const files = import.meta.glob<unknown>(
    ["../../../../../plugins/*/manifest.json", "../../../../../plugins/*/public/manifest.json"],
    { eager: true, import: "default" },
  );
  return Object.values(files).map((manifest) => ({ manifest, official: true }));
}

const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const icon = (value: unknown): IconName => (typeof value === "string" && value in ICONS ? (value as IconName) : "puzzle");

/** Valide un manifeste et complète les champs facultatifs. Renvoie null s'il est inutilisable. */
function normalize(raw: unknown, official: boolean): PluginManifest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const id = text(m.id);
  if (!id || !Array.isArray(m.miniApps)) return null;

  const miniApps: MiniAppManifest[] = m.miniApps
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null && typeof a.id === "string")
    .map((a) => ({
      id: text(a.id),
      name: text(a.name, text(a.id)),
      description: text(a.description),
      icon: icon(a.icon),
      emoji: text(a.emoji, "🧩"),
      entry: typeof a.entry === "string" ? a.entry : undefined,
      dataVersion: typeof a.dataVersion === "number" ? a.dataVersion : 1,
      plannedFor: a.plannedFor === "v2" ? "v2" : "v1",
      accepts: Array.isArray(a.accepts) ? a.accepts.filter((k): k is string => typeof k === "string") : [],
    }));

  return {
    id,
    name: text(m.name, id),
    description: text(m.description),
    version: text(m.version, "0.0.0"),
    apiVersion: text(m.apiVersion, "^1"),
    author: text(m.author),
    color: text(m.color, "#6b7280"),
    emoji: text(m.emoji, "🧩"),
    icon: icon(m.icon),
    permissions: Array.isArray(m.permissions) ? m.permissions.filter((p) => typeof p === "string") : [],
    official,
    miniApps,
  };
}

/** Adresse d'un fichier de plugin, servie par le cœur Rust (voir plugins.rs). */
export function pluginUrl(pluginId: string, path: string): string {
  // Sous Windows, WebView2 expose les protocoles personnalisés en http://<nom>.localhost.
  // Dans l'aperçu navigateur, c'est le serveur Vite qui sert les plugins (voir vite.config.ts).
  const base = !inTauri
    ? "/__plugins"
    : navigator.userAgent.includes("Windows")
      ? "http://plugins.localhost"
      : "plugins://localhost";
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/${encodeURIComponent(pluginId)}/${encoded}`;
}

/** Identifiant global d'une mini-app, utilisé pour les favoris : « plugin/mini-app ». */
export const appKey = (pluginId: string, appId: string): string => `${pluginId}/${appId}`;

export function getPlugin(id: string): PluginManifest | undefined {
  return PLUGINS.find((p) => p.id === id);
}

export function getMiniApp(pluginId: string, appId: string): MiniAppRef | undefined {
  const plugin = getPlugin(pluginId);
  const app = plugin?.miniApps.find((a) => a.id === appId);
  return plugin && app ? { plugin, app } : undefined;
}

export function getMiniAppByKey(key: string): MiniAppRef | undefined {
  const [pluginId = "", appId = ""] = key.split("/");
  return getMiniApp(pluginId, appId);
}

export function allMiniApps(): MiniAppRef[] {
  return PLUGINS.flatMap((plugin) => plugin.miniApps.map((app) => ({ plugin, app })));
}
