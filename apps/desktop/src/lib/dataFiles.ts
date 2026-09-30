import { api } from "./api";
import { ui } from "./state/ui.svelte";

const SAVE_DELAY = 400;

/**
 * Écritures différées de fichiers de données (réglages de plugin, services) : une seule écriture,
 * 400 ms après la dernière modification.
 */
export class DataFiles {
  #timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Tant qu'une écriture est en attente, on ne relit pas le disque (on écraserait la saisie). */
  pending(file: string): boolean {
    return this.#timers.has(file);
  }

  schedule(file: string, value: () => unknown): void {
    clearTimeout(this.#timers.get(file));
    const timer = setTimeout(() => {
      void api
        .dataWrite(file, value())
        .catch((err) => ui.notify(`Enregistrement impossible : ${err}`))
        .finally(() => {
          if (this.#timers.get(file) === timer) this.#timers.delete(file);
        });
    }, SAVE_DELAY);
    this.#timers.set(file, timer);
  }
}

/** Nom d'un fichier de données accepté par Rust : minuscules, chiffres, tirets et points, 64 caractères au plus. */
export const validDataName = (name: string): boolean => name.length <= 64 && /^[a-z0-9][a-z0-9.-]*$/.test(name);
