// Appels au cœur Rust. Hors de Tauri (aperçu dans un navigateur pendant le développement),
// les documents sont gardés dans le navigateur avec le même comportement, pour tester l'interface.
import { invoke, isTauri } from "@tauri-apps/api/core";

export const inTauri = isTauri();

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
};
