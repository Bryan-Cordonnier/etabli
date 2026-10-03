// Choix du fond au démarrage : fichiers via Rust dans l'application, IndexedDB dans un navigateur.
// Le mode serveur (docs/16) ajoutera ici un troisième fond.
import { isTauri } from "@tauri-apps/api/core";
import { fondTauri } from "./tauri";
import { creerFondWeb } from "./web";
import type { Fond } from "./types";

export const fond: Fond = isTauri() ? fondTauri : creerFondWeb();

export * from "./types";
