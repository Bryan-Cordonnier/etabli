//! Données de plugin (réglages, services publiés) et réglages de l'application, par utilisateur.

use crate::{
    auth::Session,
    base::maintenant_ms,
    erreur::{Erreur, Resultat},
    etat::Etat,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use etabli_noyau::identifiants::donnees_valide;
use rusqlite::OptionalExtension;
use serde_json::{json, Value};

/// Taille maximale d'une donnée ou des réglages, une fois en JSON.
pub const TAILLE_MAX: usize = 1024 * 1024;
/// Nombre maximal de données nommées par utilisateur.
const NOMS_MAX: i64 = 500;

fn controler_taille(valeur: &Value) -> Resultat<String> {
    let texte = serde_json::to_string(valeur).map_err(|e| Erreur::Interne(e.to_string()))?;
    if texte.len() > TAILLE_MAX {
        return Err(Erreur::TropVolumineux);
    }
    Ok(texte)
}

/// Contenu enregistré, ou `null` s'il n'y a encore rien (comme le fait l'application de bureau).
pub async fn lire(
    State(etat): State<Etat>,
    session: Session,
    Path(nom): Path<String>,
) -> Resultat<Json<Value>> {
    if !donnees_valide(&nom) {
        return Err(Erreur::requete("Nom de données invalide."));
    }
    let texte: Option<String> = etat
        .base
        .executer(move |c| {
            Ok(c.query_row(
                "SELECT valeur FROM donnees WHERE utilisateur_id = ?1 AND nom = ?2",
                rusqlite::params![session.utilisateur_id, nom],
                |l| l.get(0),
            )
            .optional()?)
        })
        .await?;
    Ok(Json(
        texte
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or(Value::Null),
    ))
}

pub async fn ecrire(
    State(etat): State<Etat>,
    session: Session,
    Path(nom): Path<String>,
    Json(valeur): Json<Value>,
) -> Resultat<Json<Value>> {
    if !donnees_valide(&nom) {
        return Err(Erreur::requete("Nom de données invalide."));
    }
    let texte = controler_taille(&valeur)?;
    let version = etat
        .base
        .executer(move |c| {
            let tx = c.transaction()?;
            let existe: bool = tx
                .query_row(
                    "SELECT 1 FROM donnees WHERE utilisateur_id = ?1 AND nom = ?2",
                    rusqlite::params![session.utilisateur_id, nom],
                    |_| Ok(true),
                )
                .optional()?
                .unwrap_or(false);
            if !existe {
                let total: i64 = tx.query_row("SELECT count(*) FROM donnees WHERE utilisateur_id = ?1", [&session.utilisateur_id], |l| l.get(0))?;
                if total >= NOMS_MAX {
                    return Err(Erreur::requete("Trop de données enregistrées."));
                }
            }
            tx.execute(
                "INSERT INTO donnees(utilisateur_id, nom, valeur, version, modifie) VALUES (?1, ?2, ?3, 1, ?4) \
                 ON CONFLICT(utilisateur_id, nom) DO UPDATE SET valeur = ?3, version = version + 1, modifie = ?4",
                rusqlite::params![session.utilisateur_id, nom, texte, maintenant_ms() as i64],
            )?;
            let version: i64 = tx.query_row(
                "SELECT version FROM donnees WHERE utilisateur_id = ?1 AND nom = ?2",
                rusqlite::params![session.utilisateur_id, nom],
                |l| l.get(0),
            )?;
            tx.commit()?;
            Ok(version)
        })
        .await?;
    Ok(Json(json!({ "version": version })))
}

/// Réglages de l'application (clés `settings` et `session` de l'interface) : un objet JSON.
pub async fn lire_reglages(State(etat): State<Etat>, session: Session) -> Resultat<Json<Value>> {
    let texte: Option<String> = etat
        .base
        .executer(move |c| {
            Ok(c.query_row(
                "SELECT valeur FROM reglages WHERE utilisateur_id = ?1",
                [&session.utilisateur_id],
                |l| l.get(0),
            )
            .optional()?)
        })
        .await?;
    Ok(Json(
        texte
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_else(|| json!({})),
    ))
}

pub async fn ecrire_reglages(
    State(etat): State<Etat>,
    session: Session,
    Json(valeur): Json<Value>,
) -> Resultat<StatusCode> {
    if !valeur.is_object() {
        return Err(Erreur::requete("Les réglages doivent être un objet JSON."));
    }
    let texte = controler_taille(&valeur)?;
    etat.base
        .executer(move |c| {
            c.execute(
                "INSERT INTO reglages(utilisateur_id, valeur, modifie) VALUES (?1, ?2, ?3) \
                 ON CONFLICT(utilisateur_id) DO UPDATE SET valeur = ?2, modifie = ?3",
                rusqlite::params![session.utilisateur_id, texte, maintenant_ms() as i64],
            )?;
            Ok(())
        })
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
