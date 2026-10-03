// Fond local du navigateur (aperçu pendant le développement, plus tard version web) : tout est gardé
// dans localStorage, avec les mêmes règles que documents.rs, donnees.rs et store.rs.
import type { DocumentFile, DocumentFilter, DocumentInput, DocumentMeta, Fond, PluginInfo } from "./types";

/** Le sous-ensemble de `Storage` utilisé ici ; permet de tester avec un stockage en mémoire. */
export type Stockage = Pick<Storage, "getItem" | "setItem">;

const DOCUMENTS = "etabli.preview-documents";
const DONNEES = "etabli.preview-data.";
const STORE = "etabli.store";

/** Manifestes des plugins du dépôt, que le serveur Vite de développement sert sous /__plugins. */
function manifestesDuDepot(): PluginInfo[] {
  const files = import.meta.glob<unknown>(
    ["../../../../../plugins/*/manifest.json", "../../../../../plugins/*/public/manifest.json"],
    { eager: true, import: "default" },
  );
  return Object.values(files).map((manifest) => ({ manifest, official: true }));
}

export function creerFondNavigateur(
  stockage: Stockage = localStorage,
  plugins: () => PluginInfo[] = manifestesDuDepot,
): Fond {
  const lire = <T>(cle: string, defaut: T): T => {
    try {
      const brut = stockage.getItem(cle);
      return brut === null ? defaut : (JSON.parse(brut) as T);
    } catch {
      return defaut;
    }
  };
  const ecrire = (cle: string, valeur: unknown): void => {
    try {
      stockage.setItem(cle, JSON.stringify(valeur));
    } catch {
      // Stockage indisponible : rien n'est gardé dans l'aperçu.
    }
  };
  const documents = (): DocumentFile[] => lire<DocumentFile[]>(DOCUMENTS, []);

  const indisponible = (quoi: string) => (): Promise<never> =>
    Promise.reject(new Error(`${quoi} n'est disponible que dans l'application.`));

  return {
    id: "navigateur",
    capacites: { catalogue: false, miseAJour: false, fenetresNatives: false, isolationComplete: false, journal: false },

    pluginsList: () => Promise.resolve(plugins()),
    catalogueRead: indisponible("Le catalogue"),
    pluginInstall: indisponible("L'installation de plugins"),
    pluginInstallFile: indisponible("L'installation de plugins"),
    pluginUninstall: indisponible("La désinstallation de plugins"),
    onPluginsChanged: () => Promise.resolve(() => {}),
    onInstallProgress: () => Promise.resolve(() => {}),

    documentsList({ pluginId, appId, limit }: DocumentFilter = {}): Promise<DocumentMeta[]> {
      const docs = documents()
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
      return Promise.resolve(limit ? docs.slice(0, limit) : docs);
    },

    async documentRead(id: string): Promise<DocumentFile> {
      const doc = documents().find((d) => d.id === id);
      if (!doc) throw new Error("Document introuvable");
      return doc;
    },

    documentSave(input: DocumentInput): Promise<DocumentMeta> {
      const docs = documents();
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
      ecrire(DOCUMENTS, [...docs.filter((d) => d.id !== doc.id), doc]);
      return Promise.resolve(doc);
    },

    documentDelete(id: string): Promise<void> {
      ecrire(
        DOCUMENTS,
        documents().filter((d) => d.id !== id),
      );
      return Promise.resolve();
    },

    storeLoad: () => Promise.resolve(lire<Record<string, unknown>>(STORE, {})),
    storeSave: (value) => Promise.resolve(ecrire(STORE, value)),

    saveFile(file): Promise<string | null> {
      const url = URL.createObjectURL(new Blob([file.content], { type: "application/octet-stream" }));
      const link = Object.assign(document.createElement("a"), { href: url, download: file.name });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return Promise.resolve(file.name);
    },

    dataRead: (nom) => Promise.resolve(lire<unknown>(DONNEES + nom, null)),
    dataWrite: (nom, valeur) => Promise.resolve(ecrire(DONNEES + nom, valeur)),
  };
}
