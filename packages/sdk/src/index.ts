// @etabli/sdk — ce qu'une mini-app utilise pour dialoguer avec le moteur Établi.
//
//   import { connect } from "@etabli/sdk";
//   import "@etabli/sdk/base.css";
//
//   const etabli = await connect<{ a: string }>();
//   etabli.document.data;               // données enregistrées, ou null pour un nouveau calcul
//   etabli.document.update({ a: "12" }); // enregistré automatiquement par le moteur
//   etabli.document.setSummary("c = 13 mm");

import {
  CONNECT,
  isHostShortcut,
  type ColorScheme,
  type DocumentSnapshot,
  type FichePrint,
  type HostToPlugin,
  type Libraries,
  type MachineKind,
  type PluginToHost,
  type ThemeTokens,
} from "./protocol";

export { SAW_TYPES, STOCK_KINDS } from "./protocol";
export type {
  ColorScheme,
  DocumentSnapshot,
  FichePrint,
  Libraries,
  Machine,
  MachineKind,
  Saw,
  SawType,
  Shear,
  StockKind,
  Supplier,
  SupplierItem,
  ThemeTokens,
} from "./protocol";

export interface EtabliDocument<T> {
  /** `null` tant que rien n'a été enregistré. */
  readonly id: string | null;
  readonly title: string;
  /** Données enregistrées, ou `null` pour un nouveau calcul. */
  readonly data: T | null;
  /** Remplace les données ; le moteur enregistre automatiquement une seconde plus tard. */
  update(data: T): void;
  setTitle(title: string): void;
  /** Résumé du résultat, affiché dans la liste des anciens calculs (« c = 372,95 mm »). */
  setSummary(summary: string): void;
}

export interface Etabli<T> {
  readonly pluginId: string;
  readonly appId: string;
  readonly document: EtabliDocument<T>;
  readonly ui: {
    /** Notification brève en bas à droite de l'application. */
    notify(text: string): void;
  };
  readonly clipboard: {
    /** Copie un texte et affiche une confirmation. */
    copy(text: string): Promise<void>;
  };
  /** Bibliothèques de l'application (fournisseurs…), en lecture seule. Vides si l'utilisateur n'a rien saisi. */
  readonly libraries: {
    readonly current: Libraries;
    onChange(listener: (libraries: Libraries) => void): () => void;
    /** Ouvre Paramètres → Bibliothèques sur une nouvelle machine à régler ; elle arrive ensuite par `onChange`. */
    addMachine(kind: MachineKind): void;
  };
  /** Réglages du plugin (machines de l'atelier…), partagés par toutes ses mini-apps et enregistrés par le moteur. */
  readonly settings: {
    /** `null` tant que le plugin n'a rien enregistré. */
    readonly data: unknown;
    update(data: unknown): void;
    /** Réglages modifiés par une autre mini-app du même plugin. */
    onChange(listener: (data: unknown) => void): () => void;
  };
  /** Imprime une fiche d'atelier (A4, ou PDF avec l'imprimante « Enregistrer au format PDF »). */
  print(fiche: FichePrint): void;
  /** Appelé quand l'utilisateur change de thème. Renvoie une fonction pour se désabonner. */
  onThemeChange(listener: (theme: ThemeTokens, scheme: ColorScheme) => void): () => void;
}

let connection: Promise<Etabli<unknown>> | undefined;

/** Attend que le moteur se connecte à la mini-app. À appeler une seule fois, au démarrage. */
export function connect<T>(): Promise<Etabli<T>> {
  connection ??= new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      const port = event.ports[0];
      if (event.data?.type !== CONNECT || !port) return;
      window.removeEventListener("message", onMessage);
      start(port, resolve);
    };
    window.addEventListener("message", onMessage);
  });
  return connection as Promise<Etabli<T>>;
}

