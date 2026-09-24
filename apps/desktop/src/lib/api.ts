// Appels au cœur Rust. Hors de Tauri (aperçu dans un navigateur pendant le développement),
// les documents sont gardés dans le navigateur avec le même comportement, pour tester l'interface.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { MachineKind } from "@etabli/sdk/protocol";
import type { AppView } from "./types";

export const inTauri = isTauri();

export interface ShortcutStatus {
  accelerator: string | null;
  erreur: string | null;
}

export interface AppInfo {
  version: string;
  documents: string;
  config: string;
}

/** Fenêtres, raccourci global, démarrage avec Windows, liens. */
export const system = {
  toggleQuick: (): Promise<void> => (inTauri ? invoke("apercu_basculer") : Promise.resolve()),
  closeQuick: (): Promise<void> => (inTauri ? invoke("apercu_fermer") : Promise.resolve()),
  showMain: (): Promise<void> => (inTauri ? invoke("etabli_afficher") : Promise.resolve()),

  setShortcut: (accelerator: string): Promise<void> =>
    inTauri ? invoke("raccourci_definir", { accelerator }) : Promise.resolve(),
  shortcutStatus: (): Promise<ShortcutStatus> =>
    inTauri ? invoke("raccourci_etat") : Promise.resolve({ accelerator: null, erreur: null }),

  appInfo: (): Promise<AppInfo> =>
    inTauri
      ? invoke("infos_app")
      : Promise.resolve({ version: "0.1.0", documents: "(aperçu navigateur)", config: "(aperçu navigateur)" }),

  setCloseToTray: (active: boolean): Promise<void> =>
    inTauri ? invoke("fermeture_zone_definir", { active }) : Promise.resolve(),

  autostartEnabled: (): Promise<boolean> => (inTauri ? isEnabled() : Promise.resolve(false)),
  setAutostart: (active: boolean): Promise<void> =>
    inTauri ? (active ? enable() : disable()) : Promise.resolve(),

  openUrl: (url: string): Promise<void> => (inTauri ? openUrl(url) : Promise.resolve(void window.open(url))),
  reveal: (path: string): Promise<void> => (inTauri ? revealItemInDir(path) : Promise.resolve()),

  /** Taille du texte : zoom de toute la fenêtre, mini-apps comprises. */
  setZoom: (factor: number): Promise<void> => {
    if (inTauri) return getCurrentWebview().setZoom(factor);
    document.documentElement.style.zoom = String(factor);
    return Promise.resolve();
  },

  /** L'aperçu rapide demande à la fenêtre principale d'ouvrir un calcul dans un onglet. */
  openInMain: (view: AppView): Promise<void> => (inTauri ? emitTo("main", "etabli:ouvrir", view) : Promise.resolve()),
  onOpenRequest: (handler: (view: AppView) => void): Promise<() => void> =>
    inTauri ? listen<AppView>("etabli:ouvrir", (event) => handler(event.payload)) : Promise.resolve(() => {}),
  /** Une mini-app de l'aperçu rapide demande une nouvelle machine : la fenêtre principale ouvre les Paramètres. */
  requestMachine: (kind: MachineKind): Promise<void> =>
    inTauri ? emitTo("main", "etabli:machine", kind) : Promise.resolve(),
  onMachineRequest: (handler: (kind: MachineKind) => void): Promise<() => void> =>
    inTauri ? listen<MachineKind>("etabli:machine", (event) => handler(event.payload)) : Promise.resolve(() => {}),
  onQuickOpened: (handler: () => void): Promise<() => void> =>
    inTauri ? listen("apercu:ouvert", () => handler()) : Promise.resolve(() => {}),
  /** Le raccourci a été pressé alors que l'aperçu était ouvert : il doit se fermer. */
  onQuickCloseRequest: (handler: () => void): Promise<() => void> =>
    inTauri ? listen("apercu:fermer", () => handler()) : Promise.resolve(() => {}),
};

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
}

