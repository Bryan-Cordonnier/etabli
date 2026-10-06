// Câblage des rappels dans l'application : le vrai plugin de notifications (téléphone) et le stockage des identifiants programmés.
// Les demandes passent l'une après l'autre : deux mini-apps qui renvoient leur liste en même temps ne se marchent pas dessus.
import type { Reminder, RemindersResult } from "@etabli/sdk/protocol";
import { api } from "$lib/api";
import { estNatif, pluginNatif } from "./alarmes";
import { etatRappels, programmerRappels, type DepsRappels } from "./rappels";

export type DemandeRappels = { op: "set"; items: Reminder[] } | { op: "state" };

let file: Promise<unknown> = Promise.resolve();

const nomDonnees = (pluginId: string) => `rappels.${pluginId}`;

/** Traite la demande d'un plugin (déjà contrôlée par la garde, permission `notifications` comprise). Ne jette jamais. */
export function traiterRappels(pluginId: string, demande: DemandeRappels): Promise<RemindersResult> {
  const travail = file.then(async (): Promise<RemindersResult> => {
    const deps: DepsRappels = {
      plugin: estNatif() ? await pluginNatif() : null,
      // Une lecture qui ÉCHOUE n'est pas « rien de programmé » : l'erreur remonte (rien n'est touché), sinon des rappels resteraient en double.
      lireIds: async (id) => {
        const v = await api.dataRead(nomDonnees(id));
        return Array.isArray(v) ? v.filter((x): x is number => Number.isSafeInteger(x)) : [];
      },
      ecrireIds: (id, ids) => api.dataWrite(nomDonnees(id), ids),
      maintenant: () => Date.now(),
    };
    return demande.op === "state" ? etatRappels(deps, pluginId) : programmerRappels(deps, pluginId, demande.items);
  });
  file = travail.catch(() => undefined);
  return travail.catch((e): RemindersResult => ({ ok: false, code: "erreur", message: e instanceof Error ? e.message : String(e) }));
}
