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
  matchesShortcut,
  type ColorScheme,
  type DocumentSnapshot,
  type FichePrint,
  type HostToPlugin,
  type Incoming,
  type Libraries,
  type MachineKind,
  type PluginToHost,
  type SavedFile,
  type ServiceSnapshot,
  type Services,
  type ThemeTokens,
} from "./protocol";

export { SAW_TYPES, STOCK_KINDS } from "./protocol";
export type {
  ColorScheme,
  DocumentSnapshot,
  FichePrint,
  FournisseursData,
  Incoming,
  Libraries,
  Machine,
  MachineKind,
  MachinesData,
  SavedFile,
  Saw,
  SawType,
  ServiceSnapshot,
  Services,
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
  /**
   * Fournisseurs et machines, en lecture seule : ils viennent des plugins Fournisseurs et Machines et
   * sont vides si votre plugin ne les déclare pas en dépendance, ou s'ils ne sont pas installés.
   * Raccourci pour `services` : préférez `services` pour les autres plugins.
   */
  readonly libraries: {
    readonly current: Libraries;
    onChange(listener: (libraries: Libraries) => void): () => void;
    /** Ouvre la page de réglages du plugin Machines sur une nouvelle machine ; elle arrive ensuite par `onChange`. */
    addMachine(kind: MachineKind): void;
  };
  /**
   * Données publiées par les plugins dont le vôtre dépend (`dependencies`, `optionalDependencies`),
   * en lecture seule, et publication des vôtres (`provides` dans le manifeste).
   */
  readonly services: {
    /** Tous les services disponibles, par nom. */
    readonly current: Services;
    /** Un service, ou `null` si son plugin n'est pas installé, pas déclaré en dépendance ou désactivé. */
    get<T = unknown>(name: string): ServiceSnapshot<T> | null;
    /** Appelé quand un service change (ou apparaît, ou disparaît). */
    onChange(listener: (services: Services) => void): () => void;
    /** Publie les données du service `name`, à déclarer dans `provides`. Réservé à leur fournisseur. */
    provide(name: string, data: unknown): void;
  };
  /** Ouvre la page de réglages d'un autre plugin (`hash` : intention transmise à sa page, « add=scie »). */
  openSettings(plugin: string, hash?: string): void;
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
  /** Envoie des données à une autre mini-app (voir `Incoming`), ouverte dans un nouvel onglet. */
  send(kind: string, data: unknown): void;
  /** Enregistre un fichier (DXF, CSV…) : boîte « Enregistrer sous » de Windows, puis écriture. */
  saveFile(file: SavedFile): void;
  /** Données reçues d'une autre mini-app à l'ouverture, ou `null`. */
  readonly incoming: Incoming | null;
  /** Appelé quand l'utilisateur change de thème. Renvoie une fonction pour se désabonner. */
  onThemeChange(listener: (theme: ThemeTokens, scheme: ColorScheme) => void): () => void;
}

let connection: Promise<Etabli<unknown>> | undefined;

/** Attend que le moteur se connecte à la mini-app. À appeler une seule fois, au démarrage. */
export function connect<T>(): Promise<Etabli<T>> {
  connection ??= new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      const port = event.ports[0];
      // Seul le moteur (la fenêtre parente) peut établir la liaison : une mini-app voisine ne s'interpose pas.
      if (event.source !== window.parent) return;
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
  const serviceListeners = new Set<(services: Services) => void>();
  const settingsListeners = new Set<(data: unknown) => void>();
  let doc: DocumentSnapshot = { id: null, title: "", data: null };
  let ids = { pluginId: "", appId: "" };
  let libraries: Libraries = { suppliers: [], machines: [] };
  let services: Services = {};
  let pluginData: unknown = null;
  let incoming: Incoming | null = null;
  let shortcuts: string[] = [];

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
        send({ type: "openSettings", plugin: "machines", hash: `add=${kind}` });
      },
    },
    services: {
      get current() {
        return services;
      },
      get<T>(name: string) {
        return (services[name] as ServiceSnapshot<T> | undefined) ?? null;
      },
      onChange(listener) {
        serviceListeners.add(listener);
        return () => serviceListeners.delete(listener);
      },
      provide(name, data) {
        // Copie JSON : le service doit de toute façon être enregistrable, et passer entre cadres.
        send({ type: "provide", name, data: JSON.parse(JSON.stringify(data)) });
      },
    },
    openSettings(plugin, hash) {
      send({ type: "openSettings", plugin, hash });
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
    send(kind, data) {
      send({ type: "send", kind, data: JSON.parse(JSON.stringify(data)) });
    },
    saveFile(file) {
      send({ type: "saveFile", file: { ...file } });
    },
    get incoming() {
      return incoming;
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
        services = message.services ?? {};
        pluginData = message.pluginData ?? null;
        incoming = message.incoming ?? null;
        shortcuts = message.shortcuts ?? [];
        applyTheme(message.theme, message.colorScheme);
        resolve(api);
        signalReady(send);
        break;
      case "theme":
        applyTheme(message.theme, message.colorScheme);
        for (const listener of themeListeners) listener(message.theme, message.colorScheme);
        break;
      case "libraries":
        libraries = message.libraries;
        for (const listener of libraryListeners) listener(libraries);
        break;
      case "services":
        services = message.services;
        for (const listener of serviceListeners) listener(services);
        break;
      case "pluginData":
        pluginData = message.data;
        for (const listener of settingsListeners) listener(pluginData);
        break;
      case "shortcuts":
        shortcuts = message.shortcuts;
        break;
    }
  };

  reportHeight(send);
  forwardShortcuts(send, () => shortcuts);
}

/**
 * Deux images après `init`, la mini-app a reçu ses données et s'est dessinée avec les couleurs du
 * moteur : le moteur peut montrer le cadre, jusque-là invisible (pas de flash blanc). Si les images
 * sont ralenties (fenêtre cachée, PC chargé), le message part quand même au bout de 150 ms.
 */
function signalReady(send: (message: PluginToHost) => void): void {
  let sent = false;
  const ready = () => {
    if (sent) return;
    sent = true;
    send({ type: "ready" });
  };
  requestAnimationFrame(() => requestAnimationFrame(ready));
  setTimeout(ready, 150);
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

function forwardShortcuts(send: (message: PluginToHost) => void, getShortcuts: () => string[]): void {
  window.addEventListener("keydown", (event) => {
    // Échap : l'aperçu rapide s'en sert pour revenir en arrière. La mini-app peut aussi l'utiliser.
    if (event.key === "Escape" && !event.defaultPrevented) {
      send({ type: "shortcut", key: "Escape", code: "Escape", ctrl: false, shift: false, alt: false });
      return;
    }
    // Seuls les raccourcis réglés par l'utilisateur dans le moteur remontent : le reste du clavier
    // appartient à la mini-app.
    if (!matchesShortcut(event, getShortcuts())) return;
    event.preventDefault();
    send({
      type: "shortcut",
      key: event.key,
      code: event.code,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
    });
  });
}
