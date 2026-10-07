// Compile les ressources de Tauri, puis range dans une archive les plugins que la distribution livre avec l'application.
//
// Le moteur ne contient aucun plugin. Une distribution (Quotidien, par exemple) donne le dossier de ses plugins dans
// `ETABLE_PLUGINS_DIR` : chaque sous-dossier est un plugin compilé (son `dist/`, ou le dossier lui-même s'il contient
// `manifest.json`). L'archive est incluse dans le binaire (`integres.rs`) : même chemin sur Windows et sur Android, où
// les ressources de l'APK ne sont pas de vrais fichiers.
use std::{
    env, fs,
    io::{Cursor, Write},
    path::{Path, PathBuf},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

fn fichiers(dossier: &Path, base: &Path, sortie: &mut Vec<(String, PathBuf)>) {
    let Ok(entrees) = fs::read_dir(dossier) else {
        return;
    };
    let mut chemins: Vec<PathBuf> = entrees.filter_map(Result::ok).map(|e| e.path()).collect();
    chemins.sort();
    for chemin in chemins {
        if chemin.is_dir() {
            fichiers(&chemin, base, sortie);
        } else if let Ok(relatif) = chemin.strip_prefix(base) {
            sortie.push((relatif.to_string_lossy().replace('\\', "/"), chemin));
        }
    }
}

fn main() {
    tauri_build::build();
    println!("cargo:rerun-if-env-changed=ETABLE_PLUGINS_DIR");

    let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    if let Some(dossier) = env::var_os("ETABLE_PLUGINS_DIR").map(PathBuf::from) {
        println!("cargo:rerun-if-changed={}", dossier.display());
        let mut plugins: Vec<PathBuf> = fs::read_dir(&dossier)
            .map(|e| e.filter_map(Result::ok).map(|e| e.path()).collect())
            .unwrap_or_default();
        plugins.sort();
        for plugin in plugins.into_iter().filter(|p| p.is_dir()) {
            let Some(id) = plugin
                .file_name()
                .and_then(|n| n.to_str())
                .map(String::from)
            else {
                continue;
            };
            let Some(racine) = [plugin.join("dist"), plugin.clone()]
                .into_iter()
                .find(|d| d.join("manifest.json").is_file())
            else {
                continue;
            };
            let mut liste = Vec::new();
            fichiers(&racine, &racine, &mut liste);
            for (relatif, chemin) in liste {
                archive
                    .start_file(format!("{id}/{relatif}"), options)
                    .expect("entrée d'archive");
                archive
                    .write_all(&fs::read(&chemin).expect("lecture d'un fichier de plugin"))
                    .expect("écriture dans l'archive");
            }
        }
    }
    let octets = archive.finish().expect("archive des plugins").into_inner();

    // Empreinte (FNV-1a 64 bits) : l'application ne réécrit les plugins livrés que si l'archive a changé.
    let mut empreinte: u64 = 0xcbf2_9ce4_8422_2325;
    for octet in &octets {
        empreinte ^= u64::from(*octet);
        empreinte = empreinte.wrapping_mul(0x0100_0000_01b3);
    }
    println!("cargo:rustc-env=ETABLE_INTEGRES_EMPREINTE={empreinte:016x}");
    let sortie = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR")).join("plugins-integres.zip");
    fs::write(sortie, octets).expect("écriture de l'archive");
}
