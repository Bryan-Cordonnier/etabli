//! Paquets de plugins `.etabli-plugin` : un zip qui contient `plugin.zip` (les fichiers du plugin)
//! et `plugin.zip.minisig` (sa signature minisign, faite avec la clé des mises à jour de l'application).
//!
//! Tout se passe en mémoire : rien n'est écrit avant que la signature soit vérifiée, que chaque
//! chemin soit reconnu sûr et que les tailles soient dans les limites. L'application de bureau
//! et le serveur appellent ces fonctions puis écrivent eux-mêmes les fichiers.

use crate::identifiants::plugin_valide;
use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use serde_json::Value;
use std::{
    io::{Cursor, Read},
    path::Component,
};
use zip::ZipArchive;

pub const TAILLE_MAX_PAQUET: u64 = 64 * 1024 * 1024;
pub const TAILLE_MAX_PLUGIN: u64 = 256 * 1024 * 1024;
pub const FICHIERS_MAX: usize = 5000;

/// Un fichier du plugin : chemin relatif avec des « / », jamais absolu, jamais de « .. ».
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FichierPlugin {
    pub chemin: String,
    pub octets: Vec<u8>,
}

fn texte_base64(texte: &str) -> Result<String, String> {
    let octets = base64::engine::general_purpose::STANDARD
        .decode(texte.trim())
        .map_err(|_| "signature ou clé mal encodée".to_string())?;
    String::from_utf8(octets).map_err(|_| "signature ou clé mal encodée".to_string())
}

/// Vérifie une signature minisign (format de `tauri signer sign`, encodée en base64).
pub fn verifier_signature(
    donnees: &[u8],
    signature: &str,
    cle_publique: &str,
) -> Result<(), String> {
    let cle = PublicKey::decode(&texte_base64(cle_publique)?)
        .map_err(|_| "Clé publique invalide.".to_string())?;
    let signature = Signature::decode(&texte_base64(signature)?)
        .map_err(|_| "Signature du plugin illisible.".to_string())?;
    cle.verify(donnees, &signature, true).map_err(|_| {
        "Signature invalide : ce plugin n'a pas été publié par Établi, il n'est pas installé."
            .to_string()
    })
}

/// Vérifie une signature contre plusieurs clés de confiance (rotation de clés, docs/20 §3.5) : une seule suffit.
/// Aucune clé : refus. Une clé illisible est ignorée, les autres restent essayées.
pub fn verifier_signature_parmi<S: AsRef<str>>(
    donnees: &[u8],
    signature: &str,
    cles_publiques: &[S],
) -> Result<(), String> {
    let mut derniere = "Aucune clé de confiance.".to_string();
    for cle in cles_publiques {
        match verifier_signature(donnees, signature, cle.as_ref()) {
            Ok(()) => return Ok(()),
            Err(e) => derniere = e,
        }
    }
    Err(derniere)
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
    ouvrir_paquet_parmi(paquet, &[cle_publique])
}

/// Comme [`ouvrir_paquet`], avec plusieurs clés de confiance : la signature doit venir de l'une d'elles.
pub fn ouvrir_paquet_parmi<S: AsRef<str>>(
    paquet: &[u8],
    cles_publiques: &[S],
) -> Result<Vec<u8>, String> {
    if paquet.len() as u64 > TAILLE_MAX_PAQUET {
        return Err("Paquet trop volumineux.".into());
    }
    let mut archive = ZipArchive::new(Cursor::new(paquet))
        .map_err(|_| "Ce fichier n'est pas un plugin Établi (.etabli-plugin).".to_string())?;
    let plugin = lire_entree(&mut archive, "plugin.zip", TAILLE_MAX_PAQUET)?;
    let signature = lire_entree(&mut archive, "plugin.zip.minisig", 64 * 1024)?;
    let signature =
        String::from_utf8(signature).map_err(|_| "Signature du plugin illisible.".to_string())?;
    verifier_signature_parmi(&plugin, &signature, cles_publiques)?;
    Ok(plugin)
}

/// Décompresse le zip d'un plugin en mémoire, en refusant tout chemin qui sortirait du dossier du
/// plugin, trop de fichiers ou un contenu décompressé trop gros.
pub fn fichiers_du_plugin(zip: &[u8]) -> Result<Vec<FichierPlugin>, String> {
    let mut archive = ZipArchive::new(Cursor::new(zip))
        .map_err(|_| "Plugin illisible dans le paquet.".to_string())?;
    if archive.len() > FICHIERS_MAX {
        return Err("Plugin refusé : trop de fichiers.".into());
    }
    let mut fichiers = Vec::new();
    let mut total = 0u64;
    for i in 0..archive.len() {
        let mut fichier = archive
            .by_index(i)
            .map_err(|e| format!("Plugin illisible : {e}"))?;
        // Le nom brut doit déjà être un chemin relatif propre : on ne se contente pas de la correction de la
        // bibliothèque (qui transforme « /etc/passwd » en « etc/passwd »).
        let brut = fichier.name();
        let suspect = brut.starts_with('/')
            || brut.contains(':')
            || brut.contains('\\')
            || brut.contains('\0')
            || brut.split('/').any(|m| m == "..");
        let relatif = match fichier.enclosed_name() {
            Some(relatif) if !suspect => relatif,
            _ => return Err(format!("Plugin refusé : chemin interdit « {brut} ».")),
        };
        if fichier.is_dir() {
            continue;
        }
        let mut morceaux = Vec::new();
        for composant in relatif.components() {
            match composant {
                Component::Normal(m) => morceaux.push(m.to_string_lossy().into_owned()),
                _ => {
                    return Err(format!(
                        "Plugin refusé : chemin interdit « {} ».",
                        fichier.name()
                    ))
                }
            }
        }
        if morceaux.is_empty()
            || morceaux
                .iter()
                .any(|m| m.contains('\\') || m.contains('\0'))
        {
            return Err(format!(
                "Plugin refusé : chemin interdit « {} ».",
                fichier.name()
            ));
        }
        // La taille annoncée dans le zip peut mentir : on compte ce qui est vraiment lu.
        let reste = TAILLE_MAX_PLUGIN - total;
        let mut octets = Vec::new();
        (&mut fichier)
            .take(reste + 1)
            .read_to_end(&mut octets)
            .map_err(|e| format!("Plugin illisible : {e}"))?;
        total += octets.len() as u64;
        if total > TAILLE_MAX_PLUGIN {
            return Err("Plugin refusé : trop volumineux une fois décompressé.".into());
        }
        fichiers.push(FichierPlugin {
            chemin: morceaux.join("/"),
            octets,
        });
    }
    Ok(fichiers)
}

