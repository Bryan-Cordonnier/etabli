// Choix du fond au démarrage : fichiers via Rust dans l'application, localStorage dans un navigateur.
// Le mode serveur (docs/16) ajoutera ici un troisième fond.
import { isTauri } from "@tauri-apps/api/core";
import { creerFondNavigateur } from "./navigateur";
import { fondTauri } from "./tauri";
import type { Fond } from "./types";

export const fond: Fond = isTauri() ? fondTauri : creerFondNavigateur();

export * from "./types";
