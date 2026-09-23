// Thèmes : chaque thème redéfinit les variables CSS de app.css (cahier des charges, section 4).
// « Comme Windows » n'applique rien : app.css suit alors prefers-color-scheme.

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

export const SYSTEM_THEME = "systeme";

export const THEMES: Theme[] = [
  {
    id: "clair",
    name: "Clair",
    author: "Intégré",
    base: "light",
    colors: {
      page: "#e8ebef",
      surface: "#ffffff",
      "surface-2": "#f7f8fa",
      field: "#f1f3f6",
      border: "#e3e7ec",
      text: "#141b24",
      muted: "#5b6776",
      faint: "#8b96a3",
      accent: "#2b63d9",
      "accent-soft": "#e8effd",
      "accent-text": "#ffffff",
      scrim: "rgba(232, 235, 239, 0.45)",
    },
  },
  {
    id: "sombre",
    name: "Sombre",
    author: "Intégré",
    base: "dark",
    colors: {
      page: "#0a0e13",
      surface: "#161c24",
      "surface-2": "#1b222c",
      field: "#232c37",
      border: "#2a3441",
      text: "#e6ebf1",
      muted: "#9aa7b5",
      faint: "#6d7a88",
      accent: "#5b8def",
      "accent-soft": "#1d2b45",
      "accent-text": "#0b1220",
      scrim: "rgba(10, 14, 19, 0.5)",
    },
  },
  {
    id: "atelier",
    name: "Atelier",
    author: "Exemple de thème communautaire",
    base: "dark",
    colors: {
      page: "#100f0e",
      surface: "#1c1a18",
      "surface-2": "#221f1c",
      field: "#2b2724",
      border: "#36312c",
      text: "#ede8e2",
      muted: "#a89f95",
      faint: "#7a7168",
      accent: "#f08a3c",
      "accent-soft": "#3a2a1d",
      "accent-text": "#1a120b",
      scrim: "rgba(16, 15, 14, 0.5)",
    },
  },
  {
    id: "papier",
    name: "Papier",
    author: "Exemple de thème communautaire",
    base: "light",
    colors: {
      page: "#e6e4df",
      surface: "#ffffff",
      "surface-2": "#f6f5f2",
      field: "#efede8",
      border: "#e2dfd8",
      text: "#1d1b18",
      muted: "#6a655d",
      faint: "#9a948a",
      accent: "#0f766e",
      "accent-soft": "#ddf1ee",
      "accent-text": "#ffffff",
      scrim: "rgba(230, 228, 223, 0.45)",
    },
  },
];

export function applyTheme(id: string): void {
  const root = document.documentElement;
  for (const token of THEME_TOKENS) root.style.removeProperty(`--${token}`);
  root.style.removeProperty("color-scheme");

  const theme = THEMES.find((t) => t.id === id);
  if (!theme) return;
  for (const [token, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${token}`, value);
  }
  root.style.setProperty("color-scheme", theme.base);
}