/// Lit `manifest.json` parmi les fichiers du plugin ; renvoie son identifiant et son contenu.
pub fn lire_manifeste(fichiers: &[FichierPlugin]) -> Result<(String, Value), String> {
    let fichier = fichiers
        .iter()
        .find(|f| f.chemin == "manifest.json")
        .ok_or("Plugin refusé : manifest.json manque à la racine.")?;
    let manifeste: Value = serde_json::from_slice(&fichier.octets)
        .map_err(|e| format!("manifest.json invalide : {e}"))?;
    let id = manifeste
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| plugin_valide(id))
        .ok_or("Plugin refusé : champ « id » du manifeste absent ou invalide.")?
        .to_string();
    Ok((id, manifeste))
}

/// Type de contenu d'un fichier de plugin d'après son extension (pour le servir).
pub fn type_mime(chemin: &str) -> &'static str {
    match chemin
        .rsplit('.')
        .next()
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("wasm") => "application/wasm",
        Some("txt" | "md") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

    /// Paquet d'essai signé avec une clé d'essai (celui des tests de l'application).
    const PAQUET: &[u8] =
        include_bytes!("../../../apps/desktop/src-tauri/fixtures/essai-1.0.0.etabli-plugin");
    const CLE_ESSAI: &str = include_str!("../../../apps/desktop/src-tauri/fixtures/cle-essai.pub");

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
    fn paquet_signe_ouvert_et_lu() {
        let zip = ouvrir_paquet(PAQUET, CLE_ESSAI).expect("signature d'essai valide");
        let fichiers = fichiers_du_plugin(&zip).unwrap();
        let (id, manifeste) = lire_manifeste(&fichiers).unwrap();
        assert_eq!(id, "essai");
        assert!(manifeste.get("miniApps").is_some());
        assert!(fichiers
            .iter()
            .any(|f| f.chemin == "apps/bonjour/index.html"));
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
        let conf: Value = serde_json::from_str(include_str!(
            "../../../apps/desktop/src-tauri/tauri.conf.json"
        ))
        .unwrap();
        let cle = conf["plugins"]["updater"]["pubkey"].as_str().unwrap();
        assert!(ouvrir_paquet(PAQUET, cle).is_err());
    }

    #[test]
    fn fichiers_quelconques_refuses() {
        assert!(ouvrir_paquet(b"pas un zip", CLE_ESSAI).is_err());
        assert!(ouvrir_paquet(&zip_de(&[("plugin.zip", b"x")]), CLE_ESSAI).is_err());
        assert!(ouvrir_paquet(
            &zip_de(&[("plugin.zip", b"x"), ("plugin.zip.minisig", b"x")]),
            CLE_ESSAI
        )
        .is_err());
    }

    #[test]
    fn chemins_hors_du_dossier_refuses() {
        for nom in ["../evil.txt", "/etc/passwd", "a/../../b.txt", "C:/x.txt"] {
            let zip = zip_de(&[("manifest.json", b"{}"), (nom, b"x")]);
            assert!(
                fichiers_du_plugin(&zip).is_err(),
                "{nom} aurait dû être refusé"
            );
        }
        assert!(fichiers_du_plugin(&zip_de(&[("a\\b.txt", b"x")])).is_err());
    }

    #[test]
    fn manifeste_invalide_refuse() {
        let sans_id =
            fichiers_du_plugin(&zip_de(&[("manifest.json", br#"{"name":"x"}"#)])).unwrap();
        assert!(lire_manifeste(&sans_id).is_err());
        let mauvais_id =
            fichiers_du_plugin(&zip_de(&[("manifest.json", br#"{"id":"../x"}"#)])).unwrap();
        assert!(lire_manifeste(&mauvais_id).is_err());
        let absent = fichiers_du_plugin(&zip_de(&[("autre.json", b"{}")])).unwrap();
        assert!(lire_manifeste(&absent).is_err());
        let casse = fichiers_du_plugin(&zip_de(&[("manifest.json", b"{pas du json")])).unwrap();
        assert!(lire_manifeste(&casse).is_err());
    }

    #[test]
    fn trop_de_fichiers_refuse() {
        let noms: Vec<String> = (0..=FICHIERS_MAX).map(|i| format!("f{i}.txt")).collect();
        let paires: Vec<(&str, &[u8])> = noms.iter().map(|n| (n.as_str(), &b"x"[..])).collect();
        assert!(fichiers_du_plugin(&zip_de(&paires))
            .unwrap_err()
            .contains("trop de fichiers"));
    }

    #[test]
    fn types_mime() {
        assert_eq!(type_mime("apps/a/index.html"), "text/html; charset=utf-8");
        assert_eq!(type_mime("x.WASM"), "application/wasm");
        assert_eq!(type_mime("sans-extension"), "application/octet-stream");
    }
}
