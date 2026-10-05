// Page `serviceEntry` de Finances : aucune interface. Le moteur la charge dans un cadre invisible le temps d'UN appel, puis la détruit.
// Rien n'est gardé en mémoire d'un appel à l'autre : le registre est lu dans les réglages du plugin et réécrit en entier à chaque écriture.
import { connect, ServiceError } from "@etabli/sdk";
import { FONCTIONS, executer } from "../src/service";
import { ErreurFinances } from "../src/types";

const etabli = await connect<unknown>();

const gestionnaires = Object.fromEntries(
  Object.keys(FONCTIONS).map((fonction) => [
    fonction,
    (args: unknown, { caller }: { caller: string }) => {
      try {
        const r = executer(etabli.settings.data, fonction, args, caller, Date.now());
        // Le registre n'est réécrit que s'il a changé. Les messages d'un même port arrivent dans l'ordre : le moteur reçoit les
        // réglages AVANT la réponse, donc l'appel suivant (un cadre neuf) les relit déjà à jour.
        if (r.registre) etabli.settings.update(r.registre);
        return r.valeur;
      } catch (e) {
        if (e instanceof ErreurFinances) throw new ServiceError(e.code, e.message);
        throw e;
      }
    },
  ]),
);

etabli.services.handle("finances", gestionnaires);
