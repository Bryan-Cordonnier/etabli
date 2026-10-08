// Jetons de couleur et forme d'un thème, à part de themes.ts pour que la configuration de la distribution puisse les lire sans cycle.

/** Variables de couleur d'un thème, transmises aussi aux mini-apps. */
export const THEME_TOKENS = [
  "page",
  "surface",
  "surface-2",
  "field",
  "border",
  "text",
  "muted",
  "faint",
  "accent",
  "accent-soft",
  "accent-text",
  "scrim",
] as const;

export type ThemeColors = Record<(typeof THEME_TOKENS)[number], string>;

export interface Theme {
  id: string;
  name: string;
  author: string;
  base: "light" | "dark";
  colors: ThemeColors;
}
