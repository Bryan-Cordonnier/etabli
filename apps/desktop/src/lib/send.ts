// Envoi d'une mini-app vers une autre (cahier des charges des plugins, section 3) : le moteur
// cherche une mini-app qui accepte ce type de données, l'ouvre dans un nouvel onglet et lui
// transmet les données à son ouverture. Fenêtre principale seulement (l'aperçu lui délègue).
import type { Incoming } from "@etabli/sdk/protocol";
import { allMiniApps } from "./plugins/registry";
import { settings } from "./state/settings.svelte";
import { tabs } from "./state/tabs.svelte";
import { ui } from "./state/ui.svelte";

/** Données en attente, par onglet : lues une seule fois par la mini-app qui s'y ouvre. */
const pending = new Map<number, Incoming>();

export function takeIncoming(tabId: number): Incoming | null {
  const value = pending.get(tabId) ?? null;
  pending.delete(tabId);
  return value;
}

export function sendToApp(kind: string, data: unknown, from: string): void {
  const target = allMiniApps().find(({ plugin, app }) => app.entry && app.accepts.includes(kind) && settings.isPluginEnabled(plugin.id));
  if (!target) {
    ui.notify("Aucune mini-app installée ne sait recevoir ces données.");
    return;
  }
  const tabId = tabs.open({ kind: "app", pluginId: target.plugin.id, appId: target.app.id });
  pending.set(tabId, { kind, data, from });
  ui.notify(`Envoyé vers « ${target.app.name} »`);
}
