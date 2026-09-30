// Catalogue de plugins (docs/13) : la liste publiée sur GitHub, l'installation, la mise à jour et
// la désinstallation. Le travail (téléchargement, signature, fichiers) est fait par Rust
// (catalogue.rs) ; ici, l'état affiché et les règles : mises à jour automatiques au démarrage
// (avec les dépendances obligatoires), réinstallation des plugins de qui arrive d'une version 0.1.x
// (livrée avec ses plugins), reprise des fournisseurs et machines saisis avant les plugins qui les portent.
import { compareVersions, planInstall } from "@etabli/sdk/deps";
import { api, type CatalogueEntry } from "$lib/api";
import { PLUGINS, getPlugin, installedNodes, loadPlugins, stringMap } from "$lib/plugins/registry.svelte";
import { wasUsedBefore } from "$lib/storage";
import { services } from "./services.svelte";
import { settings } from "./settings.svelte";
import { ui } from "./ui.svelte";

export { compareVersions };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Garde les entrées bien formées d'un catalogue lu sur le réseau, et complète celles d'un catalogue plus ancien. */
function entries(raw: unknown): CatalogueEntry[] {
  const list = (raw as { plugins?: unknown })?.plugins;
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (e): e is CatalogueEntry =>
        typeof e === "object" && e !== null && typeof e.id === "string" && typeof e.url === "string" && typeof e.version === "string",
    )
    .map((e) => ({
      ...e,
      dependencies: stringMap(e.dependencies),
      optionalDependencies: stringMap(e.optionalDependencies),
      provides: stringMap(e.provides),
      settings: Array.isArray(e.settings) ? e.settings : [],
      notes: typeof e.notes === "string" ? e.notes : "",
      notesDate: typeof e.notesDate === "string" ? e.notesDate : null,
      miniApps: Array.isArray(e.miniApps) ? e.miniApps : [],
    }));
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

  /** Entrée du catalogue pour un plugin (la plus récente), ou `undefined`. */
  entryOf(id: string): CatalogueEntry | undefined {
    return this.entries.filter((e) => e.id === id).sort((a, b) => compareVersions(b.version, a.version))[0];
  }

  /** Une version plus récente que celle installée depuis le catalogue est publiée. */
  hasUpdate(entry: CatalogueEntry): boolean {
    const installed = getPlugin(entry.id);
    return installed?.source === "catalogue" && compareVersions(entry.version, installed.version) > 0;
  }

  /**
   * Installe ou met à jour un seul plugin, sans ses dépendances (voir `lifecycle.install` pour le
   * plan complet) ; `silent` : pas de notification. Renvoie vrai si c'est fait.
   */
  async install(entry: CatalogueEntry, silent = false): Promise<boolean> {
    if (this.progress[entry.id] !== undefined) return false;
    const update = !!getPlugin(entry.id);
    this.progress[entry.id] = 0;
    try {
      await api.pluginInstall(entry.id, entry.url);
      await loadPlugins();
      await services.load();
      if (!silent) ui.notify(`${entry.name} ${update ? "mis à jour" : "installé"} · signature vérifiée`);
      return true;
    } catch (err) {
      ui.notify(`${entry.name} : ${message(err)}`);
      return false;
    } finally {
      delete this.progress[entry.id];
    }
  }

  async uninstall(id: string, silent = false): Promise<boolean> {
    const name = getPlugin(id)?.name ?? id;
    try {
      await api.pluginUninstall(id);
      await loadPlugins();
      if (!silent) ui.notify(`${name} désinstallé · vos calculs sont conservés`);
      return true;
    } catch (err) {
      ui.notify(message(err));
      return false;
    }
  }

  async installFile(): Promise<void> {
    try {
      const id = await api.pluginInstallFile();
      if (!id) return;
      await loadPlugins();
      await services.load();
      ui.notify(`${getPlugin(id)?.name ?? id} installé depuis un fichier · signature vérifiée`);
    } catch (err) {
      ui.notify(message(err));
    }
  }

  /**
   * Fournisseurs et machines saisis avant les plugins Fournisseurs et Machines (fichiers `fournisseurs`
   * et `machines` du moteur) : les plugins sont installés depuis le catalogue et reçoivent ces données.
   * Rien n'est effacé ; sans réseau, on réessaiera au prochain démarrage.
   */
  async migrateLibraries(): Promise<void> {
    if (settings.librariesMigrated) return;
    const legacy = await Promise.all([api.dataRead("fournisseurs").catch(() => null), api.dataRead("machines").catch(() => null)]);
    const jobs = [
      { plugin: "fournisseurs", key: "suppliers", rows: legacy[0], label: "fournisseurs" },
      { plugin: "machines", key: "machines", rows: legacy[1], label: "machines" },
    ].filter((job) => Array.isArray(job.rows) && job.rows.length > 0);

    const done: string[] = [];
    for (const job of jobs) {
      const entry = this.entryOf(job.plugin);
      if (!entry) return;
      if (!getPlugin(job.plugin) && !(await this.install(entry, true))) return;
      // Ne jamais écraser ce que l'utilisateur a déjà saisi dans le plugin.
      const existing = await api.dataRead(`plugin.${job.plugin}`).catch(() => null);
      if (existing === null) {
        const data = { [job.key]: job.rows };
        await api.dataWrite(`plugin.${job.plugin}`, data);
        await api.dataWrite(`service.${job.plugin}.${job.plugin}`, data);
        done.push(job.label);
      }
    }
    if (done.length) {
      await services.load();
      ui.notify(`Vos ${done.join(" et vos ")} sont repris dans ${done.length > 1 ? "les plugins" : "le plugin"} du même nom.`);
    }
    settings.set("librariesMigrated", true);
  }

  /**
   * Au démarrage : réinstalle les plugins de qui arrive d'une 0.1.x (ils étaient livrés avec
   * l'application), reprend les fournisseurs et machines, puis installe les nouvelles versions des
   * plugins du catalogue avec leurs dépendances obligatoires. Sans réseau, rien ne s'affiche : on
   * réessaiera au prochain démarrage.
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
    }

    await this.migrateLibraries();

    const updated: string[] = [];
    for (const entry of this.entries) {
      if (!this.hasUpdate(entry)) continue;
      const plan = planInstall(entry, this.entries, installedNodes());
      if (plan.missing.length) continue;
      let ok = true;
      for (const step of plan.order) ok = ok && (await this.install(step, true));
      if (ok) updated.push(`${entry.name} ${entry.version}`);
    }
    if (updated.length) ui.notify(`Plugins mis à jour : ${updated.join(", ")}`);
  }
}

export const catalogue = new Catalogue();