function start(port: MessagePort, resolve: (api: Etabli<unknown>) => void): void {
  const send = (message: PluginToHost) => port.postMessage(message);
  const themeListeners = new Set<(theme: ThemeTokens, scheme: ColorScheme) => void>();
  const libraryListeners = new Set<(libraries: Libraries) => void>();
  const settingsListeners = new Set<(data: unknown) => void>();
  let doc: DocumentSnapshot = { id: null, title: "", data: null };
  let ids = { pluginId: "", appId: "" };
  let libraries: Libraries = { suppliers: [], machines: [] };
  let pluginData: unknown = null;

  const api: Etabli<unknown> = {
    get pluginId() {
      return ids.pluginId;
    },
    get appId() {
      return ids.appId;
    },
    document: {
      get id() {
        return doc.id;
      },
      get title() {
        return doc.title;
      },
      get data() {
        return doc.data;
      },
      update(data) {
        // Copie JSON : les objets réactifs (Svelte, Vue…) ne passent pas entre cadres,
        // et le document doit de toute façon être enregistrable en JSON.
        const plain: unknown = JSON.parse(JSON.stringify(data));
        doc = { ...doc, data: plain };
        send({ type: "update", data: plain });
      },
      setTitle(title) {
        doc = { ...doc, title };
        send({ type: "title", title });
      },
      setSummary(summary) {
        send({ type: "summary", summary });
      },
    },
    ui: {
      notify: (text) => send({ type: "notify", text }),
    },
    clipboard: {
      async copy(text) {
        try {
          await navigator.clipboard.writeText(text);
          send({ type: "notify", text: `Copié : ${text}` });
        } catch {
          // Le cadre n'a pas accès au presse-papiers : le moteur s'en charge.
          send({ type: "copy", text });
        }
      },
    },
    libraries: {
      get current() {
        return libraries;
      },
      onChange(listener) {
        libraryListeners.add(listener);
        return () => libraryListeners.delete(listener);
      },
      addMachine(kind) {
        send({ type: "addMachine", kind });
      },
    },
    settings: {
      get data() {
        return pluginData;
      },
      update(data) {
        pluginData = JSON.parse(JSON.stringify(data));
        send({ type: "pluginData", data: pluginData });
      },
      onChange(listener) {
        settingsListeners.add(listener);
        return () => settingsListeners.delete(listener);
      },
    },
    print(fiche) {
      send({ type: "print", fiche: JSON.parse(JSON.stringify(fiche)) });
    },
    onThemeChange(listener) {
      themeListeners.add(listener);
      return () => themeListeners.delete(listener);
    },
  };

  port.onmessage = (event: MessageEvent<HostToPlugin>) => {
    const message = event.data;
    switch (message.type) {
      case "init":
        ids = { pluginId: message.pluginId, appId: message.appId };
        doc = message.document;
        // Un moteur plus ancien peut ne pas envoyer toutes les bibliothèques.
        libraries = {
          suppliers: message.libraries?.suppliers ?? [],
          machines: message.libraries?.machines ?? [],
        };
        pluginData = message.pluginData ?? null;
        applyTheme(message.theme, message.colorScheme);
        resolve(api);
        break;
      case "theme":
        applyTheme(message.theme, message.colorScheme);
        for (const listener of themeListeners) listener(message.theme, message.colorScheme);
        break;
      case "libraries":
        libraries = message.libraries;
        for (const listener of libraryListeners) listener(libraries);
        break;
      case "pluginData":
        pluginData = message.data;
        for (const listener of settingsListeners) listener(pluginData);
        break;
    }
  };

  reportHeight(send);
  forwardShortcuts(send);
}

/** Applique les couleurs du moteur sous forme de variables CSS (`var(--accent)`…). */
function applyTheme(theme: ThemeTokens, scheme: ColorScheme): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(theme)) root.style.setProperty(`--${name}`, value);
  root.style.colorScheme = scheme;
}

/** Le moteur ajuste la hauteur du cadre au contenu : pas de double barre de défilement. */
function reportHeight(send: (message: PluginToHost) => void): void {
  let last = 0;
  const measure = () => {
    const height = Math.ceil(document.documentElement.scrollHeight);
    if (height !== last) {
      last = height;
      send({ type: "height", value: height });
    }
  };
  new ResizeObserver(measure).observe(document.documentElement);
  measure();
}

function forwardShortcuts(send: (message: PluginToHost) => void): void {
  window.addEventListener("keydown", (event) => {
    // Échap : l'aperçu rapide s'en sert pour revenir en arrière. La mini-app peut aussi l'utiliser.
    if (event.key === "Escape" && !event.defaultPrevented) {
      send({ type: "shortcut", key: "Escape", ctrl: false, shift: false, alt: false });
      return;
    }
    if (!isHostShortcut(event)) return;
    event.preventDefault();
    send({ type: "shortcut", key: event.key, ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey });
  });
}
