//! Installation des plugins (docs/14) : depuis un fichier `.etabli-plugin` signé, sans réseau, sans redémarrer.
//!
//! Un paquet `.etabli-plugin` est un zip qui contient `plugin.zip` (les fichiers du plugin) et
//! `plugin.zip.minisig` (sa signature, faite avec la clé publique de `tauri.conf.json`, celle de l'éditeur de
//! la distribution). Rien n'est écrit sur le disque avant que la signature soit vérifiée. Seul le moteur
//! touche au disque, jamais une mini-app.

use crate::{plugins, AppState};
use etabli_noyau::{
    paquet::{fichiers_du_plugin, lire_manifeste, ouvrir_paquet, FichierPlugin, TAILLE_MAX_PAQUET},
    version::{comparer_versions, version_valide},
};
use serde_json::Value;
use std::{cmp::Ordering, fs, path::Path};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

/// Événement envoyé à toutes les fenêtres quand la liste des plugins a changé.
const PLUGINS_CHANGES: &str = "etabli:plugins";

/// Version installée d'un plugin, si elle est lisible.
fn version_installee(racine: &Path, id: &str) -> Option<String> {
    let (_, manifeste) = plugins::read_manifest(&racine.join(id)).ok()?;
    manifeste
        .get("version")
        .and_then(Value::as_str)
        .map(String::from)
}

/// Décide si le plugin contenu dans `zip` peut être installé : une version illisible ou plus ancienne que celle
/// installée est refusée ; la même version est permise (réparer une installation).
pub fn controler_installation(zip: &[u8], racine: &Path) -> Result<(), String> {
    let fichiers = fichiers_du_plugin(zip)?;
    let (id, manifeste) = lire_manifeste(&fichiers)?;
    let candidate = manifeste
        .get("version")
        .and_then(Value::as_str)
        .ok_or("Plugin refusé : « version » absente du manifeste.")?;
    if !version_valide(candidate) {
        return Err(format!("Version illisible : {candidate}"));
    }
    if let Some(installee) = version_installee(racine, &id) {
        if comparer_versions(candidate, &installee) == Some(Ordering::Less) {
            return Err(format!(
                "La version {candidate} de « {id} » est plus ancienne que la {installee} installée : installation refusée."
            ));
        }
    }
    Ok(())
}

/// Écrit les fichiers d'un plugin sous `dossier`. Les chemins viennent de `fichiers_du_plugin`, qui a déjà refusé
/// tout ce qui sortirait du dossier.
fn ecrire_fichiers(fichiers: &[FichierPlugin], dossier: &Path) -> Result<(), String> {
    for fichier in fichiers {
        let cible = dossier.join(&fichier.chemin);
        if let Some(parent) = cible.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&cible, &fichier.octets).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn jeton() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// Installe le plugin contenu dans `zip` sous `racine/<id>`, en remplaçant d'un coup l'éventuelle
/// version précédente (gardée si quoi que ce soit échoue). Renvoie l'identifiant du plugin.
pub fn installer(zip: &[u8], racine: &Path, attendu: Option<&str>) -> Result<String, String> {
    fs::create_dir_all(racine).map_err(|e| format!("Installation impossible : {e}"))?;
    let fichiers = fichiers_du_plugin(zip)?;
    let (id, _) = lire_manifeste(&fichiers)?;
    if let Some(attendu) = attendu.filter(|a| *a != id) {
        return Err(format!(
            "Le paquet contient le plugin « {id} » au lieu de « {attendu} »."
        ));
    }
    let jeton = jeton();
    let temporaire = racine.join(format!(".installation-{jeton}"));
    let resultat = (|| {
        ecrire_fichiers(&fichiers, &temporaire)?;
        // Contrôle final sur ce qui est vraiment écrit sur le disque.
        let (id_ecrit, _) =
            plugins::read_manifest(&temporaire).map_err(|e| format!("Plugin invalide : {e}"))?;
        if id_ecrit != id {
            return Err("Plugin invalide : identifiant incohérent.".to_string());
        }
        let cible = racine.join(&id);
        let ancien = racine.join(format!(".ancien-{jeton}"));
        if cible.exists() {
            fs::rename(&cible, &ancien).map_err(|e| format!("Mise à jour impossible : {e}"))?;
        }
        if let Err(e) = fs::rename(&temporaire, &cible) {
            if ancien.exists() {
                let _ = fs::rename(&ancien, &cible);
            }
            return Err(format!("Installation impossible : {e}"));
        }
        let _ = fs::remove_dir_all(&ancien);
        Ok(id.clone())
    })();
    if resultat.is_err() {
        let _ = fs::remove_dir_all(&temporaire);
    }
    resultat
}

/// Désinstalle un plugin installé : son dossier disparaît, pas les calculs faits avec
/// (ils sont dans le dossier des documents).
pub fn desinstaller(racine: &Path, id: &str) -> Result<(), String> {
    let dossier = racine.join(id);
    if !plugins::valid_id(id) || !dossier.is_dir() {
        return Err(
            "Ce plugin n'a pas été installé depuis un fichier : rien à désinstaller.".into(),
        );
    }
    // Renommé d'abord : le plugin quitte la liste même si un de ses fichiers reste ouvert.
    let corbeille = racine.join(format!(".desinstalle-{}", jeton()));
    fs::rename(&dossier, &corbeille).map_err(|e| format!("Désinstallation impossible : {e}"))?;
    let _ = fs::remove_dir_all(&corbeille);
    Ok(())
}

/// Supprime les dossiers laissés par une installation interrompue (au démarrage).
pub fn nettoyer(racine: &Path) {
    let Ok(entrees) = fs::read_dir(racine) else {
        return;
    };
    for entree in entrees.filter_map(Result::ok) {
        let nom = entree.file_name();
        if nom.to_string_lossy().starts_with('.') && entree.path().is_dir() {
            let _ = fs::remove_dir_all(entree.path());
        }
    }
}

fn cle_publique(app: &AppHandle) -> Result<String, String> {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|u| u.get("pubkey"))
        .and_then(Value::as_str)
        .map(String::from)
        .ok_or_else(|| "Clé publique absente de tauri.conf.json.".to_string())
}

