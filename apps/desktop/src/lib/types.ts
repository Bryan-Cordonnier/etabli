import type { IconName } from "./icons";

/** Sections de la page Paramètres (cahier des charges, section 5.10). */
export type SettingsSection =
  | "general"
  | "apparence"
  | "bibliotheques"
  | "plugins"
  | "apercu"
  | "raccourcis"
  | "a-propos";

/** Page affichée dans un onglet. */
export type View =
  | { kind: "home" }
  | { kind: "plugin"; pluginId: string }
  | {
      kind: "app";
      pluginId: string;
      appId: string;
      /** Document ouvert ; absent pour un nouveau calcul pas encore enregistré. */
      docId?: string;
      /** Change à chaque ouverture : l'écran est recréé, mais pas quand le calcul reçoit son identifiant. */
      nonce?: number;
    }
  | { kind: "settings"; section?: SettingsSection };

export type AppView = Extract<View, { kind: "app" }>;

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
  /** Page de la mini-app dans le plugin ; absente tant que la mini-app n'est pas développée. */
  entry?: string;
  /** Version du format des données enregistrées par la mini-app. */
  dataVersion: number;
  /** Version de l'application où la mini-app est prévue. */
  plannedFor: "v1" | "v2";
}

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  apiVersion: string;
  author: string;
  color: string;
  emoji: string;
  icon: IconName;
  permissions: string[];
  official: boolean;
  miniApps: MiniAppManifest[];
}
