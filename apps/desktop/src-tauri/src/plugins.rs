//! Chargement des plugins et service de leurs fichiers (cahier des charges, section 8).
//!
//! Chaque plugin est un dossier contenant `manifest.json`. Ses fichiers sont servis à
//! l'adresse `http://plugins.localhost/<id>/<chemin>`, une origine distincte de l'application :
//! une mini-app affichée dans un cadre isolé ne peut donc ni lire le disque, ni appeler Rust.

use serde::Serialize;
use serde_json::Value;
use std::{
    borrow::Cow,
    fs,
    path::{Component, Path, PathBuf},
};
use tauri::http::{header, Response, StatusCode};

pub const SCHEME: &str = "plugins";

/// Politique de sécurité des pages de plugins : aucun accès réseau, seulement leurs propres fichiers.
const PLUGIN_CSP: &str = "default-src 'none'; \
    script-src 'self' http://plugins.localhost plugins: 'wasm-unsafe-eval'; \
    style-src 'self' http://plugins.localhost plugins: 'unsafe-inline'; \
    img-src 'self' http://plugins.localhost plugins: data: blob:; \
    font-src 'self' http://plugins.localhost plugins: data:; \
    worker-src 'self' http://plugins.localhost plugins: blob:; \
    connect-src 'none'; base-uri 'none'; form-action 'none'";

pub struct LoadedPlugin {
    pub id: String,
    /// Dossier qui contient `manifest.json` et les fichiers servis.
    pub root: PathBuf,
    pub manifest: Value,
    pub official: bool,
}

#[derive(Serialize)]
pub struct PluginInfo {
    manifest: Value,
    official: bool,
}

/// Identifiant de plugin ou de mini-app : minuscules, chiffres et tirets.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Cherche les plugins dans chaque dossier racine. Pour un plugin compilé, le manifeste est
/// dans `dist/` ; pour un plugin sans code, directement dans son dossier.
pub fn scan(roots: &[(PathBuf, bool)]) -> Vec<LoadedPlugin> {
    let mut found: Vec<LoadedPlugin> = Vec::new();
    for (root, official) in roots {
        let Ok(entries) = fs::read_dir(root) else {
            continue;
        };
        let mut dirs: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        dirs.sort();

        for dir in dirs {
            let Some(plugin_root) = [dir.join("dist"), dir.clone()]
                .into_iter()
                .find(|d| d.join("manifest.json").is_file())
            else {
                continue;
            };
            match read_manifest(&plugin_root) {
                Ok((id, _)) if found.iter().any(|p| p.id == id) => {
                    log::warn!("Plugin « {id} » ignoré : identifiant déjà utilisé");
                }
                Ok((id, manifest)) => found.push(LoadedPlugin {
                    id,
                    root: plugin_root,
                    manifest,
                    official: *official,
                }),
                Err(err) => log::warn!("Plugin ignoré ({}) : {err}", dir.display()),
            }
        }
    }
    found
}

fn read_manifest(root: &Path) -> Result<(String, Value), String> {
    let text = fs::read_to_string(root.join("manifest.json")).map_err(|e| e.to_string())?;
    let manifest: Value =
        serde_json::from_str(&text).map_err(|e| format!("manifest.json invalide : {e}"))?;
    let id = manifest
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| valid_id(id))
        .ok_or("champ « id » absent ou invalide")?
        .to_string();
    Ok((id, manifest))
}

#[tauri::command]
pub fn plugins_list(state: tauri::State<'_, crate::AppState>) -> Vec<PluginInfo> {
    state
        .plugins
        .iter()
        .map(|p| PluginInfo {
            manifest: p.manifest.clone(),
            official: p.official,
        })
        .collect()
}

