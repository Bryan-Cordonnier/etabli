//! Documents `.etabli` : un calcul d'une mini-app, enregistré dans le dossier de travail
//! (cahier des charges, section 7). Un sous-dossier par plugin, un fichier JSON par document.

use crate::{files::write_atomic, plugins::valid_id};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

/// Version du format de fichier, pour relire les anciens documents plus tard.
const FORMAT: u32 = 1;
const EXTENSION: &str = "etabli";
const TRASH: &str = ".corbeille";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DocumentFile {
    pub format: u32,
    pub id: String,
    pub plugin_id: String,
    pub app_id: String,
    pub data_version: u32,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    /// Dates en millisecondes depuis 1970.
    pub created: u64,
    pub modified: u64,
    pub app_version: String,
    pub data: Value,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMeta {
    pub id: String,
    pub plugin_id: String,
    pub app_id: String,
    pub title: String,
    pub summary: String,
    pub created: u64,
    pub modified: u64,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DocumentInput {
    pub id: Option<String>,
    pub plugin_id: String,
    pub app_id: String,
    pub data_version: u32,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    pub data: Value,
}

impl From<&DocumentFile> for DocumentMeta {
    fn from(doc: &DocumentFile) -> Self {
        Self {
            id: doc.id.clone(),
            plugin_id: doc.plugin_id.clone(),
            app_id: doc.app_id.clone(),
            title: doc.title.clone(),
            summary: doc.summary.clone(),
            created: doc.created,
            modified: doc.modified,
        }
    }
}

pub struct Library {
    root: PathBuf,
}

impl Library {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// Documents les plus récents d'abord, filtrés par plugin et mini-app si demandé.
    pub fn list(
        &self,
        plugin_id: Option<&str>,
        app_id: Option<&str>,
        limit: Option<usize>,
    ) -> Vec<DocumentMeta> {
        let dirs: Vec<PathBuf> = match plugin_id {
            Some(id) if valid_id(id) => vec![self.root.join(id)],
            Some(_) => Vec::new(),
            None => self.plugin_dirs(),
        };
        let mut docs: Vec<DocumentMeta> = dirs
            .iter()
            .flat_map(|dir| read_dir_documents(dir))
            .filter(|(_, doc)| app_id.is_none_or(|app| doc.app_id == app))
            .map(|(_, doc)| DocumentMeta::from(&doc))
            .collect();
        docs.sort_by_key(|doc| std::cmp::Reverse(doc.modified));
        if let Some(limit) = limit {
            docs.truncate(limit);
        }
        docs
    }

    pub fn read(&self, id: &str) -> Result<DocumentFile, String> {
        self.find(id)
            .map(|(_, doc)| doc)
            .ok_or_else(|| "Document introuvable".to_string())
    }

    pub fn save(&self, input: DocumentInput, app_version: &str) -> Result<DocumentMeta, String> {
        if !valid_id(&input.plugin_id) || !valid_id(&input.app_id) {
            return Err("Identifiant de plugin ou de mini-app invalide".into());
        }
        let existing = match input.id.as_deref() {
            Some(id) if !valid_doc_id(id) => return Err("Identifiant de document invalide".into()),
            Some(id) => self.find(id),
            None => None,
        };
        let now = now_ms();
        let id = input
            .id
            .unwrap_or_else(|| uuid::Uuid::new_v4().simple().to_string());

        let doc = DocumentFile {
            format: FORMAT,
            created: existing.as_ref().map_or(now, |(_, d)| d.created),
            modified: now,
            app_version: app_version.to_string(),
            id,
            plugin_id: input.plugin_id,
            app_id: input.app_id,
            data_version: input.data_version,
            title: input.title.trim().to_string(),
            summary: input.summary,
            data: input.data,
        };

        let target = self
            .root
            .join(&doc.plugin_id)
            .join(file_name(&doc.title, &doc.id));
        let json = serde_json::to_vec_pretty(&doc).map_err(|e| e.to_string())?;
        write_atomic(&target, &json).map_err(|e| format!("Écriture impossible : {e}"))?;

        // Le titre a changé : le nom du fichier suit, l'ancien fichier disparaît.
        if let Some((old_path, _)) = existing {
            if old_path != target {
                let _ = fs::remove_file(old_path);
            }
        }
        Ok(DocumentMeta::from(&doc))
    }

    /// Déplace le document dans la corbeille du dossier de travail (jamais supprimé directement).
    pub fn delete(&self, id: &str) -> Result<(), String> {
        let (path, _) = self.find(id).ok_or("Document introuvable")?;
        let trash = self.root.join(TRASH);
        fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
        let name = path.file_name().ok_or("Nom de fichier invalide")?;
        fs::rename(&path, trash.join(name)).map_err(|e| e.to_string())
    }

    fn plugin_dirs(&self) -> Vec<PathBuf> {
        let Ok(entries) = fs::read_dir(&self.root) else {
            return Vec::new();
        };
        entries
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.is_dir() && p.file_name().is_some_and(|n| n != TRASH))
            .collect()
    }

    fn find(&self, id: &str) -> Option<(PathBuf, DocumentFile)> {
        if !valid_doc_id(id) {
            return None;
        }
        let suffix = format!("-{}.{EXTENSION}", short_id(id));
        self.plugin_dirs()
            .iter()
            .flat_map(|dir| read_dir_documents(dir))
            .find(|(path, doc)| {
                doc.id == id
                    && path
                        .file_name()
                        .is_some_and(|n| n.to_string_lossy().ends_with(&suffix))
            })
    }
}

fn read_dir_documents(dir: &Path) -> Vec<(PathBuf, DocumentFile)> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == EXTENSION))
        .filter_map(|path| {
            let text = fs::read(&path).ok()?;
            let doc = serde_json::from_slice::<DocumentFile>(&text).ok()?;
            Some((path, doc))
        })
        .collect()
}

