// Réglages propres à chaque plugin, partagés par toutes ses mini-apps : un fichier JSON par plugin,
// enregistré peu après chaque modification et transmis aux mini-apps ouvertes.
import { api } from "$lib/api";
import { DataFiles } from "$lib/dataFiles";

const pluginFile = (pluginId: string) => `plugin.${pluginId}`;

class PluginDataStore {
  /** Réglages de chaque plugin, par identifiant de plugin. */
  data = $state<Record<string, unknown>>({});
  #files = new DataFiles();

  /** Relit les réglages d'un plugin (sauf si une saisie est en attente d'enregistrement). */
  async load(pluginId: string): Promise<unknown> {
    const file = pluginFile(pluginId);
    if (!this.#files.pending(file)) {
      this.data[pluginId] = await api.dataRead(file).catch(() => null);
    }
    return this.data[pluginId] ?? null;
  }

  set(pluginId: string, data: unknown): void {
    this.data[pluginId] = data;
    this.#files.schedule(pluginFile(pluginId), () => $state.snapshot(this.data[pluginId]));
  }
}

export const pluginData = new PluginDataStore();
