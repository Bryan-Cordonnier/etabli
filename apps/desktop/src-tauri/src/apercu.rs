//! Aperçu rapide (cahier des charges, section 6) : une fenêtre transparente, créée au démarrage
//! puis cachée, qui s'affiche par-dessus tous les logiciels sur l'écran de la souris, derrière
//! un voile en fondu dessiné par la page.

use tauri::{AppHandle, Emitter, Manager, Monitor, Runtime};

pub const LABEL: &str = "apercu";
pub const MAIN: &str = "main";

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
    if let Some(monitor) = monitor_under_cursor(app) {
        let _ = window.set_position(*monitor.position());
        let _ = window.set_size(*monitor.size());
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
