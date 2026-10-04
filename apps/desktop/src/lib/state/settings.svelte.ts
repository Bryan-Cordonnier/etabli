import { revoques } from "$lib/plugins/revoques.svelte";
import { load, save } from "$lib/storage";
import { SYSTEM_THEME, type Theme } from "$lib/themes";

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 300;
export const TEXT_SCALES = [0.9, 1, 1.1, 1.2, 1.3] as const;

export interface Shortcut {
  /**
   * Raccourci de l'aperçu rapide : format compris par Windows (via Tauri), « Ctrl+Alt+Space ».
   * Raccourci dans l'application : « Ctrl+Shift+KeyT » (voir `matchesShortcut` du SDK).
   */
  accelerator: string;
  /** Affichage en français : « Ctrl + Alt + Espace ». */
  label: string;
}

/** Ctrl+Alt+Espace est déjà pris par d'autres applications (Claude, par exemple). */
export const DEFAULT_SHORTCUT: Shortcut = { accelerator: "Ctrl+Shift+Space", label: "Ctrl + Maj + Espace" };

interface Persisted {
  theme: string;
  customThemes: Theme[];
  reduceMotion: boolean;
  textScale: number;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  /** Mini-apps favorites, sous la forme « plugin/mini-app ». */
  favorites: string[];
  disabledPlugins: string[];
  /** Plugins ramenés à une version précédente à la main : pas de mise à jour automatique avant un clic sur « Mettre à jour ». */
  pinnedPlugins: string[];
  /** Ordre des plugins dans la colonne, choisi par glisser-déposer. */
  pluginOrder: string[];
  /** Raccourci global de l'aperçu rapide (le seul réglé par défaut). */
  quickShortcut: Shortcut;
  /** Raccourcis dans l'application, par action (voir shortcuts.ts). Aucun par défaut. */
  shortcuts: Record<string, Shortcut>;
  closeToTray: boolean;
  /** Nom écrit dans le cartouche des fiches d'atelier (« Préparé : … »). */
  author: string;
  /** Chercher une nouvelle version sur GitHub au démarrage. */
  checkUpdates: boolean;
  /**
   * Passage au catalogue fait : les plugins livrés avec les versions 0.1.x ont été réinstallés
   * depuis le catalogue (ou il n'y avait rien à réinstaller).
   */
  catalogueMigrated: boolean;
  /**
   * Fournisseurs et machines saisis avant les plugins qui les portent : repris dans les plugins
   * Fournisseurs et Machines (ou il n'y avait rien à reprendre).
   */
  librariesMigrated: boolean;
}

const DEFAULTS: Persisted = {
  theme: SYSTEM_THEME,
  customThemes: [],
  reduceMotion: false,
  textScale: 1,
  sidebarCollapsed: false,
  sidebarWidth: 232,
  favorites: ["maths/pythagore", "economie/debit-tubes", "materiaux/masse", "materiaux/taraudage"],
  disabledPlugins: [],
  pinnedPlugins: [],
  pluginOrder: [],
  quickShortcut: DEFAULT_SHORTCUT,
  shortcuts: {},
  closeToTray: true,
  author: "",
  checkUpdates: true,
  catalogueMigrated: false,
  librariesMigrated: false,
};

class Settings {
  theme = $state(DEFAULTS.theme);
  customThemes = $state<Theme[]>([]);
  reduceMotion = $state(DEFAULTS.reduceMotion);
  textScale = $state(DEFAULTS.textScale);
  sidebarCollapsed = $state(DEFAULTS.sidebarCollapsed);
  sidebarWidth = $state(DEFAULTS.sidebarWidth);
  favorites = $state<string[]>([]);
  disabledPlugins = $state<string[]>([]);
  pinnedPlugins = $state<string[]>([]);
  pluginOrder = $state<string[]>([]);
  quickShortcut = $state<Shortcut>(DEFAULTS.quickShortcut);
  shortcuts = $state<Record<string, Shortcut>>({});
  closeToTray = $state(DEFAULTS.closeToTray);
  author = $state(DEFAULTS.author);
  checkUpdates = $state(DEFAULTS.checkUpdates);
  catalogueMigrated = $state(DEFAULTS.catalogueMigrated);
  librariesMigrated = $state(DEFAULTS.librariesMigrated);

  constructor() {
    this.reload();
  }

