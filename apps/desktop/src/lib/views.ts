import { getPage } from "./plugins/registry.svelte";
import type { View } from "./types";

export interface ViewInfo {
  title: string;
  icon: string;
  color: string;
}

const UNKNOWN: ViewInfo = { title: "Page introuvable", icon: "puzzle", color: "var(--faint)" };

/** Titre, icône et couleur d'une page, pour les onglets et la palette. */
export function describeView(view: View): ViewInfo {
  switch (view.kind) {
    case "home":
      return { title: "Accueil", icon: "home", color: "var(--accent)" };
    case "settings":
      return { title: "Paramètres", icon: "settings", color: "var(--faint)" };
    case "plugins":
      return { title: "Plugins", icon: "puzzle", color: "var(--accent)" };
    case "page": {
      const found = getPage(view.pluginId, view.pageId);
      return found ? { title: found.page.title, icon: found.page.icon, color: found.plugin.color } : UNKNOWN;
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
