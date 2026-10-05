//! Bibliothèques de l'application (fournisseurs) et réglages propres à chaque plugin
//! (machines d'Économie…), un fichier JSON chacun dans `donnees/` du dossier de configuration.

use crate::files::write_atomic;
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
};

const DOSSIER: &str = "donnees";
/// Taille maximale d'un fichier de données (réglages d'un plugin, bibliothèques) : un plugin ne remplit pas le disque.
const TAILLE_MAX: usize = 5 * 1024 * 1024;

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

/// Contenu enregistré, ou `null` s'il n'y a encore rien (fichier absent). Un fichier présent mais illisible ou abîmé est
/// une **erreur**, jamais `null` : l'appelant prendrait « rien d'enregistré » pour un feu vert et écraserait le vrai contenu
/// (le registre de Finances, par exemple). Le fichier n'est pas touché.
pub fn lire(config: &Path, nom: &str) -> Result<Value, String> {
    let fichier = chemin(config, nom)?;
    let bytes = match fs::read(&fichier) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Value::Null),
        Err(e) => {
            return Err(format!(
                "Lecture impossible de « {nom} » : {e}. Le fichier n'a pas été modifié."
            ))
        }
    };
    serde_json::from_slice(&bytes).map_err(|e| {
        format!("Les données « {nom} » sont abîmées ({e}). Le fichier n'a pas été modifié.")
    })
}

pub fn ecrire(config: &Path, nom: &str, valeur: &Value) -> Result<(), String> {
    let fichier = chemin(config, nom)?;
    let bytes = serde_json::to_vec_pretty(valeur).map_err(|e| e.to_string())?;
    if bytes.len() > TAILLE_MAX {
        return Err("Données trop volumineuses".into());
    }
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
    fn refuse_des_donnees_enormes() {
        let dir = scratch("donnees-taille");
        let gros = json!({ "x": "a".repeat(TAILLE_MAX) });
        assert!(ecrire(&dir, "plugin.essai", &gros).is_err());
        assert_eq!(lire(&dir, "plugin.essai").unwrap(), Value::Null);
    }

    #[test]
    fn un_fichier_abime_est_une_erreur_pas_un_vide() {
        let dir = scratch("donnees-abime");
        ecrire(&dir, "plugin.finances", &json!({ "ecritures": [1, 2, 3] })).unwrap();
        let fichier = chemin(&dir, "plugin.finances").unwrap();
        fs::write(&fichier, b"{ \"ecritures\": [1, 2").unwrap();
        let erreur = lire(&dir, "plugin.finances").unwrap_err();
        assert!(erreur.contains("abîmées"), "{erreur}");
        // Le fichier reste tel quel : rien n'est réparé ni écrasé en silence.
        assert_eq!(fs::read(&fichier).unwrap(), b"{ \"ecritures\": [1, 2");
    }

    #[test]
    fn un_fichier_absent_donne_null() {
        let dir = scratch("donnees-absent");
        assert_eq!(lire(&dir, "plugin.jamais-ecrit").unwrap(), Value::Null);
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
