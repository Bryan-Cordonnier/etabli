import { majRevoques } from "./revoques.svelte";
import { api, type PluginSource } from "$lib/api";
import { ICONS, type IconName } from "$lib/icons";
import { problemsOf, type InstalledNode, type Problem } from "@etabli/sdk/deps";
import { settings } from "$lib/state/settings.svelte";
import { cheminRelatif, fonctionsDe } from "./manifeste";
import type { MiniAppManifest, PluginManifest, PluginSettingsPage } from "$lib/types";

/**
 * Plugins installés : remplis au démarrage par `loadPlugins()`, puis rechargés après chaque
 * installation ou désinstallation (liste réactive : l'interface suit sans redémarrer).
 */
export const PLUGINS = $state<PluginManifest[]>([]);

export interface MiniAppRef {
  plugin: PluginManifest;
  app: MiniAppManifest;
}

/**
 * Charge les manifestes (cahier des charges, section 8.2) via le fond : cœur Rust dans l'application,
 * `plugins/index.json` servi avec la version web (et par Vite en développement).
 */
export async function loadPlugins(): Promise<void> {
  const raw = await api.pluginsList().catch(() => []);
  const plugins = raw
    .map(({ manifest, official, source, revoque, precedente }) => {
      const plugin = normalize(manifest, official, source ?? (official ? "integre" : "utilisateur"));
      if (!plugin) return null;
      if (typeof revoque === "string") plugin.revoked = revoque;
      if (typeof precedente === "string") plugin.previousVersion = precedente;
      return plugin;
    })
    .filter((p) => p !== null);
  majRevoques(plugins.flatMap((p) => (p.revoked ? [{ id: p.id, raison: p.revoked }] : [])));
  plugins.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "fr"));
  PLUGINS.splice(0, PLUGINS.length, ...plugins);
}

/** Ordre par défaut de la colonne : les plugins officiels dans l'ordre du cahier des charges, puis les autres. */
const OFFICIAL_ORDER = ["maths", "economie", "tolerie", "tracage", "materiaux"];
const rank = (plugin: PluginManifest) => {
  const index = OFFICIAL_ORDER.indexOf(plugin.id);
  return plugin.official && index >= 0 ? index : OFFICIAL_ORDER.length;
};

const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const icon = (value: unknown): IconName => (typeof value === "string" && value in ICONS ? (value as IconName) : "puzzle");

/** Valide un manifeste et complète les champs facultatifs. Renvoie null s'il est inutilisable. */
function normalize(raw: unknown, official: boolean, source: PluginSource): PluginManifest | null {
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
      entry: typeof a.entry === "string" ? a.entry : undefined,
      dataVersion: typeof a.dataVersion === "number" ? a.dataVersion : 1,
      plannedFor: a.plannedFor === "v2" ? "v2" : "v1",
      accepts: Array.isArray(a.accepts) ? a.accepts.filter((k): k is string => typeof k === "string") : [],
    }));

  const settingsPages: PluginSettingsPage[] = (Array.isArray(m.settings) ? m.settings : [])
    .filter(
      (s): s is Record<string, unknown> =>
        typeof s === "object" && s !== null && typeof s.id === "string" && /^[a-z0-9-]+$/.test(s.id) && typeof s.entry === "string",
    )
    .map((s) => ({ id: text(s.id), title: text(s.title, text(s.id)), entry: text(s.entry) }));

  return {
    id,
    name: text(m.name, id),
    description: text(m.description),
    version: text(m.version, "0.0.0"),
    apiVersion: text(m.apiVersion, "^1"),
    author: text(m.author),
    color: text(m.color, "#6b7280"),
    icon: icon(m.icon),
    permissions: Array.isArray(m.permissions) ? m.permissions.filter((p) => typeof p === "string") : [],
    dependencies: stringMap(m.dependencies),
    optionalDependencies: stringMap(m.optionalDependencies),
    provides: stringMap(m.provides),
    services: stringMap(m.services),
    serviceEntry: cheminRelatif(m.serviceEntry),
    functions: fonctionsDe(m.functions, stringMap(m.provides)),
    settings: settingsPages,
    official,
    source,
    miniApps,
  };
}

/** Objet « nom → texte » d'un manifeste ; tout ce qui n'est pas du texte est ignoré. */
export function stringMap(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/** Adresse d'un fichier de plugin, servie par le cœur Rust (voir plugins.rs). */
export function pluginUrl(pluginId: string, path: string): string {
  // Origine propre au plugin (serveur avec un hôte par plugin) : les fichiers sont à la racine de cette origine.
  const origine = api.originePlugin?.(pluginId);
  if (origine) return `${origine}/${path.split("/").map(encodeURIComponent).join("/")}`;
  // Sous Windows, WebView2 expose les protocoles personnalisés en http://<nom>.localhost.
  // Dans un navigateur, ce sont des fichiers statiques : `plugins/` de la version construite, ou le serveur
  // Vite en développement (voir vite.config.ts).
  const base = api.urlPlugins
    ? api.urlPlugins
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

/**
 * Plugins qui ont des mini-apps : les seuls qui apparaissent dans la colonne, l'accueil et la
 * palette. Un plugin qui n'apporte que des réglages (Fournisseurs, Machines) n'y figure pas.
 */
export function pluginsWithApps(): PluginManifest[] {
  return PLUGINS.filter((p) => p.miniApps.length > 0);
}

/** Les plugins installés tels que les voit la résolution des dépendances. */
export function installedNodes(): InstalledNode[] {
  return PLUGINS.map((p) => ({
    id: p.id,
    version: p.version,
    dependencies: p.dependencies,
    optionalDependencies: p.optionalDependencies,
    enabled: settings.isPluginEnabled(p.id),
  }));
}

/** Dépendances obligatoires d'un plugin qui ne sont pas satisfaites (absentes, incompatibles, désactivées). */
export function pluginProblems(plugin: PluginManifest): Problem[] {
  return problemsOf(plugin, installedNodes());
}
