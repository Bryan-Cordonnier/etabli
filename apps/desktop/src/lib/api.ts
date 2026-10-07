// Appels au cœur Rust. Hors de Tauri (aperçu dans un navigateur pendant le développement),
// les documents sont gardés dans le navigateur avec le même comportement, pour tester l'interface.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { estBureau } from "./plateforme";
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
  /** Une adresse de mises à jour est configurée : sinon (distribution sans publications) on n'en cherche pas. */
  miseAJour: boolean;
}

/** Fenêtres, raccourci global, démarrage avec Windows, liens. */
export const system = {
  toggleQuick: (): Promise<void> => (estBureau ? invoke("apercu_basculer") : Promise.resolve()),
  closeQuick: (): Promise<void> => (estBureau ? invoke("apercu_fermer") : Promise.resolve()),
  showMain: (): Promise<void> => (estBureau ? invoke("etabli_afficher") : Promise.resolve()),

  setShortcut: (accelerator: string): Promise<void> =>
    estBureau ? invoke("raccourci_definir", { accelerator }) : Promise.resolve(),
  shortcutStatus: (): Promise<ShortcutStatus> =>
    estBureau ? invoke("raccourci_etat") : Promise.resolve({ accelerator: null, erreur: null }),

  appInfo: (): Promise<AppInfo> =>
    inTauri
      ? invoke("infos_app")
      : Promise.resolve({ version: "0.1.0", documents: "(aperçu navigateur)", config: "(aperçu navigateur)", miseAJour: false }),

  setCloseToTray: (active: boolean): Promise<void> =>
    estBureau ? invoke("fermeture_zone_definir", { active }) : Promise.resolve(),

  autostartEnabled: (): Promise<boolean> => (estBureau ? isEnabled() : Promise.resolve(false)),
  setAutostart: (active: boolean): Promise<void> =>
    estBureau ? (active ? enable() : disable()) : Promise.resolve(),

  openUrl: (url: string): Promise<void> => (inTauri ? openUrl(url) : Promise.resolve(void window.open(url))),
  reveal: (path: string): Promise<void> => (estBureau ? revealItemInDir(path) : Promise.resolve()),

  /** Taille du texte : zoom de toute la fenêtre, mini-apps comprises. */
  setZoom: (factor: number): Promise<void> => {
    if (inTauri) return getCurrentWebview().setZoom(factor).catch(() => undefined);
    document.documentElement.style.zoom = String(factor);
    return Promise.resolve();
  },

  /** L'aperçu rapide demande à la fenêtre principale d'ouvrir un calcul dans un onglet. */
  openInMain: (view: AppView): Promise<void> => (inTauri ? emitTo("main", "etabli:ouvrir", view) : Promise.resolve()),
  onOpenRequest: (handler: (view: AppView) => void): Promise<() => void> =>
    inTauri ? listen<AppView>("etabli:ouvrir", (event) => handler(event.payload)) : Promise.resolve(() => {}),
  /** Une mini-app de l'aperçu rapide envoie des données à une autre : la fenêtre principale l'ouvre. */
  requestSend: (request: { kind: string; data: unknown; from: string }): Promise<void> =>
    inTauri ? emitTo("main", "etabli:envoyer", request) : Promise.resolve(),
  onSendRequest: (handler: (request: { kind: string; data: unknown; from: string }) => void): Promise<() => void> =>
    inTauri ? listen<{ kind: string; data: unknown; from: string }>("etabli:envoyer", (event) => handler(event.payload)) : Promise.resolve(() => {}),
  /** Une mini-app de l'aperçu rapide demande la page de réglages d'un plugin : la fenêtre principale l'ouvre. */
  requestSettings: (request: { plugin: string; hash?: string }): Promise<void> =>
    inTauri ? emitTo("main", "etabli:reglages", request) : Promise.resolve(),
  onSettingsRequest: (handler: (request: { plugin: string; hash?: string }) => void): Promise<() => void> =>
    inTauri
      ? listen<{ plugin: string; hash?: string }>("etabli:reglages", (event) => handler(event.payload))
      : Promise.resolve(() => {}),
  onQuickOpened: (handler: () => void): Promise<() => void> =>
    inTauri ? listen("apercu:ouvert", () => handler()) : Promise.resolve(() => {}),
  /** Le raccourci a été pressé alors que l'aperçu était ouvert : il doit se fermer. */
  onQuickCloseRequest: (handler: () => void): Promise<() => void> =>
    inTauri ? listen("apercu:fermer", () => handler()) : Promise.resolve(() => {}),
};

// Les types de documents et de plugins, et l'objet `api` (stockage, plugins), vivent dans `./fond`.
export * from "./fond/types";
export { fond as api, clientServeur, fondServeur } from "./fond";
