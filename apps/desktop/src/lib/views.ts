import type { IconName } from "./icons";
import { getMiniApp, getPlugin } from "./plugins/registry";
import type { View } from "./types";

export interface ViewInfo {
  title: string;
  icon: IconName;
  emoji: string;
  color: string;
}

const UNKNOWN: ViewInfo = { title: "Page introuvable", icon: "puzzle", emoji: "❔", color: "var(--faint)" };

/** Titre, icône et couleur d'une page, pour les onglets et la palette. */
export function describeView(view: View): ViewInfo {
  switch (view.kind) {
    case "home":
      return { title: "Accueil", icon: "home", emoji: "🏠", color: "var(--accent)" };
    case "settings":
      return { title: "Paramètres", icon: "settings", emoji: "⚙️", color: "var(--faint)" };
    case "plugin": {
      const plugin = getPlugin(view.pluginId);
      return plugin ? { title: plugin.name, icon: plugin.icon, emoji: plugin.emoji, color: plugin.color } : UNKNOWN;
    }
    case "app": {
      const found = getMiniApp(view.pluginId, view.appId);
      return found
        ? { title: found.app.name, icon: found.app.icon, emoji: found.app.emoji, color: found.plugin.color }
        : UNKNOWN;
    }
  }
}

/** Recherche insensible aux accents et à la casse. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
