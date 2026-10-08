// Apparence commune à la fenêtre principale et à l'aperçu rapide : thème, animations, taille du texte.
import { system } from "./api";
import { distribution } from "./distribution";
import { settings } from "./state/settings.svelte";
import { applyTheme } from "./themes";

let suitWindows = false;

export function applyAppearance(): void {
  // Thèmes fixes : « Comme Windows » choisit le clair ou le sombre, et suit le changement de Windows en direct.
  if (distribution.themes && !suitWindows && typeof matchMedia === "function") {
    suitWindows = true;
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(settings.theme, settings.customThemes));
  }
  applyTheme(settings.theme, settings.customThemes);
  document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion);
  void system.setZoom(settings.textScale);
}
