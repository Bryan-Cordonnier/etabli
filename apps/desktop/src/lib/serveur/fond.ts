// Fond « serveur » sans cache : chaque méthode correspond à une route de l'API (docs/17).
// Le cache hors ligne et la file d'écritures sont ajoutés par `avecCache` (cache.ts).
import type { DocumentFile, DocumentFilter, DocumentInput, DocumentMeta, Fond, PluginInfo } from "../fond/types";
import { ClientApi } from "./http";

const gereParLAdmin = (quoi: string) => (): Promise<never> =>
  Promise.reject(new Error(`${quoi} est géré par l'administrateur du serveur.`));

export function telecharger(file: { name: string; content: string }): string {
  const url = URL.createObjectURL(new Blob([file.content], { type: "application/octet-stream" }));
  const lien = Object.assign(document.createElement("a"), { href: url, download: file.name });
  lien.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return file.name;
}

const parametres = (filtre: DocumentFilter): string => {
  const p = new URLSearchParams();
  if (filtre.pluginId) p.set("plugin", filtre.pluginId);
  if (filtre.appId) p.set("app", filtre.appId);
  if (filtre.limit) p.set("limite", String(filtre.limit));
  const texte = p.toString();
  return texte ? `?${texte}` : "";
};

/**
 * Origine dédiée aux plugins, si le serveur en annonce une VRAIMENT différente de celle de l'application et du serveur.
 * Sinon `undefined` : les plugins restent servis par le serveur dans un cadre à origine opaque (en ligne seulement).
 */
export function originePluginsSure(urlPlugins: string | undefined, client: ClientApi, pageOrigin: string | undefined = typeof location === "undefined" ? undefined : location.origin): string | undefined {
  if (!urlPlugins) return undefined;
  try {
    const origine = new URL(urlPlugins).origin;
    const serveur = client.base ? new URL(client.base).origin : pageOrigin;
    if ((origine === serveur || origine === pageOrigin) || !/^https?:$/.test(new URL(urlPlugins).protocol)) return undefined;
    return origine;
  } catch {
    return undefined;
  }
}

export function creerFondServeur(client: ClientApi, urlPlugins?: string): Fond {
  const origine = originePluginsSure(urlPlugins, client);
  return {
    id: "serveur",
    // Sans origine dédiée : plugins en cadre à origine opaque (isolation complète, en ligne seulement). Avec elle :
    // le cadre garde son origine, qui n'est ni celle de l'application ni celle du serveur, et le service worker de
    // cette origine rend les mini-apps utilisables hors ligne.
    capacites: { catalogue: false, miseAJour: false, fenetresNatives: false, isolationComplete: !origine, journal: false },
    urlPlugins: origine ? `${origine}/plugins` : `${client.base}/plugins`,
    originePlugins: origine,

    pluginsList: () => client.requete<PluginInfo[]>("GET", "/api/plugins"),
    catalogueRead: gereParLAdmin("Le catalogue"),
    pluginInstall: gereParLAdmin("L'installation de plugins"),
    pluginInstallFile: gereParLAdmin("L'installation de plugins"),
    pluginUninstall: gereParLAdmin("La désinstallation de plugins"),
    onPluginsChanged: () => Promise.resolve(() => {}),
    onInstallProgress: () => Promise.resolve(() => {}),

    documentsList: (filtre: DocumentFilter = {}) => client.requete<DocumentMeta[]>("GET", `/api/documents${parametres(filtre)}`),
    documentRead: (id) => client.requete<DocumentFile>("GET", `/api/documents/${encodeURIComponent(id)}`),
    documentSave: (document: DocumentInput) => client.requete<DocumentMeta>("PUT", "/api/documents", document),
    documentDelete: (id) => client.requete<void>("DELETE", `/api/documents/${encodeURIComponent(id)}`),

    storeLoad: () => client.requete<Record<string, unknown>>("GET", "/api/reglages"),
    storeSave: (valeur) => client.requete<void>("PUT", "/api/reglages", valeur),

    saveFile: (file) => Promise.resolve(telecharger(file)),

    dataRead: async (nom) => (await client.requete<unknown>("GET", `/api/donnees/${encodeURIComponent(nom)}`)) ?? null,
    dataWrite: async (nom, valeur) => {
      await client.requete("PUT", `/api/donnees/${encodeURIComponent(nom)}`, valeur);
    },
  };
}
