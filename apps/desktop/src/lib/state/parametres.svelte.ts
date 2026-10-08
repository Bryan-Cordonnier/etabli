// Valeurs des paramètres que les plugins déclarent (`parameters` du manifeste). Elles se règlent dans Paramètres,
// onglet du plugin ; le plugin les reçoit à l'ouverture et à chaque changement (`etabli.parameters`). Elles sont
// enregistrées avec les réglages du moteur, séparément des données du plugin (`etabli.settings`).
import { valeurValide, valeursDe } from "$lib/plugins/manifeste";
import { load, save } from "$lib/storage";
import type { ParameterValue, PluginManifest } from "$lib/types";

type Enregistre = Record<string, Record<string, ParameterValue>>;

class Parametres {
  #saved = $state<Enregistre>({});

  constructor() {
    this.reload();
  }

  /** Relit les valeurs enregistrées (une autre fenêtre a pu les changer). */
  reload(): void {
    this.#saved = load<Enregistre>("parametres", {});
  }

  /** Toutes les valeurs d'un plugin : celles réglées si elles conviennent, sinon les valeurs par défaut. */
  valeurs(plugin: Pick<PluginManifest, "id" | "parameters">): Record<string, ParameterValue> {
    return valeursDe(plugin.parameters, this.#saved[plugin.id]);
  }

  /** Règle un paramètre ; une valeur qui ne convient pas (hors bornes, type faux) est refusée sans bruit. */
  definir(plugin: Pick<PluginManifest, "id" | "parameters">, id: string, valeur: unknown): void {
    const def = plugin.parameters.find((p) => p.id === id);
    if (!def) return;
    const ok = valeurValide(def, valeur);
    // « valeurValide » renvoie la valeur par défaut quand la saisie est refusée : on ne l'enregistre alors pas comme un choix.
    if (ok === def.default && valeur !== def.default) return;
    this.#saved = { ...this.#saved, [plugin.id]: { ...this.#saved[plugin.id], [id]: ok } };
    save("parametres", $state.snapshot(this.#saved));
  }

  /** Efface les réglages du plugin : tous ses paramètres reprennent leur valeur par défaut. */
  retablir(plugin: Pick<PluginManifest, "id">): void {
    const { [plugin.id]: _retire, ...reste } = this.#saved;
    this.#saved = reste;
    save("parametres", $state.snapshot(this.#saved));
  }
}

export const parametres = new Parametres();
