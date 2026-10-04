// Ce que partagent les cadres isolés des plugins : le cadre visible d'une mini-app (MiniAppFrame) et le cadre invisible
// d'un fournisseur de service (ServiceFrame). Même isolement pour les deux : même `sandbox`, mêmes adresses, même garde.
import type { ColorScheme, ThemeTokens } from "@etabli/sdk/protocol";
import { api } from "$lib/api";
import { THEME_TOKENS } from "$lib/themes";

/**
 * Attribut `sandbox` du cadre d'un plugin. Avec une origine propre au plugin (serveur), le cadre peut garder son origine :
 * elle ne contient rien d'autre que ce plugin (c'est ce qui permet à son service worker de le servir hors ligne).
 */
export function sandboxDe(pluginId: string): string {
  return api.originePlugin?.(pluginId) || !api.capacites.isolationComplete ? "allow-scripts allow-same-origin" : "allow-scripts";
}

/** Couleurs du thème courant de l'application, telles que le SDK les applique dans le cadre. */
export function lireTheme(): { theme: ThemeTokens; colorScheme: ColorScheme } {
  const style = getComputedStyle(document.documentElement);
  const theme: ThemeTokens = {};
  for (const token of THEME_TOKENS) theme[token] = style.getPropertyValue(`--${token}`).trim();
  return { theme, colorScheme: style.colorScheme.includes("dark") ? "dark" : "light" };
}
