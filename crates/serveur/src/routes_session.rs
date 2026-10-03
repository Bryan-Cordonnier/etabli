//! Installation initiale, connexion, déconnexion et données du compte.

use crate::{
    auth::{Ip, Session},
    base::{journaliser, maintenant_ms},
    erreur::{Erreur, Resultat},
    etat::Etat,
    securite,
};
use axum::{extract::State, http::StatusCode, Json};
use etabli_noyau::identifiants::utilisateur_valide;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UtilisateurJson {
    pub id: String,
    pub nom: String,
    pub role: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connecte {
    pub jeton: String,
    pub utilisateur: UtilisateurJson,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub code: String,
    pub nom: String,
    pub mot_de_passe: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connexion {
    pub nom: String,
    pub mot_de_passe: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangementMotDePasse {
    pub actuel: String,
    pub nouveau: String,
}

async fn hacher(mot_de_passe: String) -> Resultat<String> {
    securite::hacher_async(mot_de_passe)
        .await
        .map_err(Erreur::Interne)
}

async fn verifier(mot_de_passe: String, hache: Option<String>) -> bool {
    securite::verifier_async(mot_de_passe, hache).await
}

/// Crée la session d'un utilisateur et renvoie le jeton (affiché une seule fois).
fn creer_session(c: &rusqlite::Connection, utilisateur_id: &str) -> Resultat<String> {
    let (jeton, empreinte) = securite::nouveau_jeton();
    let maintenant = maintenant_ms() as i64;
    c.execute(
        "INSERT INTO sessions(empreinte, utilisateur_id, cree, derniere_utilisation) VALUES (?1, ?2, ?3, ?3)",
        rusqlite::params![empreinte, utilisateur_id, maintenant],
    )?;
    c.execute(
        "UPDATE utilisateurs SET derniere_connexion = ?1 WHERE id = ?2",
        rusqlite::params![maintenant, utilisateur_id],
    )?;
    Ok(jeton)
}

/// Premier lancement : crée l'administrateur. Possible une seule fois, avec le code affiché dans la
/// console du serveur.
pub async fn installation(
    State(etat): State<Etat>,
    Ip(ip): Ip,
    Json(requete): Json<Installation>,
) -> Resultat<(StatusCode, Json<Connecte>)> {
    etat.limite_installation
        .verifier("installation")
        .map_err(Erreur::TropDeRequetes)?;
    let nom = requete.nom.trim().to_string();
    if !utilisateur_valide(&nom) {
        return Err(Erreur::requete("L'identifiant doit faire 3 à 32 caractères : lettres, chiffres, point, tiret ou tiret bas."));
    }
    securite::controler_mot_de_passe(&requete.mot_de_passe, &nom).map_err(Erreur::Requete)?;
    let hache = hacher(requete.mot_de_passe).await?;
    let empreinte_code = securite::empreinte(requete.code.trim());
    let etat2 = etat.clone();
    let resultat = etat
        .base
        .executer(move |c| {
            let tx = c.transaction()?;
            let existants: i64 = tx.query_row("SELECT count(*) FROM utilisateurs", [], |l| l.get(0))?;
            if existants > 0 {
                return Ok(Err(Erreur::Interdit));
            }
            let attendu: Option<String> = tx
                .query_row("SELECT valeur FROM configuration WHERE cle = 'code_installation'", [], |l| l.get(0))
                .optional()?;
            if !attendu.is_some_and(|a| securite::egaux(&a, &empreinte_code)) {
                return Ok(Err(Erreur::Identifiants));
            }
            let id = uuid::Uuid::new_v4().simple().to_string();
            tx.execute(
                "INSERT INTO utilisateurs(id, nom, mot_de_passe, role, cree) VALUES (?1, ?2, ?3, 'admin', ?4)",
                rusqlite::params![id, nom, hache, maintenant_ms() as i64],
            )?;
            tx.execute("DELETE FROM configuration WHERE cle = 'code_installation'", [])?;
            journaliser(&tx, Some(&id), "installation", Some(&nom), None)?;
            let jeton = creer_session(&tx, &id)?;
            tx.commit()?;
            Ok(Ok(Connecte { jeton, utilisateur: UtilisateurJson { id, nom, role: "admin".into() } }))
        })
        .await?;
    match resultat {
        Ok(connecte) => {
            etat2.limite_installation.succes("installation");
            Ok((StatusCode::CREATED, Json(connecte)))
        }
        Err(e) => {
            if matches!(e, Erreur::Identifiants) {
                etat2.limite_installation.echec("installation");
                eprintln!("installation : code incorrect depuis {ip}");
            }
            Err(e)
        }
    }
}

pub async fn connexion(
    State(etat): State<Etat>,
    Ip(ip): Ip,
    Json(requete): Json<Connexion>,
) -> Resultat<Json<Connecte>> {
    // Borné : la clé de limitation est gardée en mémoire, elle ne doit pas pouvoir être énorme.
    let nom: String = requete.nom.trim().to_lowercase().chars().take(64).collect();
    let cle_nom = format!("nom:{nom}");
    let cle_ip = format!("ip:{ip}");
    etat.limite_nom
        .verifier(&cle_nom)
        .map_err(Erreur::TropDeRequetes)?;
    etat.limite_ip
        .verifier(&cle_ip)
        .map_err(Erreur::TropDeRequetes)?;

    let nom_recherche = nom.clone();
    let utilisateur: Option<(String, String, String, String, bool)> = etat
        .base
        .executer(move |c| {
            Ok(c.query_row(
                "SELECT id, nom, mot_de_passe, role, actif FROM utilisateurs WHERE nom = ?1",
                [&nom_recherche],
                |l| {
                    Ok((
                        l.get(0)?,
                        l.get(1)?,
                        l.get(2)?,
                        l.get(3)?,
                        l.get::<_, i64>(4)? == 1,
                    ))
                },
            )
            .optional()?)
        })
        .await?;

    let hache = utilisateur.as_ref().filter(|u| u.4).map(|u| u.2.clone());
    let valide = verifier(requete.mot_de_passe, hache).await;
    let Some((id, nom_affiche, _, role, actif)) = utilisateur.filter(|_| valide) else {
        etat.limite_nom.echec(&cle_nom);
        etat.limite_ip.echec(&cle_ip);
        let court: String = nom.chars().take(40).filter(|c| !c.is_control()).collect();
        etat.base
            .executer(move |c| journaliser(c, None, "connexion_refusee", Some(&court), None))
            .await?;
        return Err(Erreur::Identifiants);
    };
    debug_assert!(actif);
    etat.limite_nom.succes(&cle_nom);
    let id2 = id.clone();
    let jeton = etat
        .base
        .executer(move |c| {
            let jeton = creer_session(c, &id2)?;
            journaliser(c, Some(&id2), "connexion", None, None)?;
            Ok(jeton)
        })
        .await?;
    Ok(Json(Connecte {
        jeton,
        utilisateur: UtilisateurJson {
            id,
            nom: nom_affiche,
            role,
        },
    }))
}

pub async fn deconnexion(State(etat): State<Etat>, session: Session) -> Resultat<StatusCode> {
    etat.base
        .executer(move |c| {
            c.execute(
                "DELETE FROM sessions WHERE empreinte = ?1",
                [&session.empreinte],
            )?;
            Ok(())
        })
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn moi(State(etat): State<Etat>, session: Session) -> Resultat<Json<Value>> {
    let id = session.utilisateur_id.clone();
    let plugins: Vec<String> = etat
        .base
        .executer(move |c| {
            let mut requete = c.prepare(
                "SELECT p.id FROM plugins p WHERE p.actif_global = 1 \
                 OR EXISTS (SELECT 1 FROM plugin_acces a WHERE a.plugin_id = p.id AND a.utilisateur_id = ?1) ORDER BY p.id",
            )?;
            let ids = requete.query_map([&id], |l| l.get::<_, String>(0))?.collect::<Result<Vec<_>, _>>()?;
            Ok(ids)
        })
        .await?;
    Ok(Json(json!({
        "id": session.utilisateur_id,
        "nom": session.nom,
        "role": session.role.texte(),
        "plugins": plugins,
    })))
}

pub async fn changer_mot_de_passe(
    State(etat): State<Etat>,
    session: Session,
    Json(requete): Json<ChangementMotDePasse>,
) -> Resultat<StatusCode> {
    securite::controler_mot_de_passe(&requete.nouveau, &session.nom).map_err(Erreur::Requete)?;
    let id = session.utilisateur_id.clone();
    let actuel_hache: String = etat
        .base
        .executer(move |c| {
            Ok(c.query_row(
                "SELECT mot_de_passe FROM utilisateurs WHERE id = ?1",
                [&id],
                |l| l.get(0),
            )?)
        })
        .await?;
    if !verifier(requete.actuel, Some(actuel_hache)).await {
        return Err(Erreur::Identifiants);
    }
    let nouveau = hacher(requete.nouveau).await?;
    etat.base
        .executer(move |c| {
            let tx = c.transaction()?;
            tx.execute(
                "UPDATE utilisateurs SET mot_de_passe = ?1 WHERE id = ?2",
                rusqlite::params![nouveau, session.utilisateur_id],
            )?;
            // Les autres appareils doivent se reconnecter ; celui-ci garde sa session.
            tx.execute(
                "DELETE FROM sessions WHERE utilisateur_id = ?1 AND empreinte <> ?2",
                rusqlite::params![session.utilisateur_id, session.empreinte],
            )?;
            journaliser(
                &tx,
                Some(&session.utilisateur_id),
                "mot_de_passe_change",
                None,
                None,
            )?;
            tx.commit()?;
            Ok(())
        })
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Export complet des données de l'utilisateur connecté (documents, données de plugin, réglages).
pub async fn export_personnel(State(etat): State<Etat>, session: Session) -> Resultat<Json<Value>> {
    let id = session.utilisateur_id.clone();
    let export = etat
        .base
        .executer(move |c| {
            let mut docs = c.prepare(
                "SELECT id, plugin_id, app_id, data_version, titre, resume, cree, modifie, app_version, data \
                 FROM documents WHERE utilisateur_id = ?1 AND supprime IS NULL ORDER BY modifie DESC",
            )?;
            let documents = docs
                .query_map([&id], |l| {
                    let data: String = l.get(9)?;
                    Ok(json!({
                        "format": 1,
                        "id": l.get::<_, String>(0)?, "pluginId": l.get::<_, String>(1)?, "appId": l.get::<_, String>(2)?,
                        "dataVersion": l.get::<_, i64>(3)?, "title": l.get::<_, String>(4)?, "summary": l.get::<_, String>(5)?,
                        "created": l.get::<_, i64>(6)?, "modified": l.get::<_, i64>(7)?, "appVersion": l.get::<_, String>(8)?,
                        "data": serde_json::from_str::<Value>(&data).unwrap_or(Value::Null),
                    }))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            let mut d = c.prepare("SELECT nom, valeur FROM donnees WHERE utilisateur_id = ?1 ORDER BY nom")?;
            let donnees = d
                .query_map([&id], |l| {
                    let valeur: String = l.get(1)?;
                    Ok((l.get::<_, String>(0)?, serde_json::from_str::<Value>(&valeur).unwrap_or(Value::Null)))
                })?
                .collect::<Result<serde_json::Map<_, _>, _>>()?;
            let reglages: Option<String> = c
                .query_row("SELECT valeur FROM reglages WHERE utilisateur_id = ?1", [&id], |l| l.get(0))
                .optional()?;
            Ok(json!({
                "documents": documents,
                "donnees": donnees,
                "reglages": reglages.and_then(|r| serde_json::from_str::<Value>(&r).ok()).unwrap_or_else(|| json!({})),
            }))
        })
        .await?;
    Ok(Json(export))
}
