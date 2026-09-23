import { load, save } from "$lib/storage";
import { SYSTEM_THEME, type Theme } from "$lib/themes";

export type IconStyle = "couleur" | "emoji";

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 300;
export const TEXT_SCALES = [0.9, 1, 1.1, 1.2, 1.3] as const;

export interface QuickShortcut {
  /** Format compris par Windows (via Tauri) : « Ctrl+Alt+Space ». */
  accelerator: string;
  /** Affichage en français : « Ctrl + Alt + Espace ». */
  label: string;
}

/** Ctrl+Alt+Espace est déjà pris par d'autres applications (Claude, par exemple). */
export const DEFAULT_SHORTCUT: QuickShortcut = { accelerator: "Ctrl+Shift+Space", label: "Ctrl + Maj + Espace" };

interface Persisted {
  theme: string;
  customThemes: Theme[];
  iconStyle: IconStyle;
  reduceMotion: boolean;
  textScale: number;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  /** Mini-apps favorites, sous la forme « plugin/mini-app ». */
  favorites: string[];
  disabledPlugins: string[];
  /** Ordre des plugins dans la colonne, choisi par glisser-déposer. */
  pluginOrder: string[];
  quickShortcut: QuickShortcut;
  closeToTray: boolean;
}

const DEFAULTS: Persisted = {
  theme: SYSTEM_THEME,
  customThemes: [],
  iconStyle: "couleur",
  reduceMotion: false,
  textScale: 1,
  sidebarCollapsed: false,
  sidebarWidth: 232,
  favorites: ["maths/pythagore", "economie/debit-tubes", "materiaux/masse", "materiaux/taraudage"],
  disabledPlugins: [],
  pluginOrder: [],
  quickShortcut: DEFAULT_SHORTCUT,
  closeToTray: true,
};

class Settings {
  theme = $state(DEFAULTS.theme);
  customThemes = $state<Theme[]>([]);
  iconStyle = $state<IconStyle>(DEFAULTS.iconStyle);
  reduceMotion = $state(DEFAULTS.reduceMotion);
  textScale = $state(DEFAULTS.textScale);
  sidebarCollapsed = $state(DEFAULTS.sidebarCollapsed);
  sidebarWidth = $state(DEFAULTS.sidebarWidth);
  favorites = $state<string[]>([]);
  disabledPlugins = $state<string[]>([]);
  pluginOrder = $state<string[]>([]);
  quickShortcut = $state<QuickShortcut>(DEFAULTS.quickShortcut);
  closeToTray = $state(DEFAULTS.closeToTray);

  constructor() {
    this.reload();
  }

  /** Relit les réglages enregistrés (l'aperçu rapide le fait à chaque ouverture). */
  reload(): void {
    const saved = { ...DEFAULTS, ...load<Partial<Persisted>>("settings", {}) };
    this.theme = saved.theme;
    this.customThemes = saved.customThemes;
    this.iconStyle = saved.iconStyle;
    this.reduceMotion = saved.reduceMotion;
    this.textScale = saved.textScale;
    this.sidebarCollapsed = saved.sidebarCollapsed;
    this.sidebarWidth = saved.sidebarWidth;
    this.favorites = saved.favorites;
    this.disabledPlugins = saved.disabledPlugins;
    this.pluginOrder = saved.pluginOrder;
    this.quickShortcut = saved.quickShortcut;
    this.closeToTray = saved.closeToTray;
  }

  #save(): void {
    save("settings", {
      theme: this.theme,
      customThemes: $state.snapshot(this.customThemes),
      iconStyle: this.iconStyle,
      reduceMotion: this.reduceMotion,
      textScale: this.textScale,
      sidebarCollapsed: this.sidebarCollapsed,
      sidebarWidth: this.sidebarWidth,
      favorites: $state.snapshot(this.favorites),
      disabledPlugins: $state.snapshot(this.disabledPlugins),
      pluginOrder: $state.snapshot(this.pluginOrder),
      quickShortcut: $state.snapshot(this.quickShortcut),
      closeToTray: this.closeToTray,
    } satisfies Persisted);
  }

  /** Modifie un réglage simple et l'enregistre. */
  set<K extends "theme" | "iconStyle" | "reduceMotion" | "textScale" | "closeToTray" | "quickShortcut">(
    key: K,
    value: Settings[K],
  ): void {
    (this as Settings)[key] = value;
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

  isPluginEnabled(id: string): boolean {
    return !this.disabledPlugins.includes(id);
  }

  togglePlugin(id: string): void {
    this.disabledPlugins = this.isPluginEnabled(id)
      ? [...this.disabledPlugins, id]
      : this.disabledPlugins.filter((p) => p !== id);
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
