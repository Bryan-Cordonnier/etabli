import type { MachineKind } from "@etabli/sdk/protocol";
import { libraries } from "./state/libraries.svelte";
import { tabs } from "./state/tabs.svelte";

/**
 * « + Ajouter une machine… » dans une mini-app (fenêtre principale seulement) : la machine est
 * créée, et Paramètres → Bibliothèques s'ouvre dessus dans un autre onglet. Le calcul reste ouvert
 * et reçoit la machine dès qu'elle est enregistrée.
 */
export function addMachineFromApp(kind: MachineKind): void {
  libraries.addMachine(kind);
  tabs.navigate({ kind: "settings", section: "bibliotheques" });
}
