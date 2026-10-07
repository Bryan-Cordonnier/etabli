// Plateforme sur laquelle tourne l'interface. Sur Android, c'est Tauri mobile : les mêmes commandes Rust qu'au bureau,
// mais ni aperçu rapide, ni raccourci global, ni zone de notification, ni mises à jour par l'application.
import { isTauri } from "@tauri-apps/api/core";

/** Application Android (Tauri mobile). Le WebView Android annonce « Android » dans son identifiant de navigateur. */
export const estAndroid: boolean = isTauri() && typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

/** Application de bureau (Windows) : vraies fenêtres, raccourci global, zone de notification, mises à jour. */
export const estBureau: boolean = isTauri() && !estAndroid;