import type { IconName } from "./icons";

/**
 * Sections de la page Paramètres (cahier des charges, section 5.10). Une page de réglages ajoutée
 * par un plugin s'écrit « plugin:<plugin>:<page> ».
 */
export type SettingsSection =
  | "general"
  | "apparence"
  | "plugins"
  | "raccourcis"
  | "ia"
  | "serveur"
  | "administration"
  | "alarmes"
  | "a-propos"
  | `plugin:${string}`;

/** Page affichée dans un onglet. */
export type View =
  | { kind: "home" }
  | {
      /** Une page déclarée par un plugin (`pages` du manifeste, docs/28). */
      kind: "page";
      pluginId: string;
      pageId: string;
      /** Change à chaque ouverture : l'écran est recréé. */
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
  | { kind: "plugins" };

export type PageView = Extract<View, { kind: "page" }>;

export interface Tab {
  id: number;
  view: View;
  /** Pages précédentes de cet onglet (Alt+Gauche). */
  history: View[];
}

/** Une app d'un plugin : une page HTML isolée que les pages du plugin affichent (`apps` du manifeste). */
export interface AppManifest {
  id: string;
  name: string;
  /** Page de l'app dans le plugin (« apps/courbe/index.html »). */
  entry: string;
  /** Types de données que l'app sait recevoir d'une autre (« piece-plate »…). */
  accepts: string[];
}

/**
 * Une page : ce que la colonne de gauche liste et qu'un onglet affiche (`pages` du manifeste, docs/28).
 * Première version : une page montre une seule app, sur toute la zone (`layout.type: "app"`).
 */
export interface PageManifest {
  id: string;
  title: string;
  icon: string;
  /** Identifiant de l'app de `apps` que la page affiche. */
  app: string;
  /** Catégorie proposée dans la colonne (« Argent », « Temps »…), ou « » : l'utilisateur peut la changer (docs/28, section 2). */
  category: string;
}

/** Taille d'un widget en cases de la grille de l'accueil : « largeur x hauteur » (« 2x1 »), de 1 à 4 cases de large et de haut. */
export type WidgetSize = `${1 | 2 | 3 | 4}x${1 | 2 | 3 | 4}`;

/** Un widget : une petite app que l'accueil affiche dans sa grille (`widgets` du manifeste, docs/28 §4). */
export interface WidgetManifest {
  id: string;
  title: string;
  icon: string;
  /** Identifiant de l'app de `apps` affichée ; elle sait qu'elle est un widget par `location.hash === "#widget"`. */
  app: string;
  /** Tailles que le widget sait afficher (la première est la taille de départ si `default` est absent). */
  sizes: WidgetSize[];
  default: WidgetSize;
}

/** Un widget posé sur l'accueil : sa clé (« plugin/widget », ou « @favoris » pour le widget du moteur) et sa taille. */
export interface BoardEntry {
  key: string;
  size: WidgetSize;
}

/** Un paramètre qu'un plugin déclare : le moteur en fait un champ des Paramètres, dans l'onglet du plugin. */
export type ParameterManifest = {
  id: string;
  label: string;
  /** Titre de groupe dans l'onglet du plugin ; les paramètres consécutifs du même groupe sont réunis. */
  group: string;
  /** Phrase d'aide sous le libellé (« légal : 10 % »). */
  hint: string;
} & (
  | { type: "number"; default: number; unit: string; min: number | null; max: number | null; step: number }
  | { type: "text"; default: string }
  | { type: "boolean"; default: boolean }
  | { type: "time"; default: string }
  | { type: "select"; default: string; options: { value: string; label: string }[] }
);

export type ParameterValue = number | string | boolean;

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
  /**
   * Plage de **version de contrat** que ce plugin accepte pour les services qu'il lit ou appelle (« finances »: « ^1 »),
   * à ne pas confondre avec `dependencies`, qui vise la version du plugin (docs/24, M4). Vide : l'ancien comportement.
   */
  services: Record<string, string>;
  /** Page sans interface qui répond aux appels de fonctions de service (« service/index.html »), ou null. */
  serviceEntry: string | null;
  /** Fonctions que ce plugin offre aux autres : service → fonction → accès (« lecture » ou « ecriture »). */
  functions: Record<string, Record<string, "lecture" | "ecriture">>;
  /** Pages de réglages que ce plugin ajoute aux Paramètres. */
  settings: PluginSettingsPage[];
  official: boolean;
  /** Livré avec l'application, installé depuis un fichier signé (désinstallable), ou déposé à la main. */
  source: "integre" | "installe" | "utilisateur";
  apps: AppManifest[];
  pages: PageManifest[];
  /** Widgets que l'utilisateur peut poser sur l'accueil. */
  widgets: WidgetManifest[];
  /** Paramètres déclarés ; leurs valeurs se règlent dans Paramètres → <plugin>. */
  parameters: ParameterManifest[];
}

/** Un plugin que le moteur a refusé de charger, et pourquoi (affiché dans la page des plugins). */
export interface RefusedPlugin {
  id: string;
  name: string;
  reason: string;
}
