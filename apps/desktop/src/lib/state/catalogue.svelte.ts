// Catalogue de plugins (docs/13) : la liste publiée sur GitHub, l'installation, la mise à jour et
// la désinstallation. Le travail (téléchargement, signature, fichiers) est fait par Rust
// (catalogue.rs) ; ici, l'état affiché et les règles : mises à jour automatiques au démarrage,
// réinstallation des plugins de qui arrive d'une version 0.1.x (livrée avec ses plugins).
import { api, type CatalogueEntry } from "$lib/api";
import { PLUGINS, getPlugin, loadPlugins } from "$lib/plugins/registry.svelte";
import { wasUsedBefore } from "$lib/storage";
import { settings } from "./settings.svelte";
import { ui } from "./ui.svelte";

/** Compare deux versions « 1.2.3 » : positif si `a` est plus récente que `b`. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Garde les entrées bien formées d'un catalogue lu sur le réseau. */
function entries(raw: unknown): CatalogueEntry[] {
  const list = (raw as { plugins?: unknown })?.plugins;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (e): e is CatalogueEntry =>
      typeof e === "object" && e !== null && typeof e.id === "string" && typeof e.url === "string" && typeof e.version === "string",
  );
}

class Catalogue {
  entries = $state<CatalogueEntry[]>([]);
  status = $state<"idle" | "loading" | "ready" | "error">("idle");
  error = $state("");
  /** Plugins en cours d'installation → pourcentage téléchargé. */
  progress = $state<Record<string, number>>({});

  get busy(): boolean {
    return Object.keys(this.progress).length > 0;
  }

  async load(): Promise<void> {
    if (this.status === "loading") return;
    this.status = "loading";
    try {
      this.entries = entries(await api.catalogueRead());
      this.status = "ready";
      this.error = "";
    } catch (err) {
      this.status = "error";
      this.error = message(err);
    }
  }

  /** Une version plus récente que celle installée depuis le catalogue est publiée. */
  hasUpdate(entry: CatalogueEntry): boolean {
    const installed = getPlugin(entry.id);
    return installed?.source === "catalogue" && compareVersions(entry.version, installed.version) > 0;
  }

  /** Installe ou met à jour ; `silent` : pas de notification (démarrage). Renvoie vrai si c'est fait. */
  async install(entry: CatalogueEntry, silent = false): Promise<boolean> {
    if (this.progress[entry.id] !== undefined) return false;
    const update = !!getPlugin(entry.id);
    this.progress[entry.id] = 0;
    try {
      await api.pluginInstall(entry.id, entry.url);
      await loadPlugins();
      if (!silent) ui.notify(`${entry.name} ${update ? "mis à jour" : "installé"} · signature vérifiée`);
      return true;
    } catch (err) {
      ui.notify(`${entry.name} : ${message(err)}`);
      return false;
    } finally {
      delete this.progress[entry.id];
    }
  }

  async uninstall(id: string): Promise<void> {
    const name = getPlugin(id)?.name ?? id;
    try {
      await api.pluginUninstall(id);
      await loadPlugins();
      ui.notify(`${name} désinstallé · vos calculs sont conservés`);
    } catch (err) {
      ui.notify(message(err));
    }
  }

  async installFile(): Promise<void> {
    try {
      const id = await api.pluginInstallFile();
      if (!id) return;
      await loadPlugins();
      ui.notify(`${getPlugin(id)?.name ?? id} installé depuis un fichier · signature vérifiée`);
    } catch (err) {
      ui.notify(message(err));
    }
  }

  /**
   * Au démarrage : réinstalle les plugins de qui arrive d'une 0.1.x (ils étaient livrés avec
   * l'application), puis installe les nouvelles versions des plugins du catalogue. Sans réseau,
   * rien ne s'affiche : on réessaiera au prochain démarrage.
   */
  async startup(): Promise<void> {
    await this.load();
    if (this.status !== "ready") return;

    if (!settings.catalogueMigrated) {
      if (wasUsedBefore() && PLUGINS.length === 0 && this.entries.length > 0) {
        ui.notify("Réinstallation de vos plugins depuis le catalogue…");
        let done = true;
        for (const entry of this.entries) done = (await this.install(entry, true)) && done;
        if (!done) return;
        ui.notify("Vos plugins sont réinstallés.");
      }
      settings.set("catalogueMigrated", true);
      return;
    }

    const updated: string[] = [];
    for (const entry of this.entries) {
      if (this.hasUpdate(entry) && (await this.install(entry, true))) updated.push(`${entry.name} ${entry.version}`);
    }
    if (updated.length) ui.notify(`Plugins mis à jour : ${updated.join(", ")}`);
  }
}

export const catalogue = new Catalogue();
