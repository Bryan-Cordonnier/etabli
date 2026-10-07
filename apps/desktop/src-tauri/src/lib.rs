#[cfg(desktop)]
mod apercu;
mod documents;
mod donnees;
mod files;
mod installation;
mod integres;
mod paths;
mod plugins;
#[cfg(desktop)]
mod raccourci;
mod store;
#[cfg(desktop)]
mod tray;

use paths::AppPaths;
use plugins::LoadedPlugin;
use serde::Serialize;
#[cfg(desktop)]
use std::sync::atomic::{AtomicBool, Ordering};
use std::{
    borrow::Cow,
    sync::{RwLock, RwLockReadGuard},
};
use tauri::{http::Response, Manager, WindowEvent};
#[cfg(desktop)]
use tauri_plugin_autostart::MacosLauncher;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::ShortcutState;

/// Argument ajouté au lancement automatique avec Windows : l'application démarre dans la zone de notification.
#[cfg(desktop)]
const DEMARRAGE: &str = "--demarrage";

/// État partagé par les commandes et le service des fichiers de plugins.
pub struct AppState {
    pub paths: AppPaths,
    /// Relue après chaque installation ou désinstallation depuis un fichier (sans redémarrer).
    plugins: RwLock<Vec<LoadedPlugin>>,
    /// Fermer la fenêtre principale la réduit dans la zone de notification (réglage « Général »).
    #[cfg(desktop)]
    pub fermeture_zone: AtomicBool,
}

impl AppState {
    pub fn plugins(&self) -> RwLockReadGuard<'_, Vec<LoadedPlugin>> {
        // Un verrou empoisonné (panique pendant une écriture) garde la dernière liste complète.
        self.plugins.read().unwrap_or_else(|e| e.into_inner())
    }

    /// Relit les dossiers de plugins.
    pub fn reload_plugins(&self) {
        let list = plugins::scan(&self.paths.plugin_roots);
        *self.plugins.write().unwrap_or_else(|e| e.into_inner()) = list;
    }
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

#[cfg(desktop)]
#[tauri::command]
fn fermeture_zone_definir(state: tauri::State<'_, AppState>, active: bool) {
    state.fermeture_zone.store(active, Ordering::Relaxed);
}

/// Erreurs de l'interface, recopiées dans le journal de l'application.
#[tauri::command]
fn journal(fenetre: tauri::Window, message: String) {
    log::warn!("[interface {}] {message}", fenetre.label());
}