/// Répond à une requête `http://plugins.localhost/<id>/<chemin>`.
pub fn serve(plugins: &[LoadedPlugin], uri_path: &str) -> Response<Cow<'static, [u8]>> {
    let path = percent_decode(uri_path);
    let mut parts = path.trim_start_matches('/').splitn(2, '/');
    let (Some(id), Some(relative)) = (parts.next(), parts.next()) else {
        return not_found();
    };
    let Some(plugin) = plugins.iter().find(|p| p.id == id) else {
        return not_found();
    };
    let Some(file) = safe_join(&plugin.root, relative) else {
        return not_found();
    };
    let Ok(bytes) = fs::read(&file) else {
        return not_found();
    };

    let mime = mime_for(&file);
    let mut response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        // Le cadre isolé a une origine opaque : ses scripts modules sont des requêtes CORS.
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff");
    if mime.starts_with("text/html") {
        response = response.header(header::CONTENT_SECURITY_POLICY, PLUGIN_CSP);
    }
    response
        .body(Cow::Owned(bytes))
        .unwrap_or_else(|_| not_found())
}

/// Refuse tout chemin qui sortirait du dossier du plugin (`..`, chemin absolu, lecteur).
fn safe_join(root: &Path, relative: &str) -> Option<PathBuf> {
    let relative = Path::new(relative);
    if relative
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return None;
    }
    Some(root.join(relative))
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push(high << 4 | low);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex(byte: u8) -> Option<u8> {
    (byte as char).to_digit(16).map(|d| d as u8)
}

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
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
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}

fn not_found() -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(Cow::Borrowed(&b"introuvable"[..]))
        .expect("réponse 404 valide")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::tests::scratch;

    #[test]
    fn ids_are_restricted() {
        assert!(valid_id("maths"));
        assert!(valid_id("debit-tubes-2"));
        assert!(!valid_id(""));
        assert!(!valid_id("Maths"));
        assert!(!valid_id("../x"));
    }

    #[test]
    fn paths_cannot_escape_plugin_folder() {
        let root = Path::new("C:/plugins/maths");
        assert!(safe_join(root, "apps/pythagore/index.html").is_some());
        assert!(safe_join(root, "../economie/manifest.json").is_none());
        assert!(safe_join(root, "apps/../../secret").is_none());
        assert!(safe_join(root, "/etc/passwd").is_none());
    }

    #[test]
    fn percent_decoding() {
        assert_eq!(
            percent_decode("/maths/mon%20fichier.js"),
            "/maths/mon fichier.js"
        );
        assert_eq!(percent_decode("/a%2"), "/a%2");
        assert_eq!(percent_decode("/%C3%A9"), "/é");
    }

    #[test]
    fn scan_prefers_dist_and_skips_duplicates() {
        let root = scratch("plugins-scan");
        fs::create_dir_all(root.join("maths/dist")).unwrap();
        fs::write(root.join("maths/dist/manifest.json"), r#"{"id":"maths"}"#).unwrap();
        // Même identifiant dans un dossier lu après : ignoré.
        fs::create_dir_all(root.join("zz-copie")).unwrap();
        fs::write(root.join("zz-copie/manifest.json"), r#"{"id":"maths"}"#).unwrap();
        fs::create_dir_all(root.join("casse")).unwrap();
        fs::write(root.join("casse/manifest.json"), "pas du json").unwrap();

        let plugins = scan(&[(root.clone(), true)]);
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].id, "maths");
        assert!(plugins[0].root.ends_with("dist"));
    }

    #[test]
    fn serves_files_with_headers() {
        let root = scratch("plugins-serve");
        fs::create_dir_all(root.join("apps")).unwrap();
        fs::write(root.join("apps/index.html"), "<p>ok</p>").unwrap();
        let plugins = vec![LoadedPlugin {
            id: "maths".into(),
            root,
            manifest: Value::Null,
            official: true,
        }];

        let ok = serve(&plugins, "/maths/apps/index.html");
        assert_eq!(ok.status(), StatusCode::OK);
        assert!(ok.headers().contains_key(header::CONTENT_SECURITY_POLICY));
        assert_eq!(
            serve(&plugins, "/maths/../x").status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            serve(&plugins, "/autre/apps/index.html").status(),
            StatusCode::NOT_FOUND
        );
    }
}
