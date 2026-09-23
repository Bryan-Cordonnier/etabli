// Raccourcis clavier de la section 5.3 du cahier des charges. Appelés par la fenêtre principale,
// et par les mini-apps qui les transmettent (le clavier y est capturé par leur cadre).
import { settings } from "./state/settings.svelte";
import { tabs } from "./state/tabs.svelte";
import { ui } from "./state/ui.svelte";

export interface ShortcutKey {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

/** Renvoie vrai si la touche a été traitée. */
export function handleShortcut({ key, ctrl, shift, alt }: ShortcutKey): boolean {
  const lower = key.toLowerCase();

  if (ctrl && lower === "k") {
    ui.paletteOpen = !ui.paletteOpen;
    return true;
  }
  if (ui.paletteOpen) return false;

  if (ctrl && shift && lower === "t") tabs.reopenClosed();
  else if (ctrl && lower === "t") tabs.open({ kind: "home" });
  else if (ctrl && lower === "w") tabs.close(tabs.activeId);
  else if (ctrl && key === "Tab") tabs.cycle(shift ? -1 : 1);
  else if (ctrl && /^[1-9]$/.test(key)) tabs.goTo(Number(key));
  else if (ctrl && lower === "b") settings.toggleSidebar();
  else if (alt && key === "ArrowLeft") tabs.back();
  else return false;
  return true;
}
