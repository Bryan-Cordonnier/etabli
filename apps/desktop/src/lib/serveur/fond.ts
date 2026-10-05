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

/** Un identifiant de plugin peut servir de nom d'hôte (63 caractères au plus, sans tiret au début ni à la fin). */
export const idEstHote = (id: string): boolean => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(id);

/**
 * Modèle d'adresse des plugins annoncé par le serveur (`https://{id}.plugins.exemple.fr`), s'il est sûr : une seule
 * variable `{id}` en tête du nom d'hôte, et des origines qui ne sont NI celle de l'application NI celle du serveur
 * (sinon un plugin y retrouverait l'accès à l'application). Sinon `undefined` : les plugins restent servis par le
 * serveur dans un cadre à origine opaque (en ligne seulement).
 */
export function modelePluginsSur(modele: string | undefined, client: ClientApi, pageOrigin: string | undefined = typeof location === "undefined" ? undefined : location.origin): string | undefined {
  if (!modele) return undefined;
  const propre = modele.trim().replace(/\/+$/, "");
  const forme = /^(https?):\/\/\{id\}(\.[a-z0-9.-]+)(:\d{1,5})?$/.exec(propre);
  if (!forme) return undefined;
  const schema = forme[1]!;
  const suffixe = forme[2]!;
  const portModele = forme[3];
  const portDe = (schemaUrl: string, port: string) => port || (schemaUrl === "https:" ? "443" : "80");
  // Vrai si cette origine est l'une de celles que le modèle fabriquerait (un plugin y aurait donc accès à l'application).
  const dansLeModele = (origine: string | undefined): boolean => {
    if (!origine) return false;
    try {
      const u = new URL(origine);
      return (
        u.protocol === `${schema}:` &&
        portDe(u.protocol, u.port) === portDe(`${schema}:`, portModele?.slice(1) ?? "") &&
        u.hostname.endsWith(suffixe) &&
        /^[a-z0-9-]+$/.test(u.hostname.slice(0, -suffixe.length))
      );
    } catch {
      return false;
    }
  };
  const serveur = client.base ? client.base : undefined;
  return dansLeModele(serveur) || dansLeModele(pageOrigin) ? undefined : propre;
}

/** Origine propre à un plugin selon le modèle, ou `undefined` si son identifiant ne peut pas être un nom d'hôte. */
export function originePlugin(modele: string, pluginId: string): string | undefined {
  if (!idEstHote(pluginId)) return undefined;
  try {
    return new URL(modele.replace("{id}", pluginId)).origin;
  } catch {
    return undefined;
  }
}

export function creerFondServeur(client: ClientApi, urlPlugins?: string): Fond {
  const modele = modelePluginsSur(urlPlugins, client);
  return {
    id: "serveur",
    // Chaque plugin a son origine (nom d'hôte propre) quand le serveur en annonce le modèle : le cadre y garde son origine,
    // qui n'est ni celle de l'application ni celle d'un autre plugin, et le service worker de cette origine rend la
    // mini-app utilisable hors ligne. Sinon, cadre à origine opaque servi par le serveur (en ligne seulement).
    capacites: { catalogue: false, miseAJour: false, fenetresNatives: false, isolationComplete: true, journal: false },
    urlPlugins: `${client.base}/plugins`,
    originePlugin: modele ? (id: string) => originePlugin(modele, id) : undefined,

    pluginsList: () => client.requete<PluginInfo[]>("GET", "/api/plugins"),
    catalogueRead: gereParLAdmin("Le catalogue"),
    pluginInstall: gereParLAdmin("L'installation de plugins"),
    pluginInstallFile: gereParLAdmin("L'installation de plugins"),
    pluginUninstall: gereParLAdmin("La désinstallation de plugins"),
    pluginRevert: gereParLAdmin("Le retour à une version précédente"),
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
