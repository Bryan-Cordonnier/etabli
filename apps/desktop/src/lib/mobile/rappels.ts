// Rappels des plugins sur le téléphone (docs/24, M6) : une NOTIFICATION à un instant précis, jamais une alarme (décision de Bryan, 4 octobre
// 2026), et rien sur PC. Un plugin envoie la liste COMPLÈTE de ses rappels ; le moteur remplace tout ce qu'il avait programmé avant, sans jamais
// toucher aux rappels d'un autre plugin. Seule la page principale peut appeler les notifications natives (docs/19) : une mini-app ne peut que le
// demander par le message `reminders`, contrôlé par la garde (permission `notifications`).
// Module pur : le plugin natif et le stockage sont injectés, donc testés sans téléphone.
import { REMINDERS_HORIZON_MS, REMINDERS_MAX, type Reminder, type RemindersResult } from "@etabli/sdk/protocol";
import { ID_ESSAI, lireEtat, type PluginNotifications } from "./alarmes";

export const CANAL_RAPPELS = "rappels-notifications";
/** Un rappel trop proche (moins de 5 s) risquerait de partir avant d'être programmé : on l'ignore. */
const MARGE_MS = 5000;

export interface DepsRappels {
  /** Le plugin de notifications (voir `pluginNatif`), ou `null` hors du téléphone (PC, navigateur). */
  plugin: PluginNotifications | null;
  /** Identifiants natifs que ce plugin a déjà programmés. */
  lireIds(pluginId: string): Promise<number[]>;
  ecrireIds(pluginId: string, ids: number[]): Promise<void>;
  maintenant(): number;
}

const PAS_SUR_TELEPHONE: RemindersResult = { ok: false, code: "telephone_seulement", message: "Les rappels ne fonctionnent que sur le téléphone, pas sur PC." };

/** Identifiant natif (entier positif sur 31 bits) d'un rappel : stable pour un même (plugin, rappel), jamais celui de l'essai d'alarme. */
export function idNatif(pluginId: string, idRappel: string, dejaPris: ReadonlySet<number> = new Set()): number {
  let h = 0x811c9dc5;
  for (const c of `${pluginId}\u0000${idRappel}`) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let id = (h % 2_000_000_000) + 1;
  while (id === ID_ESSAI || dejaPris.has(id)) id = (id % 2_000_000_000) + 1;
  return id;
}

/** Autorisations et rappels programmés de ce plugin. */
export async function etatRappels(deps: DepsRappels, pluginId: string): Promise<RemindersResult> {
  if (!deps.plugin) return PAS_SUR_TELEPHONE;
  try {
    const [etat, mes, attente] = await Promise.all([lireEtat(deps.plugin), deps.lireIds(pluginId), deps.plugin.getPending()]);
    const attendus = new Set(mes);
    const programmes = attente.notifications.filter((n) => attendus.has(n.id)).length;
    return { ok: true, autorise: etat.notifications, alarmeExacte: etat.exactes, programmes, jusquau: etat.notifications ? deps.maintenant() + REMINDERS_HORIZON_MS : null };
  } catch (e) {
    return { ok: false, code: "erreur", message: `Lecture de l'état des rappels impossible : ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Remplace TOUS les rappels de `pluginId` par `items`. Notifications refusées par l'utilisateur : rien n'est programmé, `autorise: false`,
 * `programmes: 0` — ce n'est pas une erreur, le plugin le dit. Seuls les rappels à venir dans les 60 jours sont programmés (les autres
 * le seront quand le plugin se rouvrira et renverra sa liste).
 */
export async function programmerRappels(deps: DepsRappels, pluginId: string, items: readonly Reminder[]): Promise<RemindersResult> {
  const { plugin } = deps;
  if (!plugin) return PAS_SUR_TELEPHONE;
  if (items.length > REMINDERS_MAX) return { ok: false, code: "argument_invalide", message: `Au plus ${REMINDERS_MAX} rappels.` };
  try {
    const etat = await lireEtat(plugin);
    if (!etat.notifications) return { ok: true, autorise: false, alarmeExacte: etat.exactes, programmes: 0, jusquau: null };

    // On retire d'abord ce que ce plugin avait programmé, et seulement cela.
    const avant = await deps.lireIds(pluginId);
    if (avant.length > 0) await plugin.cancel({ notifications: avant.map((id) => ({ id })) });
    await deps.ecrireIds(pluginId, []);

    const maintenant = deps.maintenant();
    const limite = maintenant + REMINDERS_HORIZON_MS;
    const retenus = items.filter((r) => r.at > maintenant + MARGE_MS && r.at <= limite);
    if (retenus.length > 0) {
      await plugin.createChannel({ id: CANAL_RAPPELS, name: "Rappels", importance: 4, vibration: true });
      const pris = new Set<number>();
      const notifications = retenus.map((r) => {
        const id = idNatif(pluginId, r.id, pris);
        pris.add(id);
        return { id, title: r.title, body: r.text ?? "", channelId: CANAL_RAPPELS, schedule: { at: new Date(r.at), allowWhileIdle: true }, extra: { plugin: pluginId, rappel: r.id } };
      });
      await plugin.schedule({ notifications });
      await deps.ecrireIds(pluginId, notifications.map((n) => n.id));
    }
    return { ok: true, autorise: true, alarmeExacte: etat.exactes, programmes: retenus.length, jusquau: limite };
  } catch (e) {
    return { ok: false, code: "erreur", message: `Programmation des rappels impossible : ${e instanceof Error ? e.message : String(e)}` };
  }
}
