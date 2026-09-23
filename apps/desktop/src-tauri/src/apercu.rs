//! Aperçu rapide (cahier des charges, section 6) : une fenêtre transparente, créée au démarrage
//! puis cachée, qui s'affiche par-dessus tous les logiciels sur l'écran de la souris. Le flou de
//! l'arrière-plan est fait par la page, à partir d'une capture de l'écran (voir capture.rs).

use crate::capture::{self, Ecran};
use std::sync::Mutex;
use tauri::{ipc::Response, AppHandle, Emitter, Manager, Monitor, Runtime};

pub const LABEL: &str = "apercu";
pub const MAIN: &str = "main";

/// Écran capturé juste avant l'ouverture, en attente d'être lu par la page.
#[derive(Default)]
pub struct DernierEcran(Mutex<Option<Ecran>>);

/// Affiche l'aperçu, ou le cache s'il est déjà visible.
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        // La page joue son fondu de fermeture, puis demande elle-même à masquer la fenêtre.
        log::info!("Aperçu rapide : fermeture demandée");
        let _ = app.emit_to(LABEL, "apercu:fermer", ());
        return;
    }
    // L'aperçu couvre tout l'écran où se trouve la souris (utile en double écran).
    let mut image = None;
    if let Some(monitor) = monitor_under_cursor(app) {
        let (position, size) = (*monitor.position(), *monitor.size());
        // Capturé avant d'afficher la fenêtre : la page floute cette image progressivement.
        let debut = std::time::Instant::now();
        image = capture::ecran(position.x, position.y, size.width, size.height);
        log::info!(
            "Aperçu rapide : écran capturé en {} ms",
            debut.elapsed().as_millis()
        );
        let _ = window.set_position(position);
        let _ = window.set_size(size);
    }
    if let Some(etat) = app.try_state::<DernierEcran>() {
        *etat.0.lock().unwrap_or_else(|e| e.into_inner()) = image;
    }
    let shown = window.show();
    let focused = window.set_focus();
    log::info!("Aperçu rapide : affiché (show {shown:?}, focus {focused:?})");
    // L'interface de l'aperçu relit les réglages (favoris, thème) et revient à la grille.
    let _ = app.emit_to(LABEL, "apercu:ouvert", ());
}

pub fn hide<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.hide();
    }
}

/// Ramène la fenêtre principale au premier plan (depuis l'aperçu, l'icône de notification…).
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    hide(app);
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn monitor_under_cursor<R: Runtime>(app: &AppHandle<R>) -> Option<Monitor> {
    let cursor = app.cursor_position().ok()?;
    app.available_monitors().ok()?.into_iter().find(|monitor| {
        let position = monitor.position();
        let size = monitor.size();
        let (left, top) = (f64::from(position.x), f64::from(position.y));
        cursor.x >= left
            && cursor.x < left + f64::from(size.width)
            && cursor.y >= top
            && cursor.y < top + f64::from(size.height)
    })
}

/// Écran capturé à l'ouverture (une seule lecture), en binaire ; vide si la capture a échoué.
#[tauri::command]
pub fn apercu_ecran(etat: tauri::State<'_, DernierEcran>) -> Response {
    let image = etat.0.lock().unwrap_or_else(|e| e.into_inner()).take();
    Response::new(image.map(Ecran::octets).unwrap_or_default())
}

#[tauri::command]
pub fn apercu_basculer(app: AppHandle) {
    toggle(&app);
}

#[tauri::command]
pub fn apercu_fermer(app: AppHandle) {
    hide(&app);
}

#[tauri::command]
pub fn etabli_afficher(app: AppHandle) {
    show_main(&app);
}
