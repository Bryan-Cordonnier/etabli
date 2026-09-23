//! Icône dans la zone de notification : l'application reste disponible (et le raccourci de
//! l'aperçu rapide actif) quand la fenêtre principale est fermée.

use crate::apercu;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App,
};

pub fn create(app: &App) -> tauri::Result<()> {
    let handle = app.handle();
    let ouvrir = MenuItem::with_id(handle, "ouvrir", "Ouvrir l'Établi", true, None::<&str>)?;
    let apercu_item = MenuItem::with_id(handle, "apercu", "Aperçu rapide", true, None::<&str>)?;
    let separateur = PredefinedMenuItem::separator(handle)?;
    let quitter = MenuItem::with_id(handle, "quitter", "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(handle, &[&ouvrir, &apercu_item, &separateur, &quitter])?;

    let mut builder = TrayIconBuilder::with_id("etabli")
        .tooltip("Établi")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "ouvrir" => apercu::show_main(app),
            "apercu" => apercu::toggle(app),
            "quitter" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                apercu::show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}
