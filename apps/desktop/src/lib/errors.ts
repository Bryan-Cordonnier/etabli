// Recopie les erreurs de l'interface dans le journal de l'application (terminal en développement),
// pour pouvoir diagnostiquer un problème sans ouvrir les outils de développement.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./api";

export function reportErrors(): void {
  if (!inTauri) return;
  const send = (message: string) => void invoke("journal", { message }).catch(() => {});
  window.addEventListener("error", (event) => send(`${event.message} (${event.filename}:${event.lineno})`));
  window.addEventListener("unhandledrejection", (event) => send(`Promesse rejetée : ${String(event.reason)}`));
}
