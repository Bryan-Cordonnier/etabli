//! Plugins livrés avec la distribution : l'archive faite par `build.rs` est écrite dans le dossier `integres` de la
//! configuration au démarrage, puis lue comme n'importe quel dossier de plugins. Vide pour le moteur seul.

use std::{
    fs,
    io::{Cursor, Read},
    path::Path,
};
use zip::ZipArchive;

/// Archive (zip sans compression) : `<plugin>/<fichier>`.
const ARCHIVE: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/plugins-integres.zip"));
const EMPREINTE: &str = env!("ETABLE_INTEGRES_EMPREINTE");
const MARQUE: &str = ".empreinte";
/// Un plugin livré ne dépasse jamais cette taille décompressée (l'archive vient de la compilation, pas du réseau).
const TAILLE_MAX: u64 = 256 * 1024 * 1024;

/// Écrit les plugins livrés sous `racine`, sauf s'ils y sont déjà à l'identique.
pub fn extraire(racine: &Path) -> Result<(), String> {
    extraire_archive(ARCHIVE, EMPREINTE, racine)
}

fn extraire_archive(archive: &[u8], empreinte: &str, racine: &Path) -> Result<(), String> {
    let mut zip =
        ZipArchive::new(Cursor::new(archive)).map_err(|e| format!("archive des plugins : {e}"))?;
    if zip.is_empty() {
        // Aucun plugin livré : un dossier laissé par une distribution précédente ne doit pas survivre.
        let _ = fs::remove_dir_all(racine);
        return Ok(());
    }
    if fs::read_to_string(racine.join(MARQUE)).is_ok_and(|v| v == empreinte) {
        return Ok(());
    }
    let temporaire = racine.with_extension("nouveau");
    let _ = fs::remove_dir_all(&temporaire);
    fs::create_dir_all(&temporaire).map_err(|e| e.to_string())?;
    let mut total = 0u64;
    for i in 0..zip.len() {
        let mut entree = zip.by_index(i).map_err(|e| e.to_string())?;
        // `enclosed_name` refuse tout chemin qui sortirait du dossier.
        let Some(relatif) = entree.enclosed_name() else {
            continue;
        };
        if entree.is_dir() {
            continue;
        }
        let cible = temporaire.join(relatif);
        if let Some(parent) = cible.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut octets = Vec::new();
        entree
            .by_ref()
            .take(TAILLE_MAX + 1)
            .read_to_end(&mut octets)
            .map_err(|e| e.to_string())?;
        total += octets.len() as u64;
        if total > TAILLE_MAX {
            let _ = fs::remove_dir_all(&temporaire);
            return Err("plugins livrés trop volumineux".into());
        }
        fs::write(&cible, octets).map_err(|e| e.to_string())?;
    }
    fs::write(temporaire.join(MARQUE), empreinte).map_err(|e| e.to_string())?;
    let _ = fs::remove_dir_all(racine);
    fs::rename(&temporaire, racine).map_err(|e| format!("plugins livrés : {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::tests::scratch;
    use std::io::Write;
    use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

    fn archive(fichiers: &[(&str, &[u8])]) -> Vec<u8> {
        let mut z = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        for (nom, contenu) in fichiers {
            z.start_file(*nom, options).unwrap();
            z.write_all(contenu).unwrap();
        }
        z.finish().unwrap().into_inner()
    }

    #[test]
    fn extrait_puis_ne_reecrit_pas_a_l_identique() {
        let racine = scratch("integres-extraire").join("integres");
        let a = archive(&[
            ("agenda/manifest.json", b"{}"),
            ("agenda/apps/x/index.html", b"<p>"),
        ]);
        extraire_archive(&a, "aaa", &racine).unwrap();
        assert!(racine.join("agenda/manifest.json").is_file());
        assert!(racine.join("agenda/apps/x/index.html").is_file());
        // Même empreinte : un fichier modifié à la main n'est pas écrasé.
        fs::write(racine.join("agenda/manifest.json"), b"modifie").unwrap();
        extraire_archive(&a, "aaa", &racine).unwrap();
        assert_eq!(
            fs::read(racine.join("agenda/manifest.json")).unwrap(),
            b"modifie"
        );
        // Nouvelle empreinte : tout est remplacé, rien de l'ancien ne reste.
        let b = archive(&[("budget/manifest.json", b"{}")]);
        extraire_archive(&b, "bbb", &racine).unwrap();
        assert!(!racine.join("agenda").exists());
        assert!(racine.join("budget/manifest.json").is_file());
    }

    #[test]
    fn archive_vide_efface_les_anciens_plugins_livres() {
        let racine = scratch("integres-vide").join("integres");
        fs::create_dir_all(racine.join("ancien")).unwrap();
        extraire_archive(&archive(&[]), "x", &racine).unwrap();
        assert!(!racine.exists());
    }

    #[test]
    fn chemins_hors_du_dossier_ignores() {
        let racine = scratch("integres-evasion").join("integres");
        let a = archive(&[("../dehors.txt", b"non"), ("ok/manifest.json", b"{}")]);
        extraire_archive(&a, "c", &racine).unwrap();
        assert!(!racine.parent().unwrap().join("dehors.txt").exists());
        assert!(racine.join("ok/manifest.json").is_file());
    }

    #[test]
    fn l_archive_du_moteur_seul_est_vide() {
        // Sans `ETABLE_PLUGINS_DIR` à la compilation, le moteur ne livre aucun plugin.
        if std::env::var_os("ETABLE_PLUGINS_DIR").is_none() {
            assert!(ZipArchive::new(Cursor::new(ARCHIVE)).unwrap().is_empty());
        }
    }
}
