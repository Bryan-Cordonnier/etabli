//! Authentification des requêtes : jeton « Bearer » → session → utilisateur.
//! L'identité vient toujours de la session, jamais d'un champ envoyé par le client.

use crate::{
    base::maintenant_ms,
    erreur::Erreur,
    etat::{Etat, SESSION_INACTIVITE, SESSION_MAX},
    securite::empreinte,
};
use axum::{
    extract::{ConnectInfo, FromRequestParts},
    http::{header::AUTHORIZATION, request::Parts},
};
use rusqlite::OptionalExtension;
use std::{convert::Infallible, net::SocketAddr};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Admin,
    Utilisateur,
}

impl Role {
    pub fn depuis_texte(texte: &str) -> Self {
        if texte == "admin" {
            Self::Admin
        } else {
            Self::Utilisateur
        }
    }
    pub fn texte(self) -> &'static str {
        match self {
            Self::Admin => "admin",
            Self::Utilisateur => "utilisateur",
        }
    }
}

/// Session valide d'un utilisateur actif.
#[derive(Clone, Debug)]
pub struct Session {
    pub utilisateur_id: String,
    pub nom: String,
    pub role: Role,
    pub empreinte: String,
}

fn jeton_de(parts: &Parts) -> Option<String> {
    let valeur = parts.headers.get(AUTHORIZATION)?.to_str().ok()?;
    let jeton = valeur.strip_prefix("Bearer ")?.trim();
    (!jeton.is_empty() && jeton.len() <= 128).then(|| jeton.to_string())
}

impl FromRequestParts<Etat> for Session {
    type Rejection = Erreur;

    async fn from_request_parts(parts: &mut Parts, etat: &Etat) -> Result<Self, Erreur> {
        let jeton = jeton_de(parts).ok_or(Erreur::NonAuthentifie)?;
        let empreinte = empreinte(&jeton);
        let session = etat
            .base
            .executer(move |c| {
                let maintenant = maintenant_ms() as i64;
                let ligne = c
                    .query_row(
                        "SELECT u.id, u.nom, u.role, s.cree, s.derniere_utilisation \
                         FROM sessions s JOIN utilisateurs u ON u.id = s.utilisateur_id \
                         WHERE s.empreinte = ?1 AND u.actif = 1",
                        [&empreinte],
                        |l| {
                            Ok((
                                l.get::<_, String>(0)?,
                                l.get::<_, String>(1)?,
                                l.get::<_, String>(2)?,
                                l.get::<_, i64>(3)?,
                                l.get::<_, i64>(4)?,
                            ))
                        },
                    )
                    .optional()?;
                let Some((id, nom, role, cree, derniere)) = ligne else {
                    return Ok(None);
                };
                let trop_vieille = maintenant - cree > SESSION_MAX.as_millis() as i64;
                let inactive = maintenant - derniere > SESSION_INACTIVITE.as_millis() as i64;
                if trop_vieille || inactive {
                    c.execute("DELETE FROM sessions WHERE empreinte = ?1", [&empreinte])?;
                    return Ok(None);
                }
                // Une écriture par minute au plus, pas une par requête.
                if maintenant - derniere > 60_000 {
                    c.execute(
                        "UPDATE sessions SET derniere_utilisation = ?1 WHERE empreinte = ?2",
                        rusqlite::params![maintenant, empreinte],
                    )?;
                }
                Ok(Some(Session {
                    utilisateur_id: id,
                    nom,
                    role: Role::depuis_texte(&role),
                    empreinte,
                }))
            })
            .await?;
        session.ok_or(Erreur::NonAuthentifie)
    }
}

/// Session de l'administrateur : toute autre session est refusée (403).
#[derive(Clone, Debug)]
pub struct Admin(pub Session);

impl FromRequestParts<Etat> for Admin {
    type Rejection = Erreur;

    async fn from_request_parts(parts: &mut Parts, etat: &Etat) -> Result<Self, Erreur> {
        let session = Session::from_request_parts(parts, etat).await?;
        if session.role == Role::Admin {
            Ok(Self(session))
        } else {
            Err(Erreur::Interdit)
        }
    }
}

/// Adresse du client, pour limiter les essais de connexion. Derrière un proxy inverse de confiance
/// (option `--proxy-de-confiance`), c'est le premier élément de `X-Forwarded-For`.
#[derive(Clone, Debug)]
pub struct Ip(pub String);

impl FromRequestParts<Etat> for Ip {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, etat: &Etat) -> Result<Self, Infallible> {
        if etat.config.proxy_de_confiance {
            if let Some(ip) = parts
                .headers
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.split(',').next())
                .map(|v| v.trim().chars().take(64).collect::<String>())
                .filter(|v| !v.is_empty())
            {
                return Ok(Self(ip));
            }
        }
        let ip = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map_or_else(|| "inconnue".to_string(), |c| c.0.ip().to_string());
        Ok(Self(ip))
    }
}