/// Argument de lancement qui ouvre directement l'aperçu rapide (utile pour un raccourci Windows).
#[cfg(desktop)]
const APERCU: &str = "--apercu";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Bureau : en premier, relancer l'application ramène la fenêtre existante au lieu d'en ouvrir une seconde.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|a| a == APERCU) {
                apercu::toggle(app);
            } else {
                apercu::show_main(app);
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![DEMARRAGE]),
        ))
        // Mises à jour signées depuis GitHub Releases (voir docs/14-publier-une-version.md).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        apercu::toggle(app);
                    }
                })
                .build(),
        );
    // Mobile : notifications programmées pour les rappels des plugins.
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_notification::init());

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol(plugins::SCHEME, |ctx, request| {
            match ctx.app_handle().try_state::<AppState>() {
                Some(state) => plugins::serve(&state.plugins(), request.uri().path()),
                None => Response::builder()
                    .status(503)
                    .body(Cow::Borrowed(&b"demarrage en cours"[..]))
                    .expect("réponse 503 valide"),
            }
        })
        .setup(|app| {
            // Journal détaillé uniquement en développement, dans le terminal (rien d'écrit sur le disque).
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .clear_targets()
                        .target(tauri_plugin_log::Target::new(
                            tauri_plugin_log::TargetKind::Stdout,
                        ))
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let paths = AppPaths::resolve(app.handle())?;
            installation::nettoyer(&paths.installes);
            // Plugins livrés avec la distribution (aucun pour le moteur seul).
            if let Err(err) = integres::extraire(&paths.integres) {
                log::warn!("Plugins livrés non écrits : {err}");
            }
            let plugins = plugins::scan(&paths.plugin_roots);
            #[cfg(desktop)]
            let reglages = store::read(&paths.config);
            #[cfg(desktop)]
            let reglage = |cle: &str| reglages.get("settings").and_then(|s| s.get(cle)).cloned();
            log::info!(
                "{} plugin(s) chargé(s), documents dans {}",
                plugins.len(),
                paths.documents.display()
            );

            #[cfg(desktop)]
            let fermeture_zone = reglage("closeToTray")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            app.manage(AppState {
                paths,
                plugins: RwLock::new(plugins),
                #[cfg(desktop)]
                fermeture_zone: AtomicBool::new(fermeture_zone),
            });

            // Les fenêtres (« create »: false dans tauri.conf.json) sont créées seulement maintenant.
            // Créées avant cet état, leurs pages, servies instantanément une fois installées,
            // demandaient la liste des plugins et les réglages avant qu'ils existent : liste vide.
            // Sur mobile, il n'y a qu'une fenêtre (« main ») : l'aperçu rapide n'existe pas.
            for config in app.config().app.windows.clone() {
                #[cfg(mobile)]
                if config.label != "main" {
                    continue;
                }
                tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?.build()?;
            }

            #[cfg(desktop)]
            demarrage_bureau(app, &reglage)?;
            #[cfg(mobile)]
            if let Some(main) = app.get_webview_window("main") {
                main.show()?;
            }
            Ok(())
        })
        // Pas de fermeture de l'aperçu sur `Focused(false)` : WebView2 le déclenche aussi quand le
        // focus passe de la fenêtre à la page. C'est la page qui détecte la vraie perte de focus.
        .on_window_event(fenetre)
        .invoke_handler(commandes())
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application");
}

/// Fermer la fenêtre principale la réduit dans la zone de notification (réglage « Général ») ; sur mobile, rien à faire.
fn fenetre(window: &tauri::Window, event: &WindowEvent) {
    #[cfg(desktop)]
    if let (apercu::MAIN, WindowEvent::CloseRequested { api, .. }) = (window.label(), event) {
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
    #[cfg(mobile)]
    let _ = (window, event);
}

/// Raccourci global de l'aperçu rapide, zone de notification et lancement discret (bureau seulement).
#[cfg(desktop)]
fn demarrage_bureau(
    app: &mut tauri::App,
    reglage: &dyn Fn(&str) -> Option<serde_json::Value>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Raccourci de l'aperçu rapide : celui des réglages, sinon Ctrl+Maj+Espace.
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
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == APERCU) {
        apercu::toggle(app.handle());
    } else if !args.iter().any(|a| a == DEMARRAGE) {
        if let Some(main) = app.get_webview_window(apercu::MAIN) {
            main.show()?;
        }
    }
    Ok(())
}

#[cfg(desktop)]
fn commandes() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        plugins::plugins_list,
        installation::plugin_installer_fichier,
        installation::plugin_desinstaller,
        documents::documents_list,
        documents::document_read,
        documents::document_save,
        documents::document_delete,
        store::store_load,
        store::store_save,
        donnees::donnees_lire,
        donnees::donnees_ecrire,
        apercu::apercu_basculer,
        apercu::apercu_fermer,
        apercu::etabli_afficher,
        raccourci::raccourci_definir,
        raccourci::raccourci_etat,
        infos_app,
        fermeture_zone_definir,
        journal,
        files::fichier_enregistrer,
    ]
}

/// Mobile : les mêmes commandes, sans fenêtres, raccourci ni zone de notification.
#[cfg(mobile)]
fn commandes() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        plugins::plugins_list,
        installation::plugin_installer_fichier,
        installation::plugin_desinstaller,
        documents::documents_list,
        documents::document_read,
        documents::document_save,
        documents::document_delete,
        store::store_load,
        store::store_save,
        donnees::donnees_lire,
        donnees::donnees_ecrire,
        infos_app,
        journal,
        files::fichier_enregistrer,
    ]
}
