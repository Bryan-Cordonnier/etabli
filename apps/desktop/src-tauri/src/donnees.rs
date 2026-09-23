//! Bibliothèques de l'application (fournisseurs) et réglages propres à chaque plugin
//! (machines d'Économie…), un fichier JSON chacun dans `donnees/` du dossier de configuration.

use crate::files::write_atomic;
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
};

const DOSSIER: &str = "donnees";

/// Nom de fichier sûr : minuscules, chiffres, tirets et points, sans chemin ni fichier caché.
fn chemin(config: &Path, nom: &str) -> Result<PathBuf, String> {
    let valide = !nom.is_empty()
        && nom.len() <= 64
        && !nom.starts_with('.')
        && nom
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.');
    if !valide {
        return Err(format!("Nom de données invalide : {nom}"));
    }
    Ok(config.join(DOSSIER).join(format!("{nom}.json")))
}

/// Contenu enregistré, ou `null` s'il n'y a encore rien (ou un fichier illisible).
pub fn lire(config: &Path, nom: &str) -> Result<Value, String> {
    let fichier = chemin(config, nom)?;
    Ok(fs::read(fichier)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or(Value::Null))
}

pub fn ecrire(config: &Path, nom: &str, valeur: &Value) -> Result<(), String> {
    let fichier = chemin(config, nom)?;
    let bytes = serde_json::to_vec_pretty(valeur).map_err(|e| e.to_string())?;
    write_atomic(&fichier, &bytes).map_err(|e| format!("Enregistrement impossible : {e}"))
}

#[tauri::command]
pub fn donnees_lire(
    state: tauri::State<'_, crate::AppState>,
    nom: String,
) -> Result<Value, String> {
    lire(&state.paths.config, &nom)
}

#[tauri::command]
pub fn donnees_ecrire(
    state: tauri::State<'_, crate::AppState>,
    nom: String,
    valeur: Value,
) -> Result<(), String> {
    ecrire(&state.paths.config, &nom, &valeur)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::tests::scratch;
    use serde_json::json;

    #[test]
    fn refuse_les_chemins() {
        let dir = scratch("donnees-noms");
        for nom in [
            "",
            "../settings",
            "a/b",
            "a\\b",
            ".cache",
            "Fournisseurs",
            "c:",
        ] {
            assert!(chemin(&dir, nom).is_err(), "{nom} devrait être refusé");
        }
        assert!(chemin(&dir, "plugin.economie").is_ok());
    }

    #[test]
    fn relit_ce_qui_est_ecrit() {
        let dir = scratch("donnees-lecture");
        assert_eq!(lire(&dir, "fournisseurs").unwrap(), Value::Null);
        let valeur = json!([{ "id": "a", "name": "Métaux Nord", "items": [] }]);
        ecrire(&dir, "fournisseurs", &valeur).unwrap();
        assert_eq!(lire(&dir, "fournisseurs").unwrap(), valeur);
    }
}
