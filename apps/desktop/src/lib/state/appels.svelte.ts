// Appels de fonctions entre plugins (docs/24, A.1.2) : branche le routeur pur (plugins/appels.ts) sur les plugins installés
// et sur les cadres invisibles des fournisseurs (components/ServiceHost.svelte).
import type { ServiceResult } from "@etabli/sdk/protocol";
import { RouteurAppels, type Invocation } from "$lib/plugins/appels";
import { erreurService } from "$lib/plugins/garde";
import { PLUGINS, pluginUrl } from "$lib/plugins/registry.svelte";
import { settings } from "./settings.svelte";

export interface CadreService {
  invocation: Invocation;
  /** Adresse de la page `serviceEntry` du fournisseur. */
  src: string;
}

/** Cadres invisibles en cours : un par appel en cours, jamais plus d'un par fournisseur (la file du routeur y veille). */
class HoteCadres {
  cadres = $state<CadreService[]>([]);
  #attente = new Map<string, { resolve: (r: ServiceResult) => void; minuteur: ReturnType<typeof setTimeout> }>();

  /** Ouvre le cadre du fournisseur ; le ferme à la réponse, ou au plus tard après `delaiMs`. */
  executer(invocation: Invocation, delaiMs: number): Promise<ServiceResult> {
    return new Promise((resolve) => {
      const minuteur = setTimeout(() => this.terminer(invocation.id, erreurService("delai_depasse", "Le fournisseur n'a pas répondu à temps.")), delaiMs);
      this.#attente.set(invocation.id, { resolve, minuteur });
      this.cadres.push({ invocation, src: pluginUrl(invocation.fournisseur, invocation.entree) });
    });
  }

  /** Rend la réponse à l'appelant et détruit le cadre (donc la page du fournisseur). Sans effet si déjà terminé. */
  terminer(id: string, resultat: ServiceResult): void {
    const attente = this.#attente.get(id);
    if (!attente) return;
    this.#attente.delete(id);
    clearTimeout(attente.minuteur);
    this.cadres = this.cadres.filter((c) => c.invocation.id !== id);
    attente.resolve(resultat);
  }
}

export const hote = new HoteCadres();

/** Le routeur de l'application : un seul, partagé par tous les cadres de la fenêtre. */
export const routeur = new RouteurAppels({
  plugins: () => PLUGINS,
  actif: (id) => PLUGINS.some((p) => p.id === id) && settings.isPluginEnabled(id),
  executer: (invocation, delaiMs) => hote.executer(invocation, delaiMs),
});
