use std::{fs, io, path::Path};
use tauri_plugin_dialog::DialogExt;

/// Formats qu'une mini-app peut proposer à « Enregistrer sous » : jamais un programme ni un script (docs/19).
const EXTENSIONS_PERMISES: [&str; 8] = ["csv", "tsv", "dxf", "json", "txt", "svg", "md", "xml"];
/// Taille maximale du contenu d'un fichier exporté par une mini-app.
const EXPORT_MAX: usize = 20 * 1024 * 1024;

/// Contrôle de l'export demandé par une mini-app. Le moteur le refait même si l'interface l'a déjà fait : le cœur
/// ne fait confiance à personne.
fn verifier_export(nom: &str, contenu: &str, extension: &str) -> Result<(), String> {
    let extension = extension.to_ascii_lowercase();
    if !EXTENSIONS_PERMISES.contains(&extension.as_str()) {
        return Err(format!("Format de fichier refusé : .{extension}"));
    }
    let propre = nom.trim();
    let sans_chemin = Path::new(propre).file_name().and_then(|n| n.to_str());
    let caracteres_interdits = |c: char| c.is_control() || "\\/:*?\"<>|".contains(c);
    if propre.is_empty()
        || propre.chars().count() > 120
        || sans_chemin != Some(propre)
        || propre.chars().any(caracteres_interdits)
        || propre.starts_with('.')
        || propre.ends_with('.')
    {
        return Err("Nom de fichier refusé".into());
    }
    if !propre
        .to_ascii_lowercase()
        .ends_with(&format!(".{extension}"))
    {
        return Err("L'extension du nom ne correspond pas au format".into());
    }
    if contenu.len() > EXPORT_MAX {
        return Err("Fichier trop volumineux".into());
    }
    Ok(())
}

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
    verifier_export(&nom, &contenu, &extension)?;
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
mod tests_export {
    use super::verifier_export;

    #[test]
    fn accepte_les_formats_prevus() {
        for ext in ["csv", "dxf", "json", "txt", "svg", "tsv", "md", "XML"] {
            assert!(
                verifier_export(&format!("piece.{ext}"), "x", ext).is_ok(),
                "{ext}"
            );
        }
    }

    #[test]
    fn refuse_les_programmes_et_les_scripts() {
        for ext in [
            "exe", "bat", "cmd", "ps1", "lnk", "js", "html", "msi", "vbs", "dll",
        ] {
            assert!(
                verifier_export(&format!("a.{ext}"), "x", ext).is_err(),
                "{ext}"
            );
        }
        assert!(verifier_export("a.dxf.exe", "x", "dxf").is_err());
        assert!(verifier_export("a.bat", "x", "dxf").is_err());
    }

    #[test]
    fn refuse_les_noms_a_chemin_ou_caches() {
        for nom in [
            "../a.dxf", "a/b.dxf", "a\\b.dxf", "C:a.dxf", ".a.dxf", "a|b.dxf", "a.dxf.", "",
        ] {
            assert!(verifier_export(nom, "x", "dxf").is_err(), "{nom}");
        }
    }

    #[test]
    fn refuse_un_contenu_enorme() {
        let gros = "x".repeat(20 * 1024 * 1024 + 1);
        assert!(verifier_export("a.csv", &gros, "csv").is_err());
    }
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
