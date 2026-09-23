//! Raccourci clavier global de l'aperçu rapide, configurable dans les Paramètres.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

/// Ctrl+Alt+Espace est déjà pris par d'autres applications (Claude, par exemple).
pub const DEFAULT: &str = "Ctrl+Shift+Space";

/// Raccourci enregistré auprès de Windows, et la dernière erreur éventuelle.
#[derive(Default)]
pub struct QuickShortcut(Mutex<Etat>);

#[derive(Default, Clone, Serialize)]
pub struct Etat {
    /// Raccourci actif, au format « Ctrl+Alt+Space ».
    accelerator: Option<String>,
    /// Message à afficher si le raccourci n'a pas pu être activé.
    erreur: Option<String>,
}

/// Remplace le raccourci actif. En cas d'échec (combinaison déjà prise par un autre logiciel),
/// l'ancien raccourci reste actif.
pub fn set<R: Runtime>(app: &AppHandle<R>, accelerator: &str) -> Result<(), String> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|_| format!("Combinaison non reconnue : {accelerator}"))?;
    let state = app.state::<QuickShortcut>();
    let mut etat = state.0.lock().map_err(|e| e.to_string())?;
    let manager = app.global_shortcut();

    let previous: Option<Shortcut> = etat.accelerator.as_deref().and_then(|a| a.parse().ok());
    if previous == Some(shortcut) {
        etat.erreur = None;
        return Ok(());
    }
    if let Some(old) = previous {
        let _ = manager.unregister(old);
    }

    match manager.register(shortcut) {
        Ok(()) => {
            *etat = Etat {
                accelerator: Some(accelerator.to_string()),
                erreur: None,
            };
            Ok(())
        }
        Err(err) => {
            log::warn!("Raccourci {accelerator} refusé : {err}");
            if let Some(old) = previous {
                let _ = manager.register(old);
            }
            let message = "Cette combinaison est déjà utilisée par un autre logiciel. Choisissez-en une autre.";
            etat.erreur = Some(message.into());
            Err(message.into())
        }
    }
}

#[tauri::command]
pub fn raccourci_definir(app: AppHandle, accelerator: String) -> Result<(), String> {
    set(&app, &accelerator)
}

#[tauri::command]
pub fn raccourci_etat(state: tauri::State<'_, QuickShortcut>) -> Etat {
    state.0.lock().map(|e| e.clone()).unwrap_or_default()
}
