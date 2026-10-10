// Changements en direct : le serveur prévient l'appareil quand un autre appareil du même compte enregistre une donnée
// (flux SSE `/api/evenements`). L'appareil relit alors la donnée : la page ouverte se met à jour sans qu'on la quitte.
// `fetch` en flux plutôt que `EventSource` : il faut l'en-tête `Authorization`.
import type { ClientApi } from "./http";

export interface Changement {
  type: string;
  nom: string;
}

/** Lit un flux « text/event-stream » : appelle `surChangement` pour chaque message `data:` qui contient un changement valide. */
export function analyserFlux(texte: string, surChangement: (c: Changement) => void): string {
  const blocs = texte.split(/\r?\n\r?\n/);
  const reste = blocs.pop() ?? "";
  for (const bloc of blocs) {
    const donnees = bloc
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!donnees) continue;
    try {
      const c = JSON.parse(donnees) as Partial<Changement>;
      if (typeof c.type === "string" && typeof c.nom === "string") surChangement({ type: c.type, nom: c.nom });
    } catch {
      /* message illisible : ignoré */
    }
  }
  return reste;
}

export interface OptionsEcoute {
  surChangement: (c: Changement) => void;
  /** Flux (ré)ouvert : des changements ont pu être manqués, on relit. */
  surOuverture: () => void;
  fetch?: typeof fetch;
  /** Attente avant de réessayer, en millisecondes. */
  attente?: (essai: number) => number;
}

/** Écoute le serveur tant que la fonction rendue n'a pas été appelée ; se reconnecte seul. */
export function ecouter(client: ClientApi, options: OptionsEcoute): () => void {
  const arret = new AbortController();
  const appeler = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const attente = options.attente ?? ((essai: number) => Math.min(30_000, 1500 * 2 ** Math.min(essai, 5)));

  void (async () => {
    for (let essai = 0; !arret.signal.aborted; essai++) {
      try {
        const reponse = await appeler(`${client.base}/api/evenements`, {
          headers: { Authorization: `Bearer ${client.jeton ?? ""}`, Accept: "text/event-stream" },
          signal: arret.signal,
        });
        if (reponse.status === 401) return; // session finie : la reconnexion se fait ailleurs
        if (reponse.ok && reponse.body) {
          essai = 0;
          options.surOuverture();
          const lecteur = reponse.body.getReader();
          const decodeur = new TextDecoder();
          let tampon = "";
          for (;;) {
            const { done, value } = await lecteur.read();
            if (done) break;
            tampon = analyserFlux(tampon + decodeur.decode(value, { stream: true }), options.surChangement);
          }
        }
      } catch {
        if (arret.signal.aborted) return;
      }
      await new Promise((r) => setTimeout(r, attente(essai)));
    }
  })();

  return () => arret.abort();
}