//! Catalogue de plugins (docs/13 et docs/14) : lecture du catalogue publié sur GitHub,
//! installation, mise à jour et désinstallation des plugins, sans redémarrer.
//!
//! Un paquet `.etabli-plugin` est un zip qui contient `plugin.zip` (les fichiers du plugin) et
//! `plugin.zip.minisig` (sa signature, faite avec la clé des mises à jour de l'application). Rien
//! n'est écrit sur le disque avant que la signature soit vérifiée avec la clé publique de
//! `tauri.conf.json`. Seul le moteur accède au réseau, jamais une mini-app.

use crate::{plugins, AppState};
use etabli_noyau::{
    catalogue::{comparer_versions, peut_installer, verifier_catalogue, Catalogue, Revocation},
    paquet::{fichiers_du_plugin, lire_manifeste, ouvrir_paquet, TAILLE_MAX_PAQUET},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    cmp::Ordering,
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

/// Catalogue des plugins officiels : Release « catalogue » du dépôt (voir publier-plugin.yml).
const CATALOGUE_URL: &str =
    "https://github.com/Bryan-Cordonnier/etabli/releases/download/catalogue/catalogue.json";
/// Signature du catalogue (format 2, docs/20) ; absente tant que la publication n'est pas passée au format signé.
const SIGNATURE_URL: &str =
    "https://github.com/Bryan-Cordonnier/etabli/releases/download/catalogue/catalogue.json.minisig";
/// Seules adresses de téléchargement acceptées pour un paquet.
const PREFIXE: &str = "https://github.com/Bryan-Cordonnier/etabli/releases/download/";

/// Événement envoyé à toutes les fenêtres quand la liste des plugins a changé.
const PLUGINS_CHANGES: &str = "etabli:plugins";
/// Progression d'un téléchargement : `{ id, pourcent }`.
const PROGRESSION: &str = "etabli:installation";
/// Fichier (dans le dossier de configuration) qui garde la dernière séquence de catalogue vue et ses révocations.
const FICHIER_ETAT: &str = "catalogue-etat.json";

// ——— État du catalogue signé ———

/// Ce que l'application retient du dernier catalogue signé accepté : sa séquence (pour refuser un retour en arrière)
/// et ses révocations (pour refuser d'installer une version révoquée, même hors ligne).
#[derive(Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct EtatCatalogue {
    #[serde(default)]
    pub sequence: u64,
    #[serde(default)]
    pub revocations: Vec<Revocation>,
}

pub fn lire_etat(config: &Path) -> EtatCatalogue {
    fs::read(config.join(FICHIER_ETAT))
        .ok()
        .and_then(|octets| serde_json::from_slice(&octets).ok())
        .unwrap_or_default()
}

fn ecrire_etat(config: &Path, etat: &EtatCatalogue) -> Result<(), String> {
    let octets = serde_json::to_vec_pretty(etat).map_err(|e| e.to_string())?;
    crate::files::write_atomic(&config.join(FICHIER_ETAT), &octets)
        .map_err(|e| format!("Enregistrement impossible : {e}"))
}

fn maintenant() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

