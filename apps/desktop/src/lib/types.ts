import type { IconName } from "./icons";

/**
 * Sections de la page Paramètres (cahier des charges, section 5.10). Une page de réglages ajoutée
 * par un plugin s'écrit « plugin:<plugin>:<page> ».
 */
export type SettingsSection =
  | "general"
  | "apparence"
  | "plugins"
  | "apercu"
  | "raccourcis"
  | "serveur"
  | "administration"
  | "alarmes"
  | "a-propos"
  | `plugin:${string}`;

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
  | {
      kind: "settings";
      section?: SettingsSection;
      /**
       * Intention transmise à la page de réglages d'un plugin (« add=scie »). Jamais enregistrée :
       * revenir sur la page ne doit pas rejouer l'action.
       */
      hash?: string;
      /** Change à chaque ouverture avec une intention : la page est recréée même si l'intention est la même. */
      nonce?: number;
    }
  | { kind: "catalogue" };

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
  /** Page de la mini-app dans le plugin ; absente tant que la mini-app n'est pas développée. */
  entry?: string;
  /** Version du format des données enregistrées par la mini-app. */
  dataVersion: number;
  /** Version de l'application où la mini-app est prévue. */
  plannedFor: "v1" | "v2";
  /** Types de données que la mini-app sait recevoir d'une autre (« piece-plate »…). */
  accepts: string[];
}

/** Page de réglages ajoutée par un plugin dans Paramètres → Plugins. */
export interface PluginSettingsPage {
  id: string;
  /** Nom dans le menu des Paramètres. */
  title: string;
  /** Page du plugin (« reglages/index.html »). */
  entry: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  apiVersion: string;
  author: string;
  color: string;
  icon: IconName;
  permissions: string[];
  /** Plugins obligatoires, avec la plage de versions acceptée (« fournisseurs »: « ^1 »). */
  dependencies: Record<string, string>;
  /** Plugins dont celui-ci profite s'ils sont là, sans en avoir besoin. */
  optionalDependencies: Record<string, string>;
  /** Données que ce plugin publie pour les autres : nom du service → version du contrat. */
  provides: Record<string, string>;
  /** Pages de réglages que ce plugin ajoute aux Paramètres. */
  settings: PluginSettingsPage[];
  official: boolean;
  /** Livré avec l'application, installé depuis le catalogue (désinstallable), ou déposé à la main. */
  source: "integre" | "catalogue" | "utilisateur";
  miniApps: MiniAppManifest[];
  /** Raison de la révocation de la version installée (docs/20) ; le plugin est alors désactivé. */
  revoked?: string;
  /** Version précédente gardée pour un retour en arrière. */
  previousVersion?: string;
}
