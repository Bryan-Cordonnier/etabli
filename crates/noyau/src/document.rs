//! Documents `.etabli` : un calcul d'une mini-app (cahier des charges, section 7). Le format est
//! celui du fichier de l'application de bureau ; le serveur le range dans sa base.

use crate::identifiants::{document_valide, plugin_valide};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Version du format de fichier, pour relire les anciens documents plus tard.
pub const FORMAT: u32 = 1;
/// Taille maximale d'un document une fois en JSON (données de la mini-app comprises).
pub const TAILLE_MAX: usize = 5 * 1024 * 1024;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
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

#[derive(Deserialize, Debug, Clone)]
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

/// Valide une entrée et fabrique le document à enregistrer.
///
/// * `existant` : le document déjà enregistré sous cet identifiant (sa date de création est gardée) ;
/// * `nouvel_id` : identifiant à donner si l'entrée n'en a pas (hexadécimal) ;
/// * `maintenant` : millisecondes depuis 1970 ;
/// * `version_app` : version de l'application qui enregistre.
pub fn construire(
    entree: DocumentInput,
    existant: Option<&DocumentFile>,
    nouvel_id: impl FnOnce() -> String,
    maintenant: u64,
    version_app: &str,
) -> Result<DocumentFile, String> {
    if !plugin_valide(&entree.plugin_id) || !plugin_valide(&entree.app_id) {
        return Err("Identifiant de plugin ou de mini-app invalide".into());
    }
    if let Some(id) = entree.id.as_deref() {
        if !document_valide(id) {
            return Err("Identifiant de document invalide".into());
        }
    }
    let titre = entree.title.trim();
    if titre.is_empty() || titre.chars().count() > 200 {
        return Err("Le titre doit faire entre 1 et 200 caractères".into());
    }
    if entree.summary.chars().count() > 500 {
        return Err("Le résumé est trop long (500 caractères au plus)".into());
    }
    let id = entree.id.clone().unwrap_or_else(nouvel_id);
    if !document_valide(&id) {
        return Err("Identifiant de document invalide".into());
    }
    let doc = DocumentFile {
        format: FORMAT,
        created: existant.map_or(maintenant, |d| d.created),
        modified: maintenant,
        app_version: version_app.to_string(),
        id,
        plugin_id: entree.plugin_id,
        app_id: entree.app_id,
        data_version: entree.data_version,
        title: titre.to_string(),
        summary: entree.summary,
        data: entree.data,
    };
    let taille = serde_json::to_vec(&doc).map_err(|e| e.to_string())?.len();
    if taille > TAILLE_MAX {
        return Err("Document trop volumineux (5 Mo au plus)".into());
    }
    Ok(doc)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn entree(id: Option<&str>, titre: &str) -> DocumentInput {
        DocumentInput {
            id: id.map(str::to_string),
            plugin_id: "tolerie".into(),
            app_id: "ve".into(),
            data_version: 1,
            title: titre.into(),
            summary: "développé 96,52".into(),
            data: json!({ "epaisseur": "3" }),
        }
    }

    fn nouveau() -> String {
        "3f2a9c1e3f2a9c1e3f2a9c1e3f2a9c1e".into()
    }

    #[test]
    fn cree_un_document_neuf() {
        let doc = construire(entree(None, "  Équerre  "), None, nouveau, 1000, "0.4.0").unwrap();
        assert_eq!(doc.title, "Équerre");
        assert_eq!(doc.id, nouveau());
        assert_eq!(
            (doc.created, doc.modified, doc.format),
            (1000, 1000, FORMAT)
        );
    }

    #[test]
    fn garde_la_date_de_creation() {
        let premier = construire(entree(None, "A"), None, nouveau, 1000, "0.4.0").unwrap();
        let second = construire(
            entree(Some(&premier.id), "B"),
            Some(&premier),
            nouveau,
            2000,
            "0.4.0",
        )
        .unwrap();
        assert_eq!((second.created, second.modified), (1000, 2000));
        assert_eq!(second.id, premier.id);
    }

    #[test]
    fn refuse_les_entrees_dangereuses() {
        for id in ["../../etc/passwd", "zzzzzzzz", "a"] {
            assert!(
                construire(entree(Some(id), "T"), None, nouveau, 1, "v").is_err(),
                "{id}"
            );
        }
        let mut mauvais = entree(None, "T");
        mauvais.plugin_id = "../x".into();
        assert!(construire(mauvais, None, nouveau, 1, "v").is_err());
        assert!(construire(entree(None, "   "), None, nouveau, 1, "v").is_err());
        assert!(construire(entree(None, &"t".repeat(201)), None, nouveau, 1, "v").is_err());
    }

    #[test]
    fn refuse_un_document_trop_gros() {
        let mut gros = entree(None, "T");
        gros.data = json!({ "x": "a".repeat(TAILLE_MAX) });
        assert!(construire(gros, None, nouveau, 1, "v")
            .unwrap_err()
            .contains("volumineux"));
    }

    #[test]
    fn format_compatible_avec_les_fichiers_de_l_application() {
        // Un fichier .etabli écrit par l'application de bureau doit se relire tel quel.
        let texte = r#"{"format":1,"id":"3f2a9c1e","pluginId":"economie","appId":"debit-tubes","dataVersion":2,
            "title":"Châssis remorque v2","summary":"3 barres","created":1790000000000,"modified":1790000000000,
            "appVersion":"0.1.0","data":{"a":1}}"#;
        let doc: DocumentFile = serde_json::from_str(texte).unwrap();
        assert_eq!(doc.plugin_id, "economie");
        assert_eq!(DocumentMeta::from(&doc).title, "Châssis remorque v2");
    }
}
