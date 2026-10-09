// Fond local de l'application : tout passe par les commandes du cœur Rust (fichiers sur le disque).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { distribution } from "../distribution";
import { estAndroid, estBureau } from "../plateforme";
import type { DocumentFile, DocumentFilter, DocumentInput, DocumentMeta, Fond, PluginInfo } from "./types";

export const fondTauri: Fond = {
  id: "tauri",
  // Android : mêmes fichiers et mêmes plugins, mais ni fenêtres natives ni mises à jour par l'application.
  capacites: { plugins: true, miseAJour: estBureau || (estAndroid && distribution.androidUpdateUrl !== null), fenetresNatives: estBureau, isolationComplete: true, journal: true },

  pluginsList: (): Promise<PluginInfo[]> => invoke("plugins_list"),
  pluginInstallFile: (): Promise<string | null> => invoke("plugin_installer_fichier"),
  pluginUninstall: (id): Promise<void> => invoke("plugin_desinstaller", { id }),
  onPluginsChanged: (handler) => listen("etabli:plugins", () => handler()),

  documentsList: (filter: DocumentFilter = {}): Promise<DocumentMeta[]> => invoke("documents_list", { ...filter }),
  documentRead: (id): Promise<DocumentFile> => invoke("document_read", { id }),
  documentSave: (document: DocumentInput): Promise<DocumentMeta> => invoke("document_save", { document }),
  documentDelete: (id): Promise<void> => invoke("document_delete", { id }),

  storeLoad: (): Promise<Record<string, unknown>> => invoke("store_load"),
  storeSave: (value): Promise<void> => invoke("store_save", { value }),

  saveFile: (file): Promise<string | null> =>
    invoke<string | null>("fichier_enregistrer", {
      nom: file.name,
      contenu: file.content,
      extension: file.extension,
      description: file.description,
    }),

  dataRead: (nom): Promise<unknown> => invoke("donnees_lire", { nom }),
  dataWrite: (nom, valeur): Promise<void> => invoke("donnees_ecrire", { nom, valeur }),
};
