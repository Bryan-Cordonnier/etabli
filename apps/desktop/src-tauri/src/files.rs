use std::{fs, io, path::Path};
use tauri_plugin_dialog::DialogExt;

/// Export d'une mini-app (CSV, DXF…) : boîte « Enregistrer sous » de Windows, puis écriture.
/// Renvoie le chemin choisi, ou `None` si l'utilisateur a annulé.
#[tauri::command]
pub async fn fichier_enregistrer(
    app: tauri::AppHandle,
    nom: String,
    contenu: String,
    extension: String,
    description: String,
) -> Result<Option<String>, String> {
    let choisi = app
        .dialog()
        .file()
        .set_file_name(&nom)
        .add_filter(&description, &[extension.as_str()])
        .blocking_save_file();
    let Some(chemin) = choisi else {
        return Ok(None);
    };
    let chemin = chemin.into_path().map_err(|e| e.to_string())?;
    write_atomic(&chemin, contenu.as_bytes()).map_err(|e| format!("Écriture impossible : {e}"))?;
    Ok(Some(chemin.display().to_string()))
}

/// Écrit un fichier sans risque de le corrompre : on écrit à côté, puis on remplace
/// (cahier des charges, section 7.2). Une coupure pendant l'écriture laisse l'ancien fichier intact.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut temporary = path.as_os_str().to_owned();
    temporary.push(".tmp");
    fs::write(&temporary, bytes)?;
    fs::rename(&temporary, path)
}

#[cfg(test)]
pub mod tests {
    use std::path::PathBuf;

    /// Dossier temporaire propre à un test, supprimé puis recréé.
    pub fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("etabli-tests").join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_atomic_replaces_existing_file() {
        let dir = scratch("write-atomic");
        let file = dir.join("sous-dossier").join("a.json");
        super::write_atomic(&file, b"1").unwrap();
        super::write_atomic(&file, b"2").unwrap();
        assert_eq!(std::fs::read(&file).unwrap(), b"2");
        assert!(!dir.join("sous-dossier").join("a.json.tmp").exists());
    }
}