  /** Relit les réglages enregistrés (l'aperçu rapide le fait à chaque ouverture). */
  reload(): void {
    const saved = { ...DEFAULTS, ...load<Partial<Persisted>>("settings", {}) };
    this.theme = saved.theme;
    this.customThemes = saved.customThemes;
    this.reduceMotion = saved.reduceMotion;
    this.textScale = saved.textScale;
    this.sidebarCollapsed = saved.sidebarCollapsed;
    this.sidebarWidth = saved.sidebarWidth;
    this.favorites = saved.favorites;
    this.disabledPlugins = saved.disabledPlugins;
    this.pinnedPlugins = Array.isArray(saved.pinnedPlugins) ? saved.pinnedPlugins : [];
    this.pluginOrder = saved.pluginOrder;
    this.quickShortcut = saved.quickShortcut;
    this.shortcuts = saved.shortcuts;
    this.closeToTray = saved.closeToTray;
    this.author = saved.author;
    this.checkUpdates = saved.checkUpdates;
    this.catalogueMigrated = saved.catalogueMigrated;
    this.librariesMigrated = saved.librariesMigrated;
  }

  #save(): void {
    save("settings", {
      theme: this.theme,
      customThemes: $state.snapshot(this.customThemes),
      reduceMotion: this.reduceMotion,
      textScale: this.textScale,
      sidebarCollapsed: this.sidebarCollapsed,
      sidebarWidth: this.sidebarWidth,
      favorites: $state.snapshot(this.favorites),
      disabledPlugins: $state.snapshot(this.disabledPlugins),
      pinnedPlugins: $state.snapshot(this.pinnedPlugins),
      pluginOrder: $state.snapshot(this.pluginOrder),
      quickShortcut: $state.snapshot(this.quickShortcut),
      shortcuts: $state.snapshot(this.shortcuts),
      closeToTray: this.closeToTray,
      author: this.author,
      checkUpdates: this.checkUpdates,
      catalogueMigrated: this.catalogueMigrated,
      librariesMigrated: this.librariesMigrated,
    } satisfies Persisted);
  }

  /** Modifie un réglage simple et l'enregistre. */
  set<K extends "theme" | "reduceMotion" | "textScale" | "closeToTray" | "quickShortcut" | "author" | "checkUpdates" | "catalogueMigrated" | "librariesMigrated">(
    key: K,
    value: Settings[K],
  ): void {
    (this as Settings)[key] = value;
    this.#save();
  }

  /** Règle (ou, avec `null`, efface) le raccourci d'une action de l'application. */
  setShortcut(actionId: string, shortcut: Shortcut | null): void {
    const next = { ...this.shortcuts };
    if (shortcut) next[actionId] = shortcut;
    else delete next[actionId];
    this.shortcuts = next;
    this.#save();
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.#save();
  }

  /** Pendant le glissement, on n'écrit pas à chaque pixel : `persist` à la fin seulement. */
  setSidebarWidth(width: number, persist = true): void {
    this.sidebarWidth = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)));
    if (persist) this.#save();
  }

  isFavorite(key: string): boolean {
    return this.favorites.includes(key);
  }

  toggleFavorite(key: string): void {
    this.favorites = this.isFavorite(key) ? this.favorites.filter((k) => k !== key) : [...this.favorites, key];
    this.#save();
  }

  /** Déplace un favori d'un cran (ordre de la grille de l'aperçu rapide). */
  moveFavorite(key: string, delta: -1 | 1): void {
    const list = [...this.favorites];
    const from = list.indexOf(key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to]!, list[from]!];
    this.favorites = list;
    this.#save();
  }

  /** Activé par l'utilisateur et non révoqué : un plugin révoqué (docs/20) est traité comme désactivé. */
  isPluginEnabled(id: string): boolean {
    return !this.disabledPlugins.includes(id) && !(id in revoques);
  }

  togglePlugin(id: string): void {
    this.disabledPlugins = this.disabledPlugins.includes(id)
      ? this.disabledPlugins.filter((p) => p !== id)
      : [...this.disabledPlugins, id];
    this.#save();
  }

  isPinned(id: string): boolean {
    return this.pinnedPlugins.includes(id);
  }

  setPinned(id: string, pinned: boolean): void {
    if (this.isPinned(id) === pinned) return;
    this.pinnedPlugins = pinned ? [...this.pinnedPlugins, id] : this.pinnedPlugins.filter((p) => p !== id);
    this.#save();
  }

  setPluginOrder(ids: string[], persist = true): void {
    this.pluginOrder = ids;
    if (persist) this.#save();
  }

  /** Ajoute ou remplace un thème importé, puis l'applique. */
  addTheme(theme: Theme): void {
    this.customThemes = [...this.customThemes.filter((t) => t.id !== theme.id), theme];
    this.theme = theme.id;
    this.#save();
  }

  removeTheme(id: string): void {
    this.customThemes = this.customThemes.filter((t) => t.id !== id);
    if (this.theme === id) this.theme = SYSTEM_THEME;
    this.#save();
  }
}

export const settings = new Settings();
