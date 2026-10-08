import { getPlugin } from "./plugins/registry.svelte";
import { settings } from "./state/settings.svelte";
import { tabs } from "./state/tabs.svelte";
import { ui } from "./state/ui.svelte";

/** Section de Paramètres d'une page de réglages de plugin : « plugin:<plugin>:<page> » (« parametres » : les paramètres déclarés). */
export const pluginSection = (pluginId: string, pageId: string) => `plugin:${pluginId}:${pageId}` as const;

/**
 * Ouvre la page de réglages d'un plugin (un bouton « Réglages » dans une mini-app, par exemple),
 * avec une intention facultative (`hash`) que la page lit. Si le plugin n'est pas
 * installé, activé ou n'a pas de page de réglages, la page des plugins s'ouvre à la place.
 */
export function openPluginSettings(pluginId: string, hash?: string): void {
  const plugin = getPlugin(pluginId);
  // Les paramètres déclarés (faits par le moteur) d'abord, sinon la première page de réglages que le plugin ajoute.
  const page = plugin?.parameters.length ? { id: "parametres" } : plugin?.settings[0];
  if (!plugin || !page || !settings.isPluginEnabled(pluginId)) {
    ui.notify(`Le plugin « ${pluginId} » n'est pas installé ou pas activé : il se règle depuis la page des plugins.`);
    tabs.navigate({ kind: "plugins" });
    return;
  }
  tabs.navigate({ kind: "settings", section: pluginSection(plugin.id, page.id), hash });
}
