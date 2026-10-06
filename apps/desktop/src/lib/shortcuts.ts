// Raccourcis clavier de l'application. Aucun n'est réglé par défaut : l'utilisateur choisit lui-même,
// dans Paramètres → Raccourcis clavier, la combinaison de chaque action.
//
// Un raccourci s'écrit « Ctrl+Alt+Shift+<KeyboardEvent.code> » (voir `matchesShortcut` du SDK) : la touche
// physique, donc la même en AZERTY et en QWERTY. Ils sont appelés par la fenêtre principale, et par les
// mini-apps, dont le cadre isolé capte le clavier et ne transmet que les combinaisons réglées ici.
import { matchesShortcut } from "@etabli/sdk/protocol";
import { settings } from "./state/settings.svelte";
import { tabs } from "./state/tabs.svelte";
import { ui } from "./state/ui.svelte";

export interface ShortcutKey {
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta?: boolean;
}

export interface ShortcutAction {
  id: string;
  label: string;
  group: string;
  run: () => void;
}

const goToTab = (n: number): ShortcutAction => ({
  id: `tab${n}`,
  label: n === 9 ? "Aller au dernier onglet" : `Aller à l'onglet ${n}`,
  group: "Aller à un onglet précis",
  run: () => tabs.goTo(n),
});

export const ACTIONS: ShortcutAction[] = [
  { id: "palette", label: "Ouvrir la recherche (palette de commandes)", group: "Recherche et pages", run: () => (ui.paletteOpen = !ui.paletteOpen) },
  { id: "home", label: "Aller à l'accueil", group: "Recherche et pages", run: () => tabs.navigate({ kind: "home" }) },
  { id: "settings", label: "Ouvrir les paramètres", group: "Recherche et pages", run: () => tabs.navigate({ kind: "settings" }) },
  { id: "plugins", label: "Ouvrir les plugins installés", group: "Recherche et pages", run: () => tabs.navigate({ kind: "plugins" }) },
  { id: "back", label: "Page précédente", group: "Recherche et pages", run: () => tabs.back() },
  { id: "newTab", label: "Nouvel onglet", group: "Onglets", run: () => tabs.newTab() },
  { id: "closeTab", label: "Fermer l'onglet", group: "Onglets", run: () => tabs.close(tabs.activeId) },
  { id: "reopenTab", label: "Rouvrir le dernier onglet fermé", group: "Onglets", run: () => tabs.reopenClosed() },
  { id: "nextTab", label: "Onglet suivant", group: "Onglets", run: () => tabs.cycle(1) },
  { id: "prevTab", label: "Onglet précédent", group: "Onglets", run: () => tabs.cycle(-1) },
  { id: "toggleSidebar", label: "Replier ou déplier la colonne de gauche", group: "Fenêtre", run: () => settings.toggleSidebar() },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(goToTab),
];

/** Combinaisons réglées, transmises aux mini-apps : elles ne renvoient au moteur que celles-là. */
export function frameShortcuts(): string[] {
  return Object.values(settings.shortcuts).map((s) => s.accelerator);
}

/** Complète une infobulle avec le raccourci de l'action, s'il y en a un : « Nouvel onglet (Ctrl + T) ». */
export function shortcutHint(text: string, actionId: string): string {
  const shortcut = settings.shortcuts[actionId];
  return shortcut ? `${text} (${shortcut.label})` : text;
}

/** Action déjà associée à cette combinaison (pour signaler un doublon), ou `undefined`. */
export function actionUsing(accelerator: string, except?: string): ShortcutAction | undefined {
  return ACTIONS.find((a) => a.id !== except && settings.shortcuts[a.id]?.accelerator === accelerator);
}

/** Renvoie vrai si la combinaison correspond à un raccourci réglé et que l'action a été exécutée. */
export function handleShortcut(event: ShortcutKey): boolean {
  const action = ACTIONS.find((a) => {
    const shortcut = settings.shortcuts[a.id];
    return (
      !!shortcut &&
      matchesShortcut(
        { code: event.code, ctrlKey: event.ctrl, shiftKey: event.shift, altKey: event.alt, metaKey: event.meta },
        [shortcut.accelerator],
      )
    );
  });
  if (!action) return false;
  // La palette ouverte garde le clavier, sauf pour se refermer.
  if (ui.paletteOpen && action.id !== "palette") return false;
  action.run();
  return true;
}
