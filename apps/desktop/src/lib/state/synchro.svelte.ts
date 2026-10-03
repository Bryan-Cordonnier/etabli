// État de la synchronisation avec le serveur, pour le bandeau « hors ligne » (voir SynchroBanner.svelte).
import type { Rapport } from "$lib/serveur/cache";
import { ui } from "./ui.svelte";

class Synchro {
  etat = $state<"local" | "en-ligne" | "hors-ligne" | "synchronisation">("local");
  /** Écritures faites hors ligne et pas encore envoyées. */
  enAttente = $state(0);
  /** Le serveur ne reconnaît plus la session : il faut se reconnecter. */
  sessionExpiree = $state(false);

  /** Branché sur le cache du fond serveur. */
  readonly rapport: Rapport = {
    etat: (etat) => (this.etat = etat),
    enAttente: (nombre) => (this.enAttente = nombre),
    message: (texte) => ui.notify(texte),
    sessionExpiree: () => (this.sessionExpiree = true),
  };
}

export const synchro = new Synchro();
