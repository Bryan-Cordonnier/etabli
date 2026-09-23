//! Réglages et onglets ouverts, dans `settings.json` du dossier de configuration.

use crate::files::write_atomic;
use serde_json::{json, Value};
use std::{fs, path::Path};

const FILE: &str = "settings.json";

/// Contenu de settings.json, ou un objet vide s'il n'existe pas encore.
pub fn read(config_dir: &Path) -> Value {
    fs::read(config_dir.join(FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}))
}

#[tauri::command]
pub fn store_load(state: tauri::State<'_, crate::AppState>) -> Value {
    read(&state.paths.config)
}

#[tauri::command]
pub fn store_save(state: tauri::State<'_, crate::AppState>, value: Value) -> Result<(), String> {
    if !value.is_object() {
        return Err("Les réglages doivent être un objet JSON".into());
    }
    let bytes = serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())?;
    write_atomic(&state.paths.config.join(FILE), &bytes).map_err(|e| e.to_string())
}
