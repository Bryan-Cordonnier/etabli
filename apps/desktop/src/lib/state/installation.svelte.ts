// Installation des plugins depuis un fichier signé (docs/14) : le travail (signature, fichiers) est fait par Rust ;
// ici, l'état affiché et les notifications. Plus de catalogue ni de téléchargement : le moteur ne contacte personne.
import { api } from "$lib/api";
import { getPlugin, loadPlugins } from "$lib/plugins/registry.svelte";
import { services } from "./services.svelte";
import { ui } from "./ui.svelte";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

class Installation {
  /** Installe un fichier `.etabli-plugin` choisi par l'utilisateur (boîte de dialogue native). */
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
}

export const installation = new Installation();