// Services : les données qu'un plugin publie pour les autres (docs/13). Le plugin Fournisseurs publie
// la liste des fournisseurs, le plugin Machines celle des machines. Le moteur les garde dans un
// fichier par service (`service.<plugin>.<nom>.json`) et les relaie, en lecture seule, aux seuls
// plugins qui déclarent une dépendance sur le fournisseur : un plugin ne lit jamais directement
// les données d'un autre.
import { satisfies } from "@etabli/sdk/deps";
import type { FournisseursData, Libraries, MachinesData, Services } from "@etabli/sdk/protocol";
import { api } from "$lib/api";
import { DataFiles, validDataName } from "$lib/dataFiles";
import { PLUGINS, getPlugin } from "$lib/plugins/registry.svelte";
import { settings } from "./settings.svelte";

const key = (plugin: string, name: string) => `${plugin}/${name}`;
const serviceFile = (plugin: string, name: string) => `service.${plugin}.${name}`;

class ServiceStore {
  /** Données publiées, par « plugin/service ». */
  data = $state<Record<string, unknown>>({});
  #files = new DataFiles();

  /** Relit les services de tous les plugins installés (au démarrage, et à chaque ouverture de l'aperçu rapide). */
  async load(): Promise<void> {
    const wanted = PLUGINS.flatMap((p) => Object.keys(p.provides).map((name) => ({ plugin: p.id, name })));
    await Promise.all(
      wanted.map(async ({ plugin, name }) => {
        const file = serviceFile(plugin, name);
        if (!validDataName(file) || this.#files.pending(file)) return;
        this.data[key(plugin, name)] = await api.dataRead(file).catch(() => null);
      }),
    );
  }

  /** Enregistre les données publiées par un plugin ; refuse un service que son manifeste ne déclare pas. */
  publish(pluginId: string, name: string, data: unknown): boolean {
    const plugin = getPlugin(pluginId);
    const file = serviceFile(pluginId, name);
    if (!plugin || !(name in plugin.provides) || !validDataName(file)) return false;
    this.data[key(pluginId, name)] = data;
    this.#files.schedule(file, () => $state.snapshot(this.data[key(pluginId, name)]));
    return true;
  }

  /**
   * Services visibles par un plugin : ceux des plugins dont il dépend (obligatoirement ou non), s'ils
   * sont installés, activés et dans une version acceptée. Vide si le plugin ne déclare aucune dépendance.
   */
  snapshotFor(consumerId: string): Services {
    const consumer = getPlugin(consumerId);
    if (!consumer) return {};
    const services: Services = {};
    for (const [providerId, range] of Object.entries({ ...consumer.optionalDependencies, ...consumer.dependencies })) {
      const provider = getPlugin(providerId);
      if (!provider || !settings.isPluginEnabled(providerId)) continue;
      for (const [name, version] of Object.entries(provider.provides)) {
        // Le consommateur qui déclare une plage de CONTRAT (`services`) est jugé sur la version du contrat ; sinon, comme
        // avant, sur la version du plugin (docs/24, M4 : un plugin en 2.0 qui garde son contrat 1 n'est plus coupé à tort).
        const contrat = Object.hasOwn(consumer.services, name) ? consumer.services[name] : undefined;
        if (contrat !== undefined ? !satisfies(version, contrat) : !satisfies(provider.version, range)) continue;
        services[name] = {
          plugin: providerId,
          version,
          data: $state.snapshot(this.data[key(providerId, name)]) ?? null,
        };
      }
    }
    return services;
  }
}

export const services = new ServiceStore();

/** Fournisseurs et machines, sous la forme que connaissent les SDK anciens (message `libraries`). */
export function librariesFrom(visible: Services): Libraries {
  const suppliers = (visible.fournisseurs?.data as FournisseursData | null)?.suppliers;
  const machines = (visible.machines?.data as MachinesData | null)?.machines;
  return {
    suppliers: Array.isArray(suppliers) ? suppliers : [],
    machines: Array.isArray(machines) ? machines : [],
  };
}