export interface PluginInfo {
  manifest: unknown;
  official: boolean;
}

export interface DocumentFilter {
  pluginId?: string;
  appId?: string;
  limit?: number;
}

export const api = {
  pluginsList: (): Promise<PluginInfo[]> => (inTauri ? invoke("plugins_list") : Promise.resolve([])),

  documentsList: (filter: DocumentFilter = {}): Promise<DocumentMeta[]> =>
    inTauri ? invoke("documents_list", { ...filter }) : Promise.resolve(preview.list(filter)),

  documentRead: (id: string): Promise<DocumentFile> =>
    inTauri ? invoke("document_read", { id }) : preview.read(id),

  documentSave: (document: DocumentInput): Promise<DocumentMeta> =>
    inTauri ? invoke("document_save", { document }) : Promise.resolve(preview.save(document)),

  documentDelete: (id: string): Promise<void> =>
    inTauri ? invoke("document_delete", { id }) : Promise.resolve(preview.delete(id)),

  storeLoad: (): Promise<Record<string, unknown>> => invoke("store_load"),

  storeSave: (value: Record<string, unknown>): Promise<void> => invoke("store_save", { value }),

  /** Bibliothèques et réglages de plugin : `null` si rien n'est encore enregistré. */
  dataRead: (nom: string): Promise<unknown> => (inTauri ? invoke("donnees_lire", { nom }) : Promise.resolve(preview.dataRead(nom))),

  dataWrite: (nom: string, valeur: unknown): Promise<void> =>
    inTauri ? invoke("donnees_ecrire", { nom, valeur }) : Promise.resolve(preview.dataWrite(nom, valeur)),
};

/** Documents de l'aperçu navigateur, dans localStorage. Même règles que documents.rs. */
const preview = {
  KEY: "etabli.preview-documents",

  all(): DocumentFile[] {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) ?? "[]") as DocumentFile[];
    } catch {
      return [];
    }
  },

  write(docs: DocumentFile[]): void {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(docs));
    } catch {
      // Stockage indisponible : les documents de l'aperçu ne sont pas gardés.
    }
  },

  list({ pluginId, appId, limit }: DocumentFilter): DocumentMeta[] {
    const docs = this.all()
      .filter((d) => (!pluginId || d.pluginId === pluginId) && (!appId || d.appId === appId))
      .sort((a, b) => b.modified - a.modified)
      .map(({ id, pluginId, appId, title, summary, created, modified }) => ({
        id,
        pluginId,
        appId,
        title,
        summary,
        created,
        modified,
      }));
    return limit ? docs.slice(0, limit) : docs;
  },

  async read(id: string): Promise<DocumentFile> {
    const doc = this.all().find((d) => d.id === id);
    if (!doc) throw new Error("Document introuvable");
    return doc;
  },

  save(input: DocumentInput): DocumentMeta {
    const docs = this.all();
    const existing = docs.find((d) => d.id === input.id);
    const now = Date.now();
    const doc: DocumentFile = {
      ...input,
      id: input.id ?? crypto.randomUUID().replaceAll("-", ""),
      title: input.title.trim(),
      format: 1,
      appVersion: "aperçu",
      created: existing?.created ?? now,
      modified: now,
    };
    this.write([...docs.filter((d) => d.id !== doc.id), doc]);
    return doc;
  },

  delete(id: string): void {
    this.write(this.all().filter((d) => d.id !== id));
  },

  dataRead(nom: string): unknown {
    try {
      return JSON.parse(localStorage.getItem(`etabli.preview-data.${nom}`) ?? "null");
    } catch {
      return null;
    }
  },

  dataWrite(nom: string, valeur: unknown): void {
    try {
      localStorage.setItem(`etabli.preview-data.${nom}`, JSON.stringify(valeur));
    } catch {
      // Stockage indisponible : rien n'est gardé dans l'aperçu.
    }
  },
};
