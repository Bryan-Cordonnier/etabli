// Cycle de vie des plugins avec leurs dépendances (docs/13) : installer un plugin installe aussi ce
// dont il a besoin, désinstaller ou désactiver un plugin dont d'autres ont besoin demande
// confirmation, activer un plugin réactive ses dépendances. La fenêtre de confirmation
// (`PluginDialog`) affiche `lifecycle.dialog`.
import { dependentsOf, optionalDependentsOf, planInstall, type Problem } from "@etabli/sdk/deps";
import type { CatalogueEntry } from "$lib/api";
import { connues, estStrict } from "$lib/plugins/permissions";
import { getPlugin, installedNodes } from "$lib/plugins/registry.svelte";
import type { PluginManifest } from "$lib/types";
import { catalogue } from "./catalogue.svelte";
import { settings } from "./settings.svelte";
import { ui } from "./ui.svelte";

export type Dialog =
  | {
      kind: "install";
      entry: CatalogueEntry;
      update: boolean;
      /** Dépendances obligatoires qui seront installées avec le plugin. */
      required: CatalogueEntry[];
      /** Facultatifs disponibles, proposés à l'utilisateur. */
      optional: CatalogueEntry[];
      /** Dépendances obligatoires introuvables : l'installation est refusée. */
      missing: Problem[];
      /** Case « Installer aussi les extensions facultatives », cochée par défaut. */
      withOptional: boolean;
      /** Ce que le plugin demande à pouvoir faire ; `nouvelles` : permissions que la version installée n'avait pas. */
      permissions: { demandees: string[]; nouvelles: string[]; ancienContrat: boolean; arret: string };
    }
  | {
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

  /** Installe ou met à jour un plugin du catalogue : direct s'il n'a rien de particulier, sinon après confirmation. */
  askInstall(entry: CatalogueEntry): void {
    // Contrat arrêté (docs/19 §4) : refusé net, avec la phrase du catalogue ; le moteur le refuserait aussi.
    const contrat = catalogue.contractStatus(entry);
    if (contrat.statut === "refuse") {
      ui.notify(`${entry.name} : ${contrat.phrase}`);
      return;
    }
    const plan = planInstall(entry, catalogue.entries, installedNodes());
    const required = plan.order.filter((e) => e.id !== entry.id);
    const installe = getPlugin(entry.id);
    const demandees = connues(entry.permissions);
    const deja = new Set(installe?.permissions ?? []);
    const permissions = {
      demandees,
      nouvelles: installe ? demandees.filter((p) => !deja.has(p)) : demandees,
      ancienContrat: !estStrict(entry.apiVersion),
      arret: contrat.statut === "avertir" ? contrat.phrase : "",
    };
    // Une confirmation est demandée dès que le plugin réclame une permission qu'il n'avait pas (ou n'a jamais eue).
    const aConfirmer = permissions.nouvelles.length > 0 || (!installe && permissions.ancienContrat) || !!permissions.arret;
    if (!required.length && !plan.optional.length && !plan.missing.length && !aConfirmer) {
      void catalogue.install(entry);
      return;
    }
    this.dialog = {
      kind: "install",
      entry,
      update: !!getPlugin(entry.id),
      required,
      optional: plan.optional,
      missing: plan.missing,
      withOptional: true,
      permissions,
    };
  }

  /** Confirmation de la fenêtre d'installation : dépendances d'abord, puis le plugin, puis les facultatifs cochés. */
  async confirmInstall(): Promise<void> {
    const dialog = this.dialog;
    if (dialog?.kind !== "install" || dialog.missing.length) return;
    this.dialog = null;
    const plan = planInstall(dialog.entry, catalogue.entries, installedNodes(), dialog.withOptional);
    const installed: string[] = [];
    for (const step of plan.order) {
      if (!(await catalogue.install(step, true))) return;
      installed.push(step.name);
    }
    ui.notify(
      installed.length > 1
        ? `${installed.join(", ")} installés · signatures vérifiées`
        : `${dialog.entry.name} ${dialog.update ? "mis à jour" : "installé"} · signature vérifiée`,
    );
  }

  /** Désinstalle un plugin du catalogue ; ceux qui en ont besoin suivent, après confirmation. */
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
    // Les plugins qui ont besoin de celui-ci partent d'abord ; ceux qui ne s'installent pas depuis le
    // catalogue (intégrés, déposés à la main) sont seulement désactivés.
    for (const dependent of dependents) {
      if (action === "uninstall" && dependent.source === "catalogue") await catalogue.uninstall(dependent.id, true);
      else if (settings.isPluginEnabled(dependent.id)) settings.togglePlugin(dependent.id);
    }
    if (action === "uninstall") {
      await catalogue.uninstall(plugin.id, true);
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
