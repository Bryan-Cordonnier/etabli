// Document d'une mini-app : les données réactives de l'écran, chargées depuis le calcul enregistré
// et renvoyées au moteur à chaque modification (qui les enregistre une seconde plus tard).
//
//   const doc = new MiniAppDocument({ a: "", b: "" }, (d) => `a = ${d.a}`);
//   <Field bind:value={doc.data.a} />
import { connect, type Etabli } from "@etabli/sdk";

export class MiniAppDocument<T extends object> {
  data = $state() as T;
  /** Vrai une fois le moteur connecté et le calcul enregistré chargé. */
  ready = $state(false);
  #host: Etabli<T> | undefined;
  #last = "";

  /**
   * @param defaults données d'un nouveau calcul
   * @param summary résumé affiché dans la liste des anciens calculs (« c = 370 mm »)
   * @param migrate remet au format actuel un calcul enregistré par une version précédente
   */
  constructor(defaults: T, summary: (data: T) => string, migrate: (saved: Record<string, unknown>) => Partial<T> = (s) => s as Partial<T>) {
    this.data = structuredClone(defaults);
    this.#last = JSON.stringify(this.data);

    void connect<T>().then((host) => {
      const saved = host.document.data;
      // Les champs ajoutés dans une version plus récente de la mini-app gardent leur valeur par défaut.
      if (saved) this.data = { ...structuredClone(defaults), ...migrate(saved as Record<string, unknown>) };
      this.#last = JSON.stringify(this.data);
      this.#host = host;
      this.ready = true;
    });

    $effect.root(() => {
      $effect(() => {
        const json = JSON.stringify(this.data);
        const text = summary(this.data);
        // Rien n'est envoyé tant que l'utilisateur n'a rien changé : un calcul seulement ouvert
        // n'est pas réenregistré, un nouveau calcul vide n'encombre pas l'historique.
        if (!this.#host || json === this.#last) return;
        this.#last = json;
        this.#host.document.update(JSON.parse(json) as T);
        this.#host.document.setSummary(text);
      });
    });
  }

  /** Copie un résultat dans le presse-papiers, avec confirmation. */
  copy = (text: string): void => {
    void this.#host?.clipboard.copy(text);
  };

  notify = (text: string): void => {
    this.#host?.ui.notify(text);
  };
}
