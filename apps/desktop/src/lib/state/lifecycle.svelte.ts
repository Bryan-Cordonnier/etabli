// Cycle de vie des plugins avec leurs dépendances (docs/13) : désinstaller ou désactiver un plugin dont d'autres
// ont besoin demande confirmation, activer un plugin réactive ses dépendances. La fenêtre de confirmation
// (`PluginDialog`) affiche `lifecycle.dialog`.
import { dependentsOf, optionalDependentsOf } from "@etabli/sdk/deps";
import { getPlugin, installedNodes } from "$lib/plugins/registry.svelte";
import type { PluginManifest } from "$lib/types";
import { installation } from "./installation.svelte";
import { settings } from "./settings.svelte";
import { ui } from "./ui.svelte";

export type Dialog = {
  kind: "remove";
  /** `uninstall` : désinstaller ; `disable` : désactiver. */
  action: "uninstall" | "disable";
  plugin: PluginManifest;
  /** Plugins qui ont besoin de celui-ci : ils suivent. */
  dependents: PluginManifest[];
  /** Plugins qui marchent sans celui-ci : prévenus seulement. */
  optionalDependents: PluginManifest[];
};

const names = (list: { name: string }[]) => list.map((p) => p.name).join(", ");

class Lifecycle {
  dialog = $state<Dialog | null>(null);

  close(): void {
    this.dialog = null;
  }

  /** Désinstalle un plugin installé ; ceux qui en ont besoin suivent, après confirmation. */
  askUninstall(id: string): void {
    this.#askRemove(id, "uninstall");
  }

  /** Active ou désactive un plugin. Désactiver un plugin dont d'autres ont besoin demande confirmation. */
  toggle(id: string): void {
    if (settings.isPluginEnabled(id)) {
      this.#askRemove(id, "disable");
      return;
    }
    settings.togglePlugin(id);
    // Activer un plugin réactive ce dont il a besoin.
    const plugin = getPlugin(id);
    const back: string[] = [];
    for (const dep of Object.keys(plugin?.dependencies ?? {})) {
      if (getPlugin(dep) && !settings.isPluginEnabled(dep)) {
        settings.togglePlugin(dep);
        back.push(getPlugin(dep)?.name ?? dep);
      }
    }
    if (back.length) ui.notify(`${back.join(", ")} réactivé${back.length > 1 ? "s" : ""} : ${plugin?.name} en a besoin.`);
  }

  #askRemove(id: string, action: "uninstall" | "disable"): void {
    const plugin = getPlugin(id);
    if (!plugin) return;
    const nodes = installedNodes().filter((n) => n.enabled || n.id === id);
    const ofIds = (ids: string[]) => ids.map(getPlugin).filter((p): p is PluginManifest => !!p);
    const dependents = ofIds(dependentsOf(id, nodes));
    const optionalDependents = ofIds(optionalDependentsOf(id, nodes));
    if (!dependents.length && (action === "disable" || !optionalDependents.length)) {
      void this.#remove(plugin, action, []);
      return;
    }
    this.dialog = { kind: "remove", action, plugin, dependents, optionalDependents };
  }

  async confirmRemove(): Promise<void> {
    const dialog = this.dialog;
    if (dialog?.kind !== "remove") return;
    this.dialog = null;
    await this.#remove(dialog.plugin, dialog.action, dialog.dependents);
  }

  async #remove(plugin: PluginManifest, action: "uninstall" | "disable", dependents: PluginManifest[]): Promise<void> {
    // Les plugins qui ont besoin de celui-ci partent d'abord ; ceux qui ne s'installent pas depuis un
    // fichier (intégrés, déposés à la main) sont seulement désactivés.
    for (const dependent of dependents) {
      if (action === "uninstall" && dependent.source === "installe") await installation.uninstall(dependent.id, true);
      else if (settings.isPluginEnabled(dependent.id)) settings.togglePlugin(dependent.id);
    }
    if (action === "uninstall") {
      await installation.uninstall(plugin.id, true);
      const all = [plugin, ...dependents];
      ui.notify(`${names(all)} désinstallé${all.length > 1 ? "s" : ""} · vos calculs et réglages sont conservés`);
    } else {
      settings.togglePlugin(plugin.id);
      if (dependents.length) {
        ui.notify(`${names(dependents)} désactivé${dependents.length > 1 ? "s" : ""} aussi : ${dependents.length > 1 ? "ils ont" : "il a"} besoin de ${plugin.name}.`);
      }
    }
  }
}

export const lifecycle = new Lifecycle();
