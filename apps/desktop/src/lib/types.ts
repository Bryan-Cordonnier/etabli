import type { IconName } from "./icons";

/** Sections de la page Paramètres (cahier des charges, section 5.10). */
export type SettingsSection = "apparence" | "plugins" | "apercu" | "mises-a-jour";

/** Page affichée dans un onglet. */
export type View =
  | { kind: "home" }
  | { kind: "plugin"; pluginId: string }
  | { kind: "app"; pluginId: string; appId: string; docId?: string }
  | { kind: "settings"; section?: SettingsSection };

export interface Tab {
  id: number;
  view: View;
  /** Pages précédentes de cet onglet (Alt+Gauche). */
  history: View[];
}

/** Ligne de la liste « Anciens calculs » d'une mini-app. */
export interface PastCalc {
  id: string;
  title: string;
  /** Résumé du résultat, par exemple « 5 barres de 6 m · 88 % ». */
  summary: string;
  date: string;
}

export interface MiniAppManifest {
  id: string;
  name: string;
  description: string;
  icon: IconName;
  emoji: string;
  /** Version de l'application où la mini-app est prévue. */
  plannedFor: "v1" | "v2";
}

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  color: string;
  emoji: string;
  icon: IconName;
  official: boolean;
  miniApps: MiniAppManifest[];
}
