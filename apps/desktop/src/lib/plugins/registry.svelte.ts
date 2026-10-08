import { api, type PluginSource } from "$lib/api";
import { ICONS, type IconName } from "$lib/icons";
import { problemsOf, type InstalledNode, type Problem } from "@etabli/sdk/deps";
import { settings } from "$lib/state/settings.svelte";
import { appsDe, cheminRelatif, fonctionsDe, pagesDe, parametresDe, raisonDeRefus } from "./manifeste";
import { majeure } from "./permissions";
import type { AppManifest, PageManifest, PluginManifest, PluginSettingsPage, RefusedPlugin } from "$lib/types";

/**
 * Plugins installés : remplis au démarrage par `loadPlugins()`, puis rechargés après chaque
 * installation ou désinstallation (liste réactive : l'interface suit sans redémarrer).
 */
export const PLUGINS = $state<PluginManifest[]>([]);
/** Plugins que le moteur n'a pas chargés (contrat trop ancien, pages absentes…), avec la raison. */
export const REFUSES = $state<RefusedPlugin[]>([]);

/** Une page avec son plugin et l'app qu'elle affiche. */
export interface PageRef {
  plugin: PluginManifest;
  page: PageManifest;
  app: AppManifest;
}

/**
 * Charge les manifestes (cahier des charges, section 8.2) via le fond : cœur Rust dans l'application,
 * `plugins/index.json` servi avec la version web (et par Vite en développement).
 */
export async function loadPlugins(): Promise<void> {
  const raw = await api.pluginsList().catch(() => []);
  const acceptes: PluginManifest[] = [];
  const refuses: RefusedPlugin[] = [];
  for (const { manifest, official, source } of raw) {
    const resultat = normalize(manifest, official, source ?? (official ? "integre" : "utilisateur"));
    if (resultat === null) continue;
    if ("reason" in resultat) refuses.push(resultat);
    else acceptes.push(resultat);
  }
  acceptes.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  PLUGINS.splice(0, PLUGINS.length, ...acceptes);
  REFUSES.splice(0, REFUSES.length, ...refuses);
}

const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const icon = (value: unknown): IconName => (typeof value === "string" && value in ICONS ? (value as IconName) : "puzzle");

/**
 * Valide un manifeste et complète les champs facultatifs. Renvoie null s'il est illisible (pas d'identifiant),
 * un refus avec sa raison si le contrat n'est pas le bon, sinon le plugin.
 */
function normalize(raw: unknown, official: boolean, source: PluginSource): PluginManifest | RefusedPlugin | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const id = text(m.id);
  if (!id) return null;
  const refus = raisonDeRefus(m, majeure(text(m.apiVersion, "^1")));
  if (refus) return { id, name: text(m.name, id), reason: refus };

  const apps = appsDe(m.apps);
  const pages = pagesDe(m.pages, apps);  const settingsPages: PluginSettingsPage[] = (Array.isArray(m.settings) ? m.settings : [])
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
    apiVersion: text(m.apiVersion, "^3"),
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
    apps,
    pages,
    parameters: parametresDe(m.parameters),
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
  // Sous Windows et Android, le WebView expose les protocoles personnalisés en http://<nom>.localhost.
  // Dans un navigateur, ce sont des fichiers statiques : `plugins/` de la version construite, ou le serveur
  // Vite en développement (voir vite.config.ts).
  const base = api.urlPlugins
    ? api.urlPlugins
    : navigator.userAgent.includes("Windows") || navigator.userAgent.includes("Android")
      ? "http://plugins.localhost"
      : "plugins://localhost";
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/${encodeURIComponent(pluginId)}/${encoded}`;
}

/** Identifiant global d'une page, utilisé pour les favoris et l'ordre de la colonne : « plugin/page ». */
export const pageKey = (pluginId: string, pageId: string): string => `${pluginId}/${pageId}`;

export function getPlugin(id: string): PluginManifest | undefined {
  return PLUGINS.find((p) => p.id === id);
}

export function getPage(pluginId: string, pageId: string): PageRef | undefined {
  const plugin = getPlugin(pluginId);
  const page = plugin?.pages.find((p) => p.id === pageId);
  const app = page ? plugin?.apps.find((a) => a.id === page.app) : undefined;
  return plugin && page && app ? { plugin, page, app } : undefined;
}

export function getPageByKey(key: string): PageRef | undefined {
  const [pluginId = "", pageId = ""] = key.split("/");
  return getPage(pluginId, pageId);
}

/** Toutes les pages des plugins installés, dans l'ordre où chaque plugin les déclare. */
export function allPages(): PageRef[] {
  return PLUGINS.flatMap((plugin) => plugin.pages.flatMap((page) => getPage(plugin.id, page.id) ?? []));
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
