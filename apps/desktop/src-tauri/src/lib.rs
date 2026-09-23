mod documents;
mod files;
mod paths;
mod plugins;
mod store;

use paths::AppPaths;
use plugins::LoadedPlugin;
use std::borrow::Cow;
use tauri::{http::Response, Manager};

/// État partagé par les commandes et le service des fichiers de plugins.
pub struct AppState {
    pub paths: AppPaths,
    pub plugins: Vec<LoadedPlugin>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            log::info!(
                "{} plugin(s) chargé(s), documents dans {}",
                plugins.len(),
                paths.documents.display()
            );
            app.manage(AppState { paths, plugins });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            plugins::plugins_list,
            documents::documents_list,
            documents::document_read,
            documents::document_save,
            documents::document_delete,
            store::store_load,
            store::store_save,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application");
}
