//! Calculs (documents `.etabli`) de l'utilisateur connecté. Chaque requête SQL porte l'identifiant
//! de l'utilisateur de la session : un identifiant de document qui appartient à quelqu'un d'autre
//! est simplement « introuvable ».

use crate::{
    auth::Session,
    base::maintenant_ms,
    erreur::{Erreur, Resultat},
    etat::Etat,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use etabli_noyau::{
    document::{construire, DocumentFile, DocumentInput, DocumentMeta},
    identifiants::{document_valide, plugin_valide},
};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Nombre maximal de calculs gardés par utilisateur (corbeille comprise).
const DOCUMENTS_MAX: i64 = 10_000;
const LISTE_MAX: i64 = 1000;
const VERSION_APP: &str = env!("CARGO_PKG_VERSION");

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaServeur {
    #[serde(flatten)]
    pub meta: DocumentMeta,
    pub version: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentServeur {
    #[serde(flatten)]
    pub document: DocumentFile,
    pub version: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Enregistrement {
    #[serde(flatten)]
    pub entree: DocumentInput,
    /// Version que le client a lue : si le calcul a changé depuis, l'enregistrement est refusé (409).
    pub version_attendue: Option<u64>,
}

#[derive(Deserialize)]
pub struct Filtre {
    pub plugin: Option<String>,
    pub app: Option<String>,
    pub limite: Option<i64>,
}

fn lire_document(
    c: &Connection,
    utilisateur: &str,
    id: &str,
    avec_supprimes: bool,
) -> Resultat<Option<DocumentServeur>> {
    let sql = format!(
        "SELECT id, plugin_id, app_id, data_version, titre, resume, cree, modifie, version, app_version, data \
         FROM documents WHERE utilisateur_id = ?1 AND id = ?2{}",
        if avec_supprimes { "" } else { " AND supprime IS NULL" }
    );
    let ligne = c
        .query_row(&sql, rusqlite::params![utilisateur, id], |l| {
            let data: String = l.get(10)?;
            Ok(DocumentServeur {
                document: DocumentFile {
                    format: 1,
                    id: l.get(0)?,
                    plugin_id: l.get(1)?,
                    app_id: l.get(2)?,
                    data_version: l.get(3)?,
                    title: l.get(4)?,
                    summary: l.get(5)?,
                    created: l.get::<_, i64>(6)? as u64,
                    modified: l.get::<_, i64>(7)? as u64,
                    app_version: l.get(9)?,
                    data: serde_json::from_str(&data).unwrap_or(Value::Null),
                },
                version: l.get::<_, i64>(8)? as u64,
            })
        })
        .optional()?;
    Ok(ligne)
}

pub async fn lister(
    State(etat): State<Etat>,
    session: Session,
    Query(filtre): Query<Filtre>,
) -> Resultat<Json<Vec<MetaServeur>>> {
    for valeur in [&filtre.plugin, &filtre.app].into_iter().flatten() {
        if !plugin_valide(valeur) {
            return Err(Erreur::requete(
                "Identifiant de plugin ou de mini-app invalide.",
            ));
        }
    }
    let limite = filtre.limite.unwrap_or(LISTE_MAX).clamp(1, LISTE_MAX);
    let liste = etat
        .base
        .executer(move |c| {
            let mut requete = c.prepare(
                "SELECT id, plugin_id, app_id, titre, resume, cree, modifie, version FROM documents \
                 WHERE utilisateur_id = ?1 AND supprime IS NULL \
                   AND (?2 IS NULL OR plugin_id = ?2) AND (?3 IS NULL OR app_id = ?3) \
                 ORDER BY modifie DESC LIMIT ?4",
            )?;
            let lignes = requete
                .query_map(rusqlite::params![session.utilisateur_id, filtre.plugin, filtre.app, limite], |l| {
                    Ok(MetaServeur {
                        meta: DocumentMeta {
                            id: l.get(0)?,
                            plugin_id: l.get(1)?,
                            app_id: l.get(2)?,
                            title: l.get(3)?,
                            summary: l.get(4)?,
                            created: l.get::<_, i64>(5)? as u64,
                            modified: l.get::<_, i64>(6)? as u64,
                        },
                        version: l.get::<_, i64>(7)? as u64,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(lignes)
        })
        .await?;
    Ok(Json(liste))
}

pub async fn lire(
    State(etat): State<Etat>,
    session: Session,
    Path(id): Path<String>,
) -> Resultat<Json<DocumentServeur>> {
    if !document_valide(&id) {
        return Err(Erreur::Introuvable);
    }
    let doc = etat
        .base
        .executer(move |c| lire_document(c, &session.utilisateur_id, &id, false))
        .await?;
    doc.map(Json).ok_or(Erreur::Introuvable)
}

pub async fn enregistrer(
    State(etat): State<Etat>,
    session: Session,
    Json(requete): Json<Enregistrement>,
) -> Resultat<Json<MetaServeur>> {
    let quota = etat.config.quota_utilisateur;
    let meta = etat
        .base
        .executer(move |c| {
            let tx = c.transaction()?;
            let existant = match requete.entree.id.as_deref() {
                Some(id) if document_valide(id) => lire_document(&tx, &session.utilisateur_id, id, true)?,
                _ => None,
            };
            if let (Some(attendue), Some(actuel)) = (requete.version_attendue, existant.as_ref()) {
                if attendue != actuel.version {
                    return Err(Erreur::Conflit { version_actuelle: actuel.version });
                }
            }
            if existant.is_none() {
                let total: i64 = tx.query_row(
                    "SELECT count(*) FROM documents WHERE utilisateur_id = ?1",
                    [&session.utilisateur_id],
                    |l| l.get(0),
                )?;
                if total >= DOCUMENTS_MAX {
                    return Err(Erreur::requete("Trop de calculs enregistrés : supprimez-en avant d'en ajouter."));
                }
            }
            let doc = construire(
                requete.entree,
                existant.as_ref().map(|e| &e.document),
                || uuid::Uuid::new_v4().simple().to_string(),
                maintenant_ms(),
                VERSION_APP,
            )
            .map_err(Erreur::Requete)?;
            let version = existant.as_ref().map_or(1, |e| e.version + 1);
            let data = serde_json::to_string(&doc.data).map_err(|e| Erreur::Interne(e.to_string()))?;
            // Place déjà prise par les autres calculs de l'utilisateur, plus celui-ci.
            let autres: i64 = tx.query_row(
                "SELECT COALESCE(SUM(length(data)), 0) FROM documents WHERE utilisateur_id = ?1 AND id <> ?2",
                rusqlite::params![session.utilisateur_id, doc.id],
                |l| l.get(0),
            )?;
            if (autres as u64).saturating_add(data.len() as u64) > quota {
                return Err(Erreur::requete("Espace de stockage plein : supprimez des calculs avant d'en enregistrer."));
            }
            tx.execute(
                "INSERT INTO documents(utilisateur_id, id, plugin_id, app_id, data_version, titre, resume, cree, modifie, version, app_version, data, supprime) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, NULL) \
                 ON CONFLICT(utilisateur_id, id) DO UPDATE SET plugin_id = ?3, app_id = ?4, data_version = ?5, titre = ?6, resume = ?7, \
                   modifie = ?9, version = ?10, app_version = ?11, data = ?12, supprime = NULL",
                rusqlite::params![
                    session.utilisateur_id, doc.id, doc.plugin_id, doc.app_id, doc.data_version, doc.title, doc.summary,
                    doc.created as i64, doc.modified as i64, version as i64, doc.app_version, data
                ],
            )?;
            tx.commit()?;
            Ok(MetaServeur { meta: DocumentMeta::from(&doc), version })
        })
        .await?;
    Ok(Json(meta))
}

/// Met le calcul à la corbeille (il reste en base, hors des listes).
pub async fn supprimer(
    State(etat): State<Etat>,
    session: Session,
    Path(id): Path<String>,
) -> Resultat<StatusCode> {
    if !document_valide(&id) {
        return Err(Erreur::Introuvable);
    }
    let modifies = etat
        .base
        .executer(move |c| {
            Ok(c.execute(
                "UPDATE documents SET supprime = ?1 WHERE utilisateur_id = ?2 AND id = ?3 AND supprime IS NULL",
                rusqlite::params![maintenant_ms() as i64, session.utilisateur_id, id],
            )?)
        })
        .await?;
    if modifies == 0 {
        Err(Erreur::Introuvable)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}
