//! Catalogue de plugins (docs/13 et docs/14) : lecture du catalogue publié sur GitHub,
//! installation, mise à jour et désinstallation des plugins, sans redémarrer.
//!
//! Un paquet `.etabli-plugin` est un zip qui contient `plugin.zip` (les fichiers du plugin) et
//! `plugin.zip.minisig` (sa signature, faite avec la clé des mises à jour de l'application). Rien
//! n'est écrit sur le disque avant que la signature soit vérifiée avec la clé publique de
//! `tauri.conf.json`. Seul le moteur accède au réseau, jamais une mini-app.

use crate::{plugins, AppState};
use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use serde_json::{json, Value};
use std::{
    fs,
    io::{Cursor, Read},
    path::Path,
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use zip::ZipArchive;

/// Catalogue des plugins officiels : Release « catalogue » du dépôt (voir publier-plugin.yml).
const CATALOGUE_URL: &str =
    "https://github.com/Bryan-Cordonnier/etabli/releases/download/catalogue/catalogue.json";
/// Seules adresses de téléchargement acceptées pour un paquet.
const PREFIXE: &str = "https://github.com/Bryan-Cordonnier/etabli/releases/download/";

const TAILLE_MAX_PAQUET: u64 = 64 * 1024 * 1024;
const TAILLE_MAX_PLUGIN: u64 = 256 * 1024 * 1024;
const FICHIERS_MAX: usize = 5000;

/// Événement envoyé à toutes les fenêtres quand la liste des plugins a changé.
const PLUGINS_CHANGES: &str = "etabli:plugins";
/// Progression d'un téléchargement : `{ id, pourcent }`.
const PROGRESSION: &str = "etabli:installation";

// ——— Paquets ———

fn texte_base64(texte: &str) -> Result<String, String> {
    let octets = base64::engine::general_purpose::STANDARD
        .decode(texte.trim())
        .map_err(|_| "signature ou clé mal encodée".to_string())?;
    String::from_utf8(octets).map_err(|_| "signature ou clé mal encodée".to_string())
}

/// Vérifie une signature minisign (format de `tauri signer sign`, encodée en base64).
fn verifier(donnees: &[u8], signature: &str, cle_publique: &str) -> Result<(), String> {
    let cle = PublicKey::decode(&texte_base64(cle_publique)?)
        .map_err(|_| "Clé publique invalide dans tauri.conf.json.".to_string())?;
    let signature = Signature::decode(&texte_base64(signature)?)
        .map_err(|_| "Signature du plugin illisible.".to_string())?;
    cle.verify(donnees, &signature, true).map_err(|_| {
        "Signature invalide : ce plugin n'a pas été publié par Établi, il n'est pas installé."
            .to_string()
    })
}

fn lire_entree(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    nom: &str,
    max: u64,
) -> Result<Vec<u8>, String> {
    let fichier = archive
        .by_name(nom)
        .map_err(|_| format!("Paquet incomplet : « {nom} » manque."))?;
    let mut octets = Vec::new();
    fichier
        .take(max + 1)
        .read_to_end(&mut octets)
        .map_err(|e| format!("Paquet illisible : {e}"))?;
    if octets.len() as u64 > max {
        return Err("Paquet trop volumineux.".into());
    }
    Ok(octets)
}

/// Contrôle un paquet `.etabli-plugin` et renvoie le zip du plugin, une fois la signature vérifiée.
pub fn ouvrir_paquet(paquet: &[u8], cle_publique: &str) -> Result<Vec<u8>, String> {
    let mut archive = ZipArchive::new(Cursor::new(paquet))
        .map_err(|_| "Ce fichier n'est pas un plugin Établi (.etabli-plugin).".to_string())?;
    let plugin = lire_entree(&mut archive, "plugin.zip", TAILLE_MAX_PAQUET)?;
    let signature = lire_entree(&mut archive, "plugin.zip.minisig", 64 * 1024)?;
    let signature =
        String::from_utf8(signature).map_err(|_| "Signature du plugin illisible.".to_string())?;
    verifier(&plugin, &signature, cle_publique)?;
    Ok(plugin)
}

/// Décompresse le zip d'un plugin dans `dossier`, en refusant tout chemin qui en sortirait.
fn extraire(zip: &[u8], dossier: &Path) -> Result<(), String> {
    let mut archive = ZipArchive::new(Cursor::new(zip))
        .map_err(|_| "Plugin illisible dans le paquet.".to_string())?;
    if archive.len() > FICHIERS_MAX {
        return Err("Plugin refusé : trop de fichiers.".into());
    }
    let mut total = 0u64;
    for i in 0..archive.len() {
        let mut fichier = archive
            .by_index(i)
            .map_err(|e| format!("Plugin illisible : {e}"))?;
        let Some(relatif) = fichier.enclosed_name() else {
            return Err(format!(
                "Plugin refusé : chemin interdit « {} ».",
                fichier.name()
            ));
        };
        let cible = dossier.join(relatif);
        if fichier.is_dir() {
            fs::create_dir_all(&cible).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = cible.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut sortie = fs::File::create(&cible).map_err(|e| e.to_string())?;
        // La taille annoncée dans le zip peut mentir : on compte ce qui est vraiment écrit.
        let reste = TAILLE_MAX_PLUGIN - total;
        let ecrit = std::io::copy(&mut (&mut fichier).take(reste + 1), &mut sortie)
            .map_err(|e| format!("Plugin illisible : {e}"))?;
        total += ecrit;
        if total > TAILLE_MAX_PLUGIN {
            return Err("Plugin refusé : trop volumineux une fois décompressé.".into());
        }
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
    let jeton = jeton();
    let temporaire = racine.join(format!(".installation-{jeton}"));
    let resultat = (|| {
        extraire(zip, &temporaire)?;
        let (id, _) =
            plugins::read_manifest(&temporaire).map_err(|e| format!("Plugin invalide : {e}"))?;
        if let Some(attendu) = attendu {
            if attendu != id {
                return Err(format!(
                    "Le paquet contient le plugin « {id} » au lieu de « {attendu} »."
                ));
            }
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
        Ok(id)
    })();
    if resultat.is_err() {
        let _ = fs::remove_dir_all(&temporaire);
    }
    resultat
}

/// Désinstalle un plugin du catalogue : son dossier disparaît, pas les calculs faits avec
/// (ils sont dans le dossier des documents).
pub fn desinstaller(racine: &Path, id: &str) -> Result<(), String> {
    let dossier = racine.join(id);
    if !plugins::valid_id(id) || !dossier.is_dir() {
        return Err(
            "Ce plugin n'a pas été installé depuis le catalogue : rien à désinstaller.".into(),
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
        if entree.file_name().to_string_lossy().starts_with('.') && entree.path().is_dir() {
            let _ = fs::remove_dir_all(entree.path());
        }
    }
}

// ——— Réseau ———

fn client() -> Result<reqwest::Client, String> {
    // Même fournisseur TLS que le module de mise à jour.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .user_agent(concat!("Etabli/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

fn injoignable(erreur: reqwest::Error) -> String {
    if erreur.status().is_some_and(|s| s.as_u16() == 404) {
        "Catalogue introuvable sur GitHub.".into()
    } else {
        "Catalogue injoignable : vérifiez la connexion à Internet.".into()
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

/// Lit le catalogue publié (liste des plugins officiels, avec leur version et leur adresse).
#[tauri::command]
pub async fn catalogue_lire() -> Result<Value, String> {
    let texte = client()?
        .get(CATALOGUE_URL)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(injoignable)?
        .text()
        .await
        .map_err(injoignable)?;
    serde_json::from_str(&texte).map_err(|_| "Catalogue illisible.".to_string())
}

/// Télécharge, vérifie et installe (ou met à jour) un plugin du catalogue.
#[tauri::command]
pub async fn plugin_installer(app: AppHandle, id: String, url: String) -> Result<String, String> {
    if !plugins::valid_id(&id) || !url.starts_with(PREFIXE) {
        return Err("Adresse de téléchargement refusée.".into());
    }
    let mut reponse = client()?
        .get(&url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|_| "Téléchargement impossible : vérifiez la connexion à Internet.".to_string())?;
    let total = reponse.content_length().filter(|&t| t > 0);
    let mut paquet: Vec<u8> = Vec::new();
    let mut annonce = 0u64;
    while let Some(morceau) = reponse
        .chunk()
        .await
        .map_err(|_| "Téléchargement interrompu.".to_string())?
    {
        paquet.extend_from_slice(&morceau);
        if paquet.len() as u64 > TAILLE_MAX_PAQUET {
            return Err("Paquet trop volumineux.".into());
        }
        if let Some(pourcent) = total.and_then(|t| (paquet.len() as u64 * 100).checked_div(t)) {
            if pourcent >= annonce + 10 {
                annonce = pourcent;
                let _ = app.emit(PROGRESSION, json!({ "id": id, "pourcent": pourcent }));
            }
        }
    }
    let zip = ouvrir_paquet(&paquet, &cle_publique(&app)?)?;
    let racine = app.state::<AppState>().paths.catalogue.clone();
    let id = tauri::async_runtime::spawn_blocking(move || installer(&zip, &racine, Some(&id)))
        .await
        .map_err(|e| e.to_string())??;
    plugins_changes(&app);
    Ok(id)
}

/// Installe un plugin depuis un fichier `.etabli-plugin` (clé USB, réseau sans GitHub).
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
    let racine = app.state::<AppState>().paths.catalogue.clone();
    let id = tauri::async_runtime::spawn_blocking(move || installer(&zip, &racine, None))
        .await
        .map_err(|e| e.to_string())??;
    plugins_changes(&app);
    Ok(Some(id))
}

/// Désinstalle un plugin installé depuis le catalogue (les calculs restent).
#[tauri::command]
pub fn plugin_desinstaller(app: AppHandle, id: String) -> Result<(), String> {
    let racine = app.state::<AppState>().paths.catalogue.clone();
    desinstaller(&racine, &id)?;
    plugins_changes(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::tests::scratch;
    use std::io::Write;
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

    fn entree(paquet: &[u8], nom: &str) -> Vec<u8> {
        let mut archive = ZipArchive::new(Cursor::new(paquet)).unwrap();
        lire_entree(&mut archive, nom, TAILLE_MAX_PAQUET).unwrap()
    }

    #[test]
    fn paquet_signe_installe() {
        let racine = scratch("catalogue-installer");
        let zip = ouvrir_paquet(PAQUET, CLE_ESSAI).expect("signature d'essai valide");
        let id = installer(&zip, &racine, Some("essai")).unwrap();
        assert_eq!(id, "essai");
        assert!(racine.join("essai/manifest.json").is_file());
        assert!(racine.join("essai/apps/bonjour/index.html").is_file());
        // Aucun dossier temporaire ne reste.
        assert_eq!(fs::read_dir(&racine).unwrap().count(), 1);
    }

    #[test]
    fn paquet_modifie_refuse() {
        let mut plugin = entree(PAQUET, "plugin.zip");
        let signature = entree(PAQUET, "plugin.zip.minisig");
        let milieu = plugin.len() / 2;
        plugin[milieu] ^= 0xff;
        let falsifie = zip_de(&[("plugin.zip", &plugin), ("plugin.zip.minisig", &signature)]);
        assert!(ouvrir_paquet(&falsifie, CLE_ESSAI)
            .unwrap_err()
            .contains("Signature invalide"));
    }

    #[test]
    fn autre_cle_refusee() {
        // Clé publique de l'application : le paquet d'essai n'est pas signé avec.
        let conf: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let cle = conf["plugins"]["updater"]["pubkey"].as_str().unwrap();
        assert!(ouvrir_paquet(PAQUET, cle).is_err());
    }

    #[test]
    fn fichier_quelconque_refuse() {
        assert!(ouvrir_paquet(b"pas un zip", CLE_ESSAI).is_err());
        let sans_signature = zip_de(&[("plugin.zip", b"x")]);
        assert!(ouvrir_paquet(&sans_signature, CLE_ESSAI)
            .unwrap_err()
            .contains("manque"));
    }

    #[test]
    fn chemins_hors_du_dossier_refuses() {
        let racine = scratch("catalogue-evasion");
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
        let racine = scratch("catalogue-maj");
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
        // L'ancienne version est remplacée d'un bloc : ses fichiers disparaissent.
        assert!(!racine.join("outil/a.js").exists());
        assert!(racine.join("outil/b.js").exists());
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
        let racine = scratch("catalogue-nettoyage");
        fs::create_dir_all(racine.join(".installation-abc")).unwrap();
        fs::create_dir_all(racine.join("maths")).unwrap();
        nettoyer(&racine);
        assert!(!racine.join(".installation-abc").exists());
        assert!(racine.join("maths").exists());
    }
}
