// Ce que le moteur partage avec les mini-apps : les réglages propres au plugin, l'enregistrement de fichiers
// et l'envoi de données à une autre mini-app.
//
//   const reglages = new PluginSettings({ keepMin: "300" });
//   <Field bind:value={reglages.data.keepMin} />   // enregistré par le moteur
import { connect, type Etabli, type SavedFile } from "@etabli/sdk";

/**
 * Réglages du plugin, réactifs, partagés par ses mini-apps ouvertes et enregistrés automatiquement.
 *
 * Avec `service`, les réglages sont aussi **publiés** aux plugins qui dépendent de celui-ci
 * (voir `provides` dans le manifeste) : c'est ce que fait le plugin Finances.
 */
export class PluginSettings<S extends object> {
  data = $state() as S;
  ready = $state(false);
  #last = "";

  /**
   * @param defaults réglages tant que l'utilisateur n'a rien changé
   * @param clean remet en forme des réglages enregistrés (ancienne version, fichier abîmé)
   * @param service nom du service à publier avec ces réglages, ou rien
   */
  constructor(
    defaults: S,
    clean: (saved: unknown, defaults: S) => S = (saved) => ({ ...defaults, ...(saved as S) }),
    service?: string,
  ) {
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
      // Remet le service d'aplomb dès l'ouverture (données migrées, fichier réécrit à la main…).
      if (service) connected.services.provide(service, JSON.parse(this.#last));
      this.ready = true;
    });

    $effect.root(() => {
      $effect(() => {
        const json = JSON.stringify(this.data);
        if (!host || json === this.#last) return;
        this.#last = json;
        host.settings.update(JSON.parse(json));
        if (service) host.services.provide(service, JSON.parse(json));
      });
    });
  }
}

/** Enregistre un fichier (DXF, CSV…) : « Enregistrer sous » de Windows, puis écriture par le moteur. */
export function saveFile(file: SavedFile): void {
  void connect().then((host) => host.saveFile(file));
}

/** Envoie des données à une autre mini-app (« Envoyer au calepinage »). */
export function sendTo(kind: string, data: unknown): void {
  void connect().then((host) => host.send(kind, data));
}

/**
 * Paramètres que le plugin déclare dans son manifeste (`parameters`), réglés par l'utilisateur dans Paramètres. En lecture
 * seule ; `defaults` sert tant que le moteur n'a pas répondu (les mêmes valeurs que dans le manifeste).
 *
 *   const params = new PluginParameters({ ifm: 10, lever: "08:00" });
 *   params.values.ifm   // réactif : l'écran suit un changement fait dans les Paramètres
 */
export class PluginParameters<P extends Record<string, number | string | boolean>> {
  values = $state() as P;
  ready = $state(false);

  constructor(defaults: P) {
    this.values = { ...defaults };
    void connect().then((host) => {
      const lire = (recues: Record<string, number | string | boolean>) => {
        this.values = { ...defaults, ...recues } as P;
      };
      lire(host.parameters.values);
      host.parameters.onChange(lire);
      this.ready = true;
    });
  }
}

/** Données reçues d'une autre page à l'ouverture (la page a été ouverte par un envoi). */
export function onIncoming(kind: string, handler: (data: unknown, from: string) => void): void {
  void connect().then((host) => {
    if (host.incoming?.kind === kind) handler(host.incoming.data, host.incoming.from);
  });
}