/// Lit une réponse du catalogue. Avec une signature : catalogue signé (format 2), vérifié puis retenu. Sans signature :
/// ancien format, accepté seulement tant qu'aucun catalogue signé n'a jamais été vu (sinon on pourrait faire croire à
/// un client à jour que le catalogue n'est plus signé).
pub fn analyser_catalogue(
    octets: &[u8],
    signature: Option<&str>,
    cle_publique: &str,
    maintenant: u64,
    config: &Path,
) -> Result<Value, String> {
    let etat = lire_etat(config);
    match signature {
        Some(signature) => {
            let catalogue =
                verifier_catalogue(octets, signature, cle_publique, maintenant, etat.sequence)
                    .map_err(|e| {
                        if e.contains("expiré") {
                            format!("{e} Vérifiez aussi la date de l'ordinateur.")
                        } else {
                            e
                        }
                    })?;
            ecrire_etat(
                config,
                &EtatCatalogue {
                    sequence: catalogue.sequence,
                    revocations: catalogue.revocations.clone(),
                },
            )?;
            Ok(json!({
                "format": catalogue.format,
                "signe": true,
                "sequence": catalogue.sequence,
                "plugins": catalogue.plugins,
                "revocations": catalogue.revocations,
            }))
        }
        None => {
            if etat.sequence > 0 {
                return Err(
                    "Catalogue refusé : il n'est plus signé alors qu'un catalogue signé a déjà été vu.".into(),
                );
            }
            let mut valeur: Value =
                serde_json::from_slice(octets).map_err(|_| "Catalogue illisible.".to_string())?;
            let objet = valeur
                .as_object_mut()
                .ok_or_else(|| "Catalogue illisible.".to_string())?;
            objet.insert("signe".into(), Value::Bool(false));
            Ok(valeur)
        }
    }
}

// ——— Paquets ———

/// Version installée d'un plugin du catalogue, si elle est lisible.
fn version_installee(racine: &Path, id: &str) -> Option<String> {
    let (_, manifeste) = plugins::read_manifest(&racine.join(id)).ok()?;
    manifeste
        .get("version")
        .and_then(Value::as_str)
        .map(String::from)
}

/// Décide si le plugin contenu dans `zip` peut être installé : jamais une version révoquée, et jamais une version
/// qui n'est pas plus récente que celle installée (retour en arrière). `reinstaller` : réinstaller la même version
/// reste permis (réparer une installation depuis un fichier).
pub fn controler_installation(
    zip: &[u8],
    racine: &Path,
    etat: &EtatCatalogue,
    reinstaller: bool,
) -> Result<(), String> {
    let fichiers = fichiers_du_plugin(zip)?;
    let (id, manifeste) = lire_manifeste(&fichiers)?;
    let candidate = manifeste
        .get("version")
        .and_then(Value::as_str)
        .ok_or("Plugin refusé : « version » absente du manifeste.")?;
    let installee = version_installee(racine, &id);
    let regles = Catalogue {
        format: etabli_noyau::catalogue::FORMAT,
        sequence: etat.sequence,
        expire: u64::MAX,
        plugins: Vec::new(),
        revocations: etat.revocations.clone(),
    };
    let meme_version = installee
        .as_deref()
        .is_some_and(|v| comparer_versions(candidate, v) == Some(Ordering::Equal));
    if reinstaller && meme_version {
        // Même version : seule la révocation peut la refuser.
        return peut_installer(&regles, &id, None, candidate, false);
    }
    peut_installer(&regles, &id, installee.as_deref(), candidate, false)
}

