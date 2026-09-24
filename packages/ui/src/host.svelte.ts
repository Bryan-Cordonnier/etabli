// Ce que le moteur partage avec les mini-apps : les réglages propres au plugin, les bibliothèques
// de l'application (fournisseurs, machines) et l'impression des fiches.
//
//   const reglages = new PluginSettings({ keepMin: "300" });
//   <Field bind:value={reglages.data.keepMin} />   // enregistré par le moteur
import {
  connect,
  type Etabli,
  type FichePrint,
  type Libraries as HostLibraries,
  type Machine,
  type MachineKind,
  type Supplier,
} from "@etabli/sdk";

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

/** Bibliothèques saisies dans les Paramètres d'Établi (listes vides si l'utilisateur n'a rien saisi). */
export class Libraries {
  suppliers = $state<Supplier[]>([]);
  machines = $state<Machine[]>([]);
  #host: Etabli<unknown> | undefined;

  constructor() {
    void connect().then((host) => {
      this.#host = host;
      this.#receive(host.libraries.current);
      host.libraries.onChange((libraries) => this.#receive(libraries));
    });
  }

  #receive(libraries: HostLibraries): void {
    this.suppliers = libraries.suppliers ?? [];
    this.machines = libraries.machines ?? [];
  }

  /** Ouvre les Paramètres sur une nouvelle machine ; elle arrive ensuite dans `machines`. */
  addMachine = (kind: MachineKind): void => {
    this.#host?.libraries.addMachine(kind);
  };
}

/** Ouvre la fenêtre d'impression de la fiche (le moteur ajoute l'en-tête et le pied de page). */
export function printFiche(fiche: FichePrint): void {
  void connect().then((host) => host.print(fiche));
}

/** Envoie des données à une autre mini-app (« Envoyer au calepinage »). */
export function sendTo(kind: string, data: unknown): void {
  void connect().then((host) => host.send(kind, data));
}

/**
 * Données reçues d'une autre mini-app à l'ouverture. À appeler après avoir créé le
 * `MiniAppDocument` : le calcul est chargé avant que les données reçues soient appliquées.
 */
export function onIncoming(kind: string, handler: (data: unknown, from: string) => void): void {
  void connect().then((host) => {
    if (host.incoming?.kind === kind) handler(host.incoming.data, host.incoming.from);
  });
}
