import { load, save } from "$lib/storage";
import { SYSTEM_THEME } from "$lib/themes";

export type IconStyle = "couleur" | "emoji";

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 300;

interface Persisted {
  theme: string;
  iconStyle: IconStyle;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  /** Mini-apps favorites, sous la forme « plugin/mini-app ». */
  favorites: string[];
  disabledPlugins: string[];
}

const DEFAULTS: Persisted = {
  theme: SYSTEM_THEME,
  iconStyle: "couleur",
  sidebarCollapsed: false,
  sidebarWidth: 232,
  favorites: ["maths/pythagore", "economie/debit-tubes", "materiaux/masse", "materiaux/taraudage"],
  disabledPlugins: [],
};

class Settings {
  theme = $state(DEFAULTS.theme);
  iconStyle = $state<IconStyle>(DEFAULTS.iconStyle);
  sidebarCollapsed = $state(DEFAULTS.sidebarCollapsed);
  sidebarWidth = $state(DEFAULTS.sidebarWidth);
  favorites = $state<string[]>([]);
  disabledPlugins = $state<string[]>([]);

  constructor() {
    const saved = { ...DEFAULTS, ...load<Partial<Persisted>>("settings", {}) };
    this.theme = saved.theme;
    this.iconStyle = saved.iconStyle;
    this.sidebarCollapsed = saved.sidebarCollapsed;
    this.sidebarWidth = saved.sidebarWidth;
    this.favorites = saved.favorites;
    this.disabledPlugins = saved.disabledPlugins;
  }

  #save(): void {
    save("settings", {
      theme: this.theme,
      iconStyle: this.iconStyle,
      sidebarCollapsed: this.sidebarCollapsed,
      sidebarWidth: this.sidebarWidth,
      favorites: $state.snapshot(this.favorites),
      disabledPlugins: $state.snapshot(this.disabledPlugins),
    } satisfies Persisted);
  }

  setTheme(id: string): void {
    this.theme = id;
    this.#save();
  }

  setIconStyle(style: IconStyle): void {
    this.iconStyle = style;
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

  isPluginEnabled(id: string): boolean {
    return !this.disabledPlugins.includes(id);
  }

  togglePlugin(id: string): void {
    this.disabledPlugins = this.isPluginEnabled(id)
      ? [...this.disabledPlugins, id]
      : this.disabledPlugins.filter((p) => p !== id);
    this.#save();
  }
}

export const settings = new Settings();
