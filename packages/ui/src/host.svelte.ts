// Ce que le moteur partage avec toutes les mini-apps d'un plugin : ses réglages (machines de
// l'atelier…), les bibliothèques de l'application (fournisseurs) et l'impression des fiches.
//
//   const machines = new PluginSettings({ saws: [] }, clean);
//   <Field bind:value={machines.data.saws[0].name} />   // enregistré par le moteur
import { connect, type Etabli, type FichePrint, type Supplier } from "@etabli/sdk";

/** Réglages du plugin, réactifs, partagés par ses mini-apps ouvertes et enregistrés automatiquement. */
export class PluginSettings<S extends object> {
  data = $state() as S;
  ready = $state(false);
  #last = "";

  /**
   * @param defaults réglages tant que l'utilisateur n'a rien changé
   * @param clean remet en forme des réglages enregistrés (ancienne version, fichier abîmé)
   */
  constructor(defaults: S, clean: (saved: unknown, defaults: S) => S = (saved) => ({ ...defaults, ...(saved as S) })) {
    this.data = structuredClone(defaults);
    this.#last = JSON.stringify(this.data);

    const receive = (saved: unknown) => {
      this.data = saved === null || saved === undefined ? structuredClone(defaults) : clean(saved, structuredClone(defaults));
      this.#last = JSON.stringify(this.data);
    };

    let host: Etabli<unknown> | undefined;
    void connect().then((connected) => {
      host = connected;
      receive(connected.settings.data);
      connected.settings.onChange(receive);
      this.ready = true;
    });

    $effect.root(() => {
      $effect(() => {
        const json = JSON.stringify(this.data);
        if (!host || json === this.#last) return;
        this.#last = json;
        host.settings.update(JSON.parse(json));
      });
    });
  }
}

/** Fournisseurs saisis dans les Paramètres d'Établi (liste vide si l'utilisateur n'en a pas). */
export class Suppliers {
  list = $state<Supplier[]>([]);

  constructor() {
    void connect().then((host) => {
      this.list = host.libraries.current.suppliers;
      host.libraries.onChange((libraries) => (this.list = libraries.suppliers));
    });
  }
}

/** Ouvre la fenêtre d'impression de la fiche (le moteur ajoute l'en-tête et le pied de page). */
export function printFiche(fiche: FichePrint): void {
  void connect().then((host) => host.print(fiche));
}
