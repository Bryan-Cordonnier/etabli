mod apercu;
mod documents;
mod files;
mod paths;
mod plugins;
mod raccourci;
mod store;
mod tray;

use paths::AppPaths;
use plugins::LoadedPlugin;
use serde::Serialize;
use std::{
    borrow::Cow,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{http::Response, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::ShortcutState;

/// Argument ajouté au lancement automatique avec Windows : l'application démarre dans la zone de notification.
const DEMARRAGE: &str = "--demarrage";

/// État partagé par les commandes et le service des fichiers de plugins.
pub struct AppState {
    pub paths: AppPaths,
    pub plugins: Vec<LoadedPlugin>,
    /// Fermer la fenêtre principale la réduit dans la zone de notification (réglage « Général »).
    pub fermeture_zone: AtomicBool,
}

#[derive(Serialize)]
struct InfosApp {
    version: String,
    documents: String,
    config: String,
}

#[tauri::command]
fn infos_app(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> InfosApp {
    InfosApp {
        version: app.package_info().version.to_string(),
        documents: state.paths.documents.display().to_string(),
        config: state.paths.config.display().to_string(),
    }
}

#[tauri::command]
fn fermeture_zone_definir(state: tauri::State<'_, AppState>, active: bool) {
    state.fermeture_zone.store(active, Ordering::Relaxed);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // En premier : relancer l'application ramène la fenêtre existante au lieu d'en ouvrir une seconde.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            apercu::show_main(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![DEMARRAGE]),
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        apercu::toggle(app);
                    }
                })
                .build(),
        )
        .register_uri_scheme_protocol(plugins::SCHEME, |ctx, request| {
            match ctx.app_handle().try_state::<AppState>() {
                Some(state) => plugins::serve(&state.plugins, request.uri().path()),
                None => Response::builder()
                    .status(503)
                    .body(Cow::Borrowed(&b"demarrage en cours"[..]))
                    .expect("réponse 503 valide"),
            }
        })
        .setup(|app| {
            // Journal détaillé uniquement en développement.
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let paths = AppPaths::resolve(app.handle())?;
            let plugins = plugins::scan(&paths.plugin_roots);
            let reglages = store::read(&paths.config);
            let reglage = |cle: &str| reglages.get("settings").and_then(|s| s.get(cle)).cloned();
            log::info!(
                "{} plugin(s) chargé(s), documents dans {}",
                plugins.len(),
                paths.documents.display()
            );

            let fermeture_zone = reglage("closeToTray")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            app.manage(AppState {
                paths,
                plugins,
                fermeture_zone: AtomicBool::new(fermeture_zone),
            });

            // Raccourci de l'aperçu rapide : celui des réglages, sinon Ctrl+Alt+Espace.
            app.manage(raccourci::QuickShortcut::default());
            let accelerator = reglage("quickShortcut")
                .and_then(|v| {
                    v.get("accelerator")
                        .and_then(|a| a.as_str().map(String::from))
                })
                .unwrap_or_else(|| raccourci::DEFAULT.to_string());
            if let Err(err) = raccourci::set(app.handle(), &accelerator) {
                log::warn!("Aperçu rapide sans raccourci : {err}");
            }

            tray::create(app)?;

            // Lancé avec Windows : on reste discret dans la zone de notification.
            if !std::env::args().any(|a| a == DEMARRAGE) {
                if let Some(main) = app.get_webview_window(apercu::MAIN) {
                    main.show()?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| match (window.label(), event) {
            (apercu::MAIN, WindowEvent::CloseRequested { api, .. }) => {
                let app = window.app_handle();
                let vers_zone = app
                    .try_state::<AppState>()
                    .is_some_and(|s| s.fermeture_zone.load(Ordering::Relaxed));
                if vers_zone {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    app.exit(0);
                }
            }
            // Un clic ailleurs (autre logiciel, autre écran) ferme l'aperçu.
            (apercu::LABEL, WindowEvent::Focused(false)) => {
                let _ = window.hide();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            plugins::plugins_list,
            documents::documents_list,
            documents::document_read,
            documents::document_save,
            documents::document_delete,
            store::store_load,
            store::store_save,
            apercu::apercu_basculer,
            apercu::apercu_fermer,
            apercu::etabli_afficher,
            raccourci::raccourci_definir,
            raccourci::raccourci_etat,
            infos_app,
            fermeture_zone_definir,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application");
}
