// Réglages propres à chaque plugin, partagés par toutes ses mini-apps : un fichier JSON par plugin,
// enregistré peu après chaque modification et transmis aux mini-apps ouvertes.
import { api } from "$lib/api";
import { DataFiles } from "$lib/dataFiles";
import { ui } from "./ui.svelte";

const pluginFile = (pluginId: string) => `plugin.${pluginId}`;

class PluginDataStore {
  /** Réglages de chaque plugin, par identifiant de plugin. */
  data = $state<Record<string, unknown>>({});
  #files = new DataFiles();

  /**
   * Plugins dont la dernière lecture a échoué (fichier illisible ou abîmé). « Illisible » n'est pas « vide » : tant que
   * la lecture échoue, on n'écrit rien, sinon un plugin qui part de zéro écraserait ses vraies données.
   */
  #illisibles = new Set<string>();

  /** Relit les réglages d'un plugin (sauf si une saisie est en attente d'enregistrement). */
  async load(pluginId: string): Promise<unknown> {
    const file = pluginFile(pluginId);
    if (!this.#files.pending(file)) {
      try {
        this.data[pluginId] = await api.dataRead(file);
        this.#illisibles.delete(pluginId);
      } catch (err) {
        this.data[pluginId] = null;
        this.#illisibles.add(pluginId);
        ui.notify(`Réglages de « ${pluginId} » illisibles : ${err} Rien ne sera enregistré pour ce plugin tant que le fichier n'est pas réparé.`);
      }
    }
    return this.data[pluginId] ?? null;
  }

  /** La dernière lecture des réglages de ce plugin a-t-elle échoué ? */
  illisible(pluginId: string): boolean {
    return this.#illisibles.has(pluginId);
  }

  set(pluginId: string, data: unknown): void {
    this.data[pluginId] = data;
    if (this.#illisibles.has(pluginId)) {
      console.warn(`[Établi] enregistrement refusé pour ${pluginId} : ses réglages n'ont pas pu être lus.`);
      return;
    }
    this.#files.schedule(pluginFile(pluginId), () => $state.snapshot(this.data[pluginId]));
  }
}

export const pluginData = new PluginDataStore();
