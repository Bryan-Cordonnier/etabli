//! Erreurs de l'API : un code HTTP et une phrase en français qui dit quoi corriger.
//! Les détails techniques (base, disque) restent dans le journal du serveur, jamais dans la réponse.

use axum::{
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug)]
pub enum Erreur {
    /// Requête mal formée ou refusée par une règle (400).
    Requete(String),
    /// Pas de session valide (401).
    NonAuthentifie,
    /// Identifiant ou mot de passe incorrect, sans dire lequel (401).
    Identifiants,
    /// Session valide mais droits insuffisants (403).
    Interdit,
    /// Introuvable, ou appartenant à quelqu'un d'autre (404) : on ne distingue jamais les deux.
    Introuvable,
    /// Le document a changé depuis la version connue du client (409).
    Conflit { version_actuelle: u64 },
    /// Corps de requête trop gros (413).
    TropVolumineux,
    /// Trop d'essais : réessayer dans ce nombre de secondes (429).
    TropDeRequetes(u64),
    /// Erreur interne (500) : le détail est écrit dans le journal.
    Interne(String),
}

impl Erreur {
    pub fn requete(message: impl Into<String>) -> Self {
        Self::Requete(message.into())
    }
}

impl From<rusqlite::Error> for Erreur {
    fn from(e: rusqlite::Error) -> Self {
        Self::Interne(format!("base de données : {e}"))
    }
}

impl From<std::io::Error> for Erreur {
    fn from(e: std::io::Error) -> Self {
        Self::Interne(format!("disque : {e}"))
    }
}

impl IntoResponse for Erreur {
    fn into_response(self) -> Response {
        let (code, message, extra): (StatusCode, String, Option<(header::HeaderName, String)>) =
            match self {
                Self::Requete(m) => (StatusCode::BAD_REQUEST, m, None),
                Self::NonAuthentifie => (
                    StatusCode::UNAUTHORIZED,
                    "Connexion requise ou session expirée.".into(),
                    None,
                ),
                Self::Identifiants => (
                    StatusCode::UNAUTHORIZED,
                    "Identifiant ou mot de passe incorrect.".into(),
                    None,
                ),
                Self::Interdit => (
                    StatusCode::FORBIDDEN,
                    "Vous n'avez pas le droit de faire cela.".into(),
                    None,
                ),
                Self::Introuvable => (StatusCode::NOT_FOUND, "Introuvable.".into(), None),
                Self::Conflit { version_actuelle } => {
                    let corps = json!({
                        "erreur": "Ce calcul a été modifié ailleurs depuis votre dernière lecture.",
                        "versionActuelle": version_actuelle,
                    });
                    return (StatusCode::CONFLICT, Json(corps)).into_response();
                }
                Self::TropVolumineux => (
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "Contenu trop volumineux.".into(),
                    None,
                ),
                Self::TropDeRequetes(secondes) => (
                    StatusCode::TOO_MANY_REQUESTS,
                    format!("Trop d'essais. Réessayez dans {secondes} s."),
                    Some((header::RETRY_AFTER, secondes.to_string())),
                ),
                Self::Interne(detail) => {
                    eprintln!("erreur interne : {detail}");
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "Erreur du serveur.".into(),
                        None,
                    )
                }
            };
        let mut reponse = (code, Json(json!({ "erreur": message }))).into_response();
        if let Some((nom, valeur)) = extra {
            if let Ok(valeur) = valeur.parse() {
                reponse.headers_mut().insert(nom, valeur);
            }
        }
        reponse
    }
}

pub type Resultat<T> = Result<T, Erreur>;
