// Retour sur téléphone : le bouton de la barre et le geste Android font la même chose — revenir à la page précédente,
// ou à la liste des pages (l'accueil) s'il n'y en a pas.
import { tabs } from "./tabs.svelte";

export function retourMobile(): void {
  if (tabs.active?.view.kind === "home") return;
  if ((tabs.active?.history.length ?? 0) > 0) tabs.back();
  else tabs.navigate({ kind: "home" });
}