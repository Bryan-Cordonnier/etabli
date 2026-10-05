// Page `serviceEntry` de l'Agenda : aucune interface. Le moteur la charge dans un cadre invisible le temps d'UN appel, puis la détruit.
// Rien n'est gardé en mémoire d'un appel à l'autre : le carnet est lu dans les réglages du plugin et réécrit en entier à chaque écriture.
import { connect, ServiceError } from "@etabli/sdk";
import { FONCTIONS, executer } from "../src/service";
import { ErreurAgenda } from "../src/types";

const etabli = await connect<unknown>();

const gestionnaires = Object.fromEntries(
  Object.keys(FONCTIONS).map((fonction) => [
    fonction,
    (args: unknown, { caller }: { caller: string }) => {
      try {
        const r = executer(etabli.settings.data, fonction, args, caller);
        // Le carnet n'est réécrit que s'il a changé. Les messages d'un même port arrivent dans l'ordre : le moteur reçoit les
        // réglages AVANT la réponse, donc l'appel suivant (un cadre neuf) les relit déjà à jour.
        if (r.carnet) etabli.settings.update(r.carnet);
        return r.valeur;
      } catch (e) {
        if (e instanceof ErreurAgenda) throw new ServiceError(e.code === "illisible" ? "erreur" : e.code, e.message);
        throw e;
      }
    },
  ]),
);

etabli.services.handle("agenda", gestionnaires);