/// Recharge la liste des plugins et prévient toutes les fenêtres (principale et aperçu rapide).
fn plugins_changes(app: &AppHandle) {
    app.state::<AppState>().reload_plugins();
    let _ = app.emit(PLUGINS_CHANGES, ());
}

// ——— Commandes ———

/// Installe un plugin depuis un fichier `.etabli-plugin` (clé USB, réseau local).
/// Renvoie l'identifiant installé, ou `None` si l'utilisateur a annulé.
#[tauri::command]
pub async fn plugin_installer_fichier(app: AppHandle) -> Result<Option<String>, String> {
    let Some(choix) = app
        .dialog()
        .file()
        .set_title("Installer un plugin depuis un fichier")
        .add_filter("Plugin Établi", &["etabli-plugin"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let chemin = choix.into_path().map_err(|e| e.to_string())?;
    if fs::metadata(&chemin).map(|m| m.len()).unwrap_or(0) > TAILLE_MAX_PAQUET {
        return Err("Paquet trop volumineux.".into());
    }
    let paquet = fs::read(&chemin).map_err(|e| format!("Lecture impossible : {e}"))?;
    let zip = ouvrir_paquet(&paquet, &cle_publique(&app)?)?;
    let racine = app.state::<AppState>().paths.installes.clone();
    let id = tauri::async_runtime::spawn_blocking(move || {
        controler_installation(&zip, &racine)?;
        installer(&zip, &racine, None)
    })
    .await
    .map_err(|e| e.to_string())??;
    plugins_changes(&app);
    Ok(Some(id))
}

/// Désinstalle un plugin installé depuis un fichier (les calculs restent).
#[tauri::command]
pub fn plugin_desinstaller(app: AppHandle, id: String) -> Result<(), String> {
    let racine = app.state::<AppState>().paths.installes.clone();
    desinstaller(&racine, &id)?;
    plugins_changes(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::tests::scratch;
    use std::io::{Cursor, Write};
    use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

    /// Paquet d'essai signé avec une clé d'essai (scripts/paquet-plugin.mjs --dossier …).
    const PAQUET: &[u8] = include_bytes!("../fixtures/essai-1.0.0.etabli-plugin");
    const CLE_ESSAI: &str = include_str!("../fixtures/cle-essai.pub");

    fn zip_de(fichiers: &[(&str, &[u8])]) -> Vec<u8> {
        let mut ecrivain = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        for (nom, contenu) in fichiers {
            ecrivain.start_file(*nom, options).unwrap();
            ecrivain.write_all(contenu).unwrap();
        }
        ecrivain.finish().unwrap().into_inner()
    }

    fn plugin(id: &str, version: &str) -> Vec<u8> {
        let manifeste = format!(r#"{{"id":"{id}","version":"{version}"}}"#);
        zip_de(&[("manifest.json", manifeste.as_bytes()), ("a.js", b"1")])
    }

    #[test]
    fn paquet_signe_installe() {
        let racine = scratch("installation-installer");
        let zip = ouvrir_paquet(PAQUET, CLE_ESSAI).expect("signature d'essai valide");
        let id = installer(&zip, &racine, Some("essai")).unwrap();
        assert_eq!(id, "essai");
        assert!(racine.join("essai/manifest.json").is_file());
        assert!(racine.join("essai/apps/bonjour/index.html").is_file());
        // Aucun dossier temporaire ne reste.
        assert_eq!(fs::read_dir(&racine).unwrap().count(), 1);
    }

    #[test]
    fn paquet_non_signe_par_notre_cle_refuse() {
        // Clé publique de l'application : le paquet d'essai n'est pas signé avec.
        let conf: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let cle = conf["plugins"]["updater"]["pubkey"].as_str().unwrap();
        assert!(ouvrir_paquet(PAQUET, cle).is_err());
    }

    #[test]
    fn chemins_hors_du_dossier_refuses() {
        let racine = scratch("installation-evasion");
        let malveillant = zip_de(&[
            ("manifest.json", br#"{"id":"evasion"}"#),
            ("../dehors.txt", b"non"),
        ]);
        assert!(installer(&malveillant, &racine.join("plugins"), None).is_err());
        assert!(!racine.join("dehors.txt").exists());
        // Rien ne reste du plugin refusé.
        assert_eq!(fs::read_dir(racine.join("plugins")).unwrap().count(), 0);
    }

    #[test]
    fn mise_a_jour_puis_desinstallation() {
        let racine = scratch("installation-maj");
        let v1 = zip_de(&[
            ("manifest.json", br#"{"id":"outil","version":"1.0.0"}"#),
            ("a.js", b"1"),
        ]);
        let v2 = zip_de(&[
            ("manifest.json", br#"{"id":"outil","version":"2.0.0"}"#),
            ("b.js", b"2"),
        ]);
        installer(&v1, &racine, None).unwrap();
        installer(&v2, &racine, Some("outil")).unwrap();
        // L'ancienne version est remplacée d'un bloc : ses fichiers disparaissent, rien n'est gardé à côté.
        assert!(!racine.join("outil/a.js").exists());
        assert!(racine.join("outil/b.js").exists());
        assert_eq!(fs::read_dir(&racine).unwrap().count(), 1);
        // Mauvais identifiant attendu : refusé, la version installée reste.
        assert!(installer(&v1, &racine, Some("autre")).is_err());
        assert!(racine.join("outil/b.js").exists());

        desinstaller(&racine, "outil").unwrap();
        assert!(!racine.join("outil").exists());
        assert!(desinstaller(&racine, "outil").is_err());
        assert!(desinstaller(&racine, "../x").is_err());
    }

    #[test]
    fn nettoyage_des_restes() {
        let racine = scratch("installation-nettoyage");
        fs::create_dir_all(racine.join(".installation-abc")).unwrap();
        fs::create_dir_all(racine.join("agenda")).unwrap();
        nettoyer(&racine);
        assert!(!racine.join(".installation-abc").exists());
        assert!(racine.join("agenda").exists());
    }

    #[test]
    fn controle_des_versions_a_l_installation() {
        let racine = scratch("installation-controle");
        // Première installation : permise.
        controler_installation(&plugin("agenda", "1.0.1"), &racine).unwrap();
        installer(&plugin("agenda", "1.0.1"), &racine, None).unwrap();
        // Mise à jour et même version (réparation) : permises.
        controler_installation(&plugin("agenda", "1.1.0"), &racine).unwrap();
        controler_installation(&plugin("agenda", "1.0.1"), &racine).unwrap();
        // Retour en arrière : refusé.
        let e = controler_installation(&plugin("agenda", "1.0.0"), &racine).unwrap_err();
        assert!(e.contains("plus ancienne"), "{e}");
        // Version illisible : refusée.
        assert!(controler_installation(&plugin("agenda", "x"), &racine).is_err());
    }
}