/// Écrit les fichiers d'un plugin sous `dossier`. Les chemins viennent de `fichiers_du_plugin`, qui a déjà refusé
/// tout ce qui sortirait du dossier.
fn ecrire_fichiers(
    fichiers: &[etabli_noyau::paquet::FichierPlugin],
    dossier: &Path,
) -> Result<(), String> {
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

fn injoignable_sans_detail() -> String {
    "Catalogue injoignable : vérifiez la connexion à Internet.".into()
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

/// Lit le catalogue publié (liste des plugins officiels, avec leur version et leur adresse). S'il est signé
/// (docs/20), la signature, l'expiration et la séquence sont vérifiées, et ses révocations retenues.
#[tauri::command]
pub async fn catalogue_lire(app: AppHandle) -> Result<Value, String> {
    let client = client()?;
    let octets = client
        .get(CATALOGUE_URL)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(injoignable)?
        .bytes()
        .await
        .map_err(injoignable)?;
    if octets.len() > etabli_noyau::catalogue::TAILLE_MAX_CATALOGUE {
        return Err("Catalogue trop volumineux.".into());
    }
    // La signature est facultative pendant la migration : son absence (404) donne l'ancien format.
    let signature = match client.get(SIGNATURE_URL).send().await {
        Ok(reponse) if reponse.status().is_success() => {
            Some(reponse.text().await.map_err(injoignable)?)
        }
        Ok(reponse) if reponse.status().as_u16() == 404 => None,
        Ok(_) | Err(_) => return Err(injoignable_sans_detail()),
    };
    let config = app.state::<AppState>().paths.config.clone();
    let cle = cle_publique(&app)?;
    analyser_catalogue(&octets, signature.as_deref(), &cle, maintenant(), &config)
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
    let etat = lire_etat(&app.state::<AppState>().paths.config);
    let id = tauri::async_runtime::spawn_blocking(move || {
        controler_installation(&zip, &racine, &etat, false)?;
        installer(&zip, &racine, Some(&id))
    })
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
    let etat = lire_etat(&app.state::<AppState>().paths.config);
    let id = tauri::async_runtime::spawn_blocking(move || {
        controler_installation(&zip, &racine, &etat, true)?;
        installer(&zip, &racine, None)
    })
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
    use std::io::{Cursor, Write};
    use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

    /// Paquet d'essai signé avec une clé d'essai (scripts/paquet-plugin.mjs --dossier …).
    const PAQUET: &[u8] = include_bytes!("../fixtures/essai-1.0.0.etabli-plugin");
    const CLE_ESSAI: &str = include_str!("../fixtures/cle-essai.pub");
    /// Catalogue signé d'essai (sequence 7, expire en 2100, révoque tracage < 1.2.0 et machines 1.0.0).
    const CATALOGUE: &[u8] =
        include_bytes!("../../../../crates/noyau/fixtures/catalogue-essai.json");
    const SIGNATURE: &str =
        include_str!("../../../../crates/noyau/fixtures/catalogue-essai.json.sig");
    const CLE_CATALOGUE: &str =
        include_str!("../../../../crates/noyau/fixtures/cle-catalogue-essai.pub");
    const MAINTENANT: u64 = 1_790_000_000;

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
    fn paquet_non_signe_par_notre_cle_refuse() {
        // Clé publique de l'application : le paquet d'essai n'est pas signé avec.
        let conf: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let cle = conf["plugins"]["updater"]["pubkey"].as_str().unwrap();
        assert!(ouvrir_paquet(PAQUET, cle).is_err());
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

    #[test]
    fn catalogue_signe_lu_et_retenu() {
        let config = scratch("catalogue-etat-signe");
        let lu = analyser_catalogue(
            CATALOGUE,
            Some(SIGNATURE),
            CLE_CATALOGUE,
            MAINTENANT,
            &config,
        )
        .unwrap();
        assert_eq!(lu["signe"], true);
        assert_eq!(lu["sequence"], 7);
        assert_eq!(lu["plugins"].as_array().unwrap().len(), 2);
        // La séquence et les révocations sont gardées pour la suite (même hors ligne).
        let etat = lire_etat(&config);
        assert_eq!(etat.sequence, 7);
        assert_eq!(etat.revocations.len(), 2);
    }

    #[test]
    fn catalogue_signe_falsifie_ou_etranger_refuse() {
        let config = scratch("catalogue-etat-refus");
        let mut modifie = CATALOGUE.to_vec();
        modifie.extend_from_slice(b" ");
        assert!(analyser_catalogue(
            &modifie,
            Some(SIGNATURE),
            CLE_CATALOGUE,
            MAINTENANT,
            &config
        )
        .is_err());
        assert!(
            analyser_catalogue(CATALOGUE, Some(SIGNATURE), CLE_ESSAI, MAINTENANT, &config).is_err()
        );
        // Rien n'a été retenu.
        assert_eq!(lire_etat(&config), EtatCatalogue::default());
    }

    #[test]
    fn catalogue_expire_refuse_avec_un_conseil() {
        let config = scratch("catalogue-etat-expire");
        let e = analyser_catalogue(
            CATALOGUE,
            Some(SIGNATURE),
            CLE_CATALOGUE,
            4_102_444_800,
            &config,
        )
        .unwrap_err();
        assert!(
            e.contains("expiré") && e.contains("date de l'ordinateur"),
            "{e}"
        );
    }

    #[test]
    fn retour_en_arriere_de_la_sequence_refuse() {
        let config = scratch("catalogue-etat-sequence");
        ecrire_etat(
            &config,
            &EtatCatalogue {
                sequence: 8,
                revocations: Vec::new(),
            },
        )
        .unwrap();
        let e = analyser_catalogue(
            CATALOGUE,
            Some(SIGNATURE),
            CLE_CATALOGUE,
            MAINTENANT,
            &config,
        )
        .unwrap_err();
        assert!(e.contains("retour en arrière"), "{e}");
        // L'état n'a pas été écrasé par un catalogue plus ancien.
        assert_eq!(lire_etat(&config).sequence, 8);
    }

    #[test]
    fn ancien_format_accepte_tant_qu_aucun_catalogue_signe_na_ete_vu() {
        let config = scratch("catalogue-etat-ancien");
        let ancien = br#"{"format":1,"plugins":[{"id":"maths","version":"1.0.0","url":"x"}]}"#;
        let lu = analyser_catalogue(ancien, None, CLE_CATALOGUE, MAINTENANT, &config).unwrap();
        assert_eq!(lu["signe"], false);
        assert_eq!(lu["plugins"].as_array().unwrap().len(), 1);

        // Après un catalogue signé, un catalogue non signé est refusé (on ne peut pas « désigner » un client à jour).
        analyser_catalogue(
            CATALOGUE,
            Some(SIGNATURE),
            CLE_CATALOGUE,
            MAINTENANT,
            &config,
        )
        .unwrap();
        let e = analyser_catalogue(ancien, None, CLE_CATALOGUE, MAINTENANT, &config).unwrap_err();
        assert!(e.contains("plus signé"), "{e}");
        assert!(analyser_catalogue(
            b"pas du json",
            None,
            CLE_CATALOGUE,
            MAINTENANT,
            &scratch("catalogue-etat-vide")
        )
        .is_err());
    }

    #[test]
    fn controle_des_versions_a_l_installation() {
        let racine = scratch("catalogue-controle");
        let config = scratch("catalogue-controle-config");
        analyser_catalogue(
            CATALOGUE,
            Some(SIGNATURE),
            CLE_CATALOGUE,
            MAINTENANT,
            &config,
        )
        .unwrap();
        let etat = lire_etat(&config);

        // Première installation et mise à jour : permises.
        controler_installation(&plugin("maths", "1.0.1"), &racine, &etat, false).unwrap();
        installer(&plugin("maths", "1.0.1"), &racine, None).unwrap();
        controler_installation(&plugin("maths", "1.1.0"), &racine, &etat, false).unwrap();
        // Retour en arrière et même version : refusés ; la même version est permise depuis un fichier (réparation).
        assert!(controler_installation(&plugin("maths", "1.0.0"), &racine, &etat, false).is_err());
        assert!(controler_installation(&plugin("maths", "1.0.1"), &racine, &etat, false).is_err());
        assert!(controler_installation(&plugin("maths", "1.0.0"), &racine, &etat, true).is_err());
        controler_installation(&plugin("maths", "1.0.1"), &racine, &etat, true).unwrap();
        // Une version révoquée n'est jamais installée, même depuis un fichier, même en première installation.
        let e =
            controler_installation(&plugin("tracage", "1.1.1"), &racine, &etat, true).unwrap_err();
        assert!(e.contains("révoquée"), "{e}");
        assert!(
            controler_installation(&plugin("machines", "1.0.0"), &racine, &etat, true).is_err()
        );
        controler_installation(&plugin("tracage", "1.2.0"), &racine, &etat, false).unwrap();
        // Manifeste sans version : refusé.
        let sans_version = zip_de(&[("manifest.json", br#"{"id":"maths"}"#)]);
        assert!(controler_installation(&sans_version, &racine, &etat, false).is_err());
    }
}