fn valid_doc_id(id: &str) -> bool {
    id.len() >= 8 && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_hexdigit())
}

fn short_id(id: &str) -> &str {
    &id[..8]
}

/// Nom lisible dans l'explorateur Windows : « chassis-remorque-v2-3f2a9c1e.etabli ».
fn file_name(title: &str, id: &str) -> String {
    format!("{}-{}.{EXTENSION}", slug(title), short_id(id))
}

fn slug(title: &str) -> String {
    let mut out = String::new();
    for c in title.to_lowercase().chars() {
        let mapped = match c {
            'à' | 'â' | 'ä' | 'á' => "a",
            'é' | 'è' | 'ê' | 'ë' => "e",
            'î' | 'ï' | 'í' => "i",
            'ô' | 'ö' | 'ó' => "o",
            'ù' | 'û' | 'ü' | 'ú' => "u",
            'ç' => "c",
            'œ' => "oe",
            'æ' => "ae",
            c if c.is_ascii_alphanumeric() => {
                out.push(c);
                continue;
            }
            _ => "-",
        };
        out.push_str(mapped);
    }
    let collapsed: Vec<&str> = out.split('-').filter(|s| !s.is_empty()).collect();
    let mut slug = collapsed.join("-");
    slug.truncate(48);
    let slug = slug.trim_end_matches('-').to_string();
    if slug.is_empty() {
        "document".into()
    } else {
        slug
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

fn library(state: &crate::AppState) -> Library {
    Library::new(&state.paths.documents)
}

#[tauri::command]
pub fn documents_list(
    state: tauri::State<'_, crate::AppState>,
    plugin_id: Option<String>,
    app_id: Option<String>,
    limit: Option<usize>,
) -> Vec<DocumentMeta> {
    library(&state).list(plugin_id.as_deref(), app_id.as_deref(), limit)
}

#[tauri::command]
pub fn document_read(
    state: tauri::State<'_, crate::AppState>,
    id: String,
) -> Result<DocumentFile, String> {
    library(&state).read(&id)
}

#[tauri::command]
pub fn document_save(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
    document: DocumentInput,
) -> Result<DocumentMeta, String> {
    library(&state).save(document, &app.package_info().version.to_string())
}

#[tauri::command]
pub fn document_delete(state: tauri::State<'_, crate::AppState>, id: String) -> Result<(), String> {
    library(&state).delete(&id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::tests::scratch;
    use serde_json::json;

    fn input(id: Option<&str>, title: &str) -> DocumentInput {
        DocumentInput {
            id: id.map(String::from),
            plugin_id: "maths".into(),
            app_id: "pythagore".into(),
            data_version: 1,
            title: title.into(),
            summary: "c = 372,95 mm".into(),
            data: json!({ "a": "350", "b": "120" }),
        }
    }

    #[test]
    fn slug_is_readable() {
        assert_eq!(slug("Châssis remorque v2"), "chassis-remorque-v2");
        assert_eq!(slug("  Débit — tubes 40×40  "), "debit-tubes-40-40");
        assert_eq!(slug("***"), "document");
    }

    #[test]
    fn save_read_rename_and_delete() {
        let lib = Library::new(scratch("documents"));

        let first = lib.save(input(None, "Diagonale platine"), "0.1.0").unwrap();
        let read = lib.read(&first.id).unwrap();
        assert_eq!(read.title, "Diagonale platine");
        assert_eq!(read.data["a"], "350");

        // Renommer garde l'identifiant et la date de création, et remplace le fichier.
        let renamed = lib
            .save(input(Some(&first.id), "Gousset 45°"), "0.1.0")
            .unwrap();
        assert_eq!(renamed.id, first.id);
        assert_eq!(renamed.created, first.created);
        let files: Vec<_> = fs::read_dir(lib.root.join("maths")).unwrap().collect();
        assert_eq!(files.len(), 1);

        let second = lib.save(input(None, "Autre"), "0.1.0").unwrap();
        let all = lib.list(Some("maths"), Some("pythagore"), None);
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].id, second.id, "le plus récent d'abord");
        assert!(lib.list(Some("maths"), Some("triangle"), None).is_empty());
        assert_eq!(lib.list(None, None, Some(1)).len(), 1);

        lib.delete(&first.id).unwrap();
        assert!(lib.read(&first.id).is_err());
        assert!(lib.root.join(TRASH).read_dir().unwrap().next().is_some());
        assert_eq!(
            lib.list(None, None, None).len(),
            1,
            "la corbeille n'est pas listée"
        );
    }

    #[test]
    fn rejects_dangerous_ids() {
        let lib = Library::new(scratch("documents-ids"));
        let mut bad = input(None, "x");
        bad.plugin_id = "../evil".into();
        assert!(lib.save(bad, "0.1.0").is_err());
        assert!(lib.save(input(Some("../../x"), "x"), "0.1.0").is_err());
        assert!(lib.read("../../x").is_err());
    }
}
