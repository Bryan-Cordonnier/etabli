// Types partagés par les « fonds » : la couche qui stocke les calculs, les réglages et les plugins.
// Un fond est soit local (Rust dans l'application, ou navigateur), soit — plus tard — un serveur.
// Voir docs/16-spec-serveur-utilisateurs-mobile.md.
export interface DocumentMeta {
  id: string;
  pluginId: string;
  appId: string;
  title: string;
  summary: string;
  /** Millisecondes depuis 1970. */
  created: number;
  modified: number;
}

export interface DocumentFile extends DocumentMeta {
  format: number;
  dataVersion: number;
  appVersion: string;
  data: unknown;
}

export interface DocumentInput {
  id?: string;
  pluginId: string;
  appId: string;
  dataVersion: number;
  title: string;
  summary: string;
  data: unknown;
  /** Version du calcul lue par le client ; le serveur refuse l'enregistrement (409) si elle a changé ailleurs. */
  versionAttendue?: number;
}

/** D'où vient un plugin : livré avec l'application, installé depuis un fichier signé, ou déposé à la main. */
export type PluginSource = "integre" | "installe" | "utilisateur";

export interface PluginInfo {
  /** Fichiers du plugin (chemins relatifs), fournis par un serveur pour les garder d'avance hors ligne. */
  fichiers?: string[];
  manifest: unknown;
  official: boolean;
  source?: PluginSource;
}

export interface DocumentFilter {
  pluginId?: string;
  appId?: string;
  limit?: number;
}

/** Ce que le fond actuel sait faire ; l'interface s'en sert pour masquer ou désactiver les fonctions absentes. */
export interface Capacites {
  /** Installation et désinstallation de plugins depuis un fichier signé. */
  plugins: boolean;
  /** Mises à jour automatiques de l'application. */
  miseAJour: boolean;
  /** Vraies fenêtres (barre de titre, aperçu rapide, raccourci global, zone de notification). */
  fenetresNatives: boolean;
  /** Mini-apps dans un cadre à origine opaque (isolation complète). Faux : elles gardent leur origine. */
  isolationComplete: boolean;
  /** Erreurs de l'interface recopiées dans le journal de l'application. */
  journal: boolean;
}

/** Contenu complet d'un fond local : calculs, données de plugin, réglages. */
export interface ExportComplet {
  documents: DocumentFile[];
  donnees: Record<string, unknown>;
  reglages: Record<string, unknown>;
}

/** Couche de stockage et de plugins de l'application. L'interface ne parle qu'à elle. */
export interface Fond {
  /** « tauri » (fichiers via Rust), « web » (IndexedDB du navigateur) ou « serveur » (serveur Établi, avec cache hors ligne). */
  readonly id: "tauri" | "web" | "serveur";
  readonly capacites: Capacites;

  /** Dossier d'où sont servis les fichiers des plugins, quand ce n'est pas le protocole de l'application. */
  readonly urlPlugins?: string;
  /**
   * Origine propre à un plugin (un nom d'hôte chacun) quand le serveur en fournit : la mini-app y garde son origine et un
   * service worker la rend utilisable hors ligne, sans jamais partager de stockage avec l'application ni avec un autre
   * plugin. `undefined` : cadre à origine opaque, en ligne seulement.
   */
  readonly originePlugin?: (pluginId: string) => string | undefined;

  /** Tout ce que ce fond contient, pour l'importer dans un serveur (fonds locaux seulement). */
  exporterTout?(): Promise<ExportComplet>;

  pluginsList(): Promise<PluginInfo[]>;
  /** Installe un fichier .etabli-plugin choisi par l'utilisateur ; null s'il annule. */
  pluginInstallFile(): Promise<string | null>;
  pluginUninstall(id: string): Promise<void>;
  /** Liste des plugins changée (installation, désinstallation), dans n'importe quelle fenêtre. */
  onPluginsChanged(handler: () => void): Promise<() => void>;

  documentsList(filter?: DocumentFilter): Promise<DocumentMeta[]>;
  documentRead(id: string): Promise<DocumentFile>;
  documentSave(document: DocumentInput): Promise<DocumentMeta>;
  documentDelete(id: string): Promise<void>;

  /** Réglages de l'application et onglets ouverts (clés « settings » et « session »). */
  storeLoad(): Promise<Record<string, unknown>>;
  storeSave(value: Record<string, unknown>): Promise<void>;

  /**
   * Fichier produit par une mini-app : « Enregistrer sous » puis écriture. Renvoie le chemin
   * choisi, ou null si l'utilisateur annule. Dans un navigateur : téléchargement.
   */
  saveFile(file: { name: string; content: string; extension: string; description: string }): Promise<string | null>;

  /** Bibliothèques et réglages de plugin : `null` si rien n'est encore enregistré. */
  dataRead(nom: string): Promise<unknown>;
  dataWrite(nom: string, valeur: unknown): Promise<void>;
}
