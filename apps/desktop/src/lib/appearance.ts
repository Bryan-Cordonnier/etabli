// Apparence commune à la fenêtre principale et à l'aperçu rapide : thème, animations, taille du texte.
import { system } from "./api";
import { settings } from "./state/settings.svelte";
import { applyTheme } from "./themes";

export function applyAppearance(): void {
  applyTheme(settings.theme, settings.customThemes);
  document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion);
  void system.setZoom(settings.textScale);
}
