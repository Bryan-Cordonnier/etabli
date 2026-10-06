// Page `serviceEntry` de l'Agenda : aucune interface. Le moteur la charge dans un cadre invisible le temps d'UN appel, puis la détruit.
// Rien n'est gardé en mémoire d'un appel à l'autre : le carnet est lu dans les réglages du plugin et réécrit en entier à chaque écriture.
// Pour les rappels, la page envoie ensuite au moteur la liste COMPLÈTE de ce qui doit sonner (permission `notifications`).
import { connect, ServiceError } from "@etabli/sdk";
import { rappelsPourLeMoteur } from "../src/rappels";
import { FONCTIONS, FONCTIONS_RAPPELS, executer, reponseRappels } from "../src/service";
import { ErreurAgenda } from "../src/types";

const etabli = await connect<unknown>();

const gestionnaires = (fonctions: Record<string, unknown>) =>
  Object.fromEntries(
    Object.keys(fonctions).map((fonction) => [
      fonction,
      async (args: unknown, { caller }: { caller: string }) => {
        try {
          const maintenant = Date.now();
          const r = executer(etabli.settings.data, fonction, args, caller, maintenant);
          // Le carnet n'est réécrit que s'il a changé. Les messages d'un même port arrivent dans l'ordre : le moteur reçoit les
          // réglages AVANT la réponse, donc l'appel suivant (un cadre neuf) les relit déjà à jour.
          if (r.carnet) etabli.settings.update(r.carnet);
          if (r.hote === null) return r.valeur;
          const resultat = r.hote === "etat" ? await etabli.reminders.state() : await etabli.reminders.set(rappelsPourLeMoteur(r.courant, maintenant));
          return reponseRappels(r, fonction, resultat, maintenant);
        } catch (e) {
          if (e instanceof ErreurAgenda) throw new ServiceError(e.code === "illisible" ? "erreur" : e.code, e.message);
          throw e;
        }
      },
    ]),
  );

etabli.services.handle("agenda", gestionnaires(FONCTIONS));
etabli.services.handle("rappels", gestionnaires(FONCTIONS_RAPPELS));
