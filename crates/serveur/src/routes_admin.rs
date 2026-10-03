//! Administration : utilisateurs, plugins, journal, export de la base. Réservé à l'administrateur.
//! Chaque action est inscrite dans le journal d'audit.

use crate::{
    auth::Admin,
    base::{journaliser, maintenant_ms},
    erreur::{Erreur, Resultat},
    etat::Etat,
    securite,
};
use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use etabli_noyau::{
    identifiants::{plugin_valide, utilisateur_valide},
    paquet::{fichiers_du_plugin, lire_manifeste, ouvrir_paquet},
};
use rusqlite::OptionalExtension;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{fs, path::Path as CheminFs};

// ——— Utilisateurs ———

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NouvelUtilisateur {
    pub nom: String,
    pub mot_de_passe: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModifUtilisateur {
    pub actif: Option<bool>,
    pub mot_de_passe: Option<String>,
}

pub async fn lister_utilisateurs(
    State(etat): State<Etat>,
    _admin: Admin,
) -> Resultat<Json<Vec<Value>>> {
    let liste = etat
        .base
        .executer(|c| {
            let mut requete = c.prepare("SELECT id, nom, role, actif, cree, derniere_connexion FROM utilisateurs ORDER BY nom")?;
            let lignes = requete
                .query_map([], |l| {
                    Ok(json!({
                        "id": l.get::<_, String>(0)?, "nom": l.get::<_, String>(1)?, "role": l.get::<_, String>(2)?,
                        "actif": l.get::<_, i64>(3)? == 1, "cree": l.get::<_, i64>(4)?, "derniereConnexion": l.get::<_, Option<i64>>(5)?,
                    }))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(lignes)
        })
        .await?;
    Ok(Json(liste))
}

pub async fn creer_utilisateur(
    State(etat): State<Etat>,
    Admin(admin): Admin,
    Json(requete): Json<NouvelUtilisateur>,
) -> Resultat<(StatusCode, Json<Value>)> {
    let nom = requete.nom.trim().to_string();
    if !utilisateur_valide(&nom) {
        return Err(Erreur::requete("L'identifiant doit faire 3 à 32 caractères : lettres, chiffres, point, tiret ou tiret bas."));
    }
    securite::controler_mot_de_passe(&requete.mot_de_passe, &nom).map_err(Erreur::Requete)?;
    let mot_de_passe = requete.mot_de_passe;
    let hache = securite::hacher_async(mot_de_passe)
        .await
        .map_err(Erreur::Interne)?;
    let id = uuid::Uuid::new_v4().simple().to_string();
    let (id2, nom2) = (id.clone(), nom.clone());
    etat.base
        .executer(move |c| {
            let tx = c.transaction()?;
            // Le rôle est toujours « utilisateur » : il n'y a qu'un administrateur.
            let ajout = tx.execute(
                "INSERT INTO utilisateurs(id, nom, mot_de_passe, role, cree) VALUES (?1, ?2, ?3, 'utilisateur', ?4)",
                rusqlite::params![id2, nom2, hache, maintenant_ms() as i64],
            );
            match ajout {
                Err(rusqlite::Error::SqliteFailure(e, _)) if e.code == rusqlite::ErrorCode::ConstraintViolation => {
                    return Err(Erreur::requete("Cet identifiant existe déjà."));
                }
                autre => {
                    autre?;
                }
            }
            journaliser(&tx, Some(&admin.utilisateur_id), "utilisateur_cree", Some(&nom2), None)?;
            tx.commit()?;
            Ok(())
        })
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": id, "nom": nom, "role": "utilisateur", "actif": true })),
    ))
}

pub async fn modifier_utilisateur(
    State(etat): State<Etat>,
    Admin(admin): Admin,
    Path(id): Path<String>,
    Json(requete): Json<ModifUtilisateur>,
) -> Resultat<StatusCode> {
    let hache = match requete.mot_de_passe {
        Some(mdp) => {
            let id_lecture = id.clone();
            let nom: Option<String> = etat
                .base
                .executer(move |c| {
                    Ok(c.query_row(
                        "SELECT nom FROM utilisateurs WHERE id = ?1",
                        [&id_lecture],
                        |l| l.get(0),
                    )
                    .optional()?)
                })
                .await?;
            let nom = nom.ok_or(Erreur::Introuvable)?;
            securite::controler_mot_de_passe(&mdp, &nom).map_err(Erreur::Requete)?;
            Some(securite::hacher_async(mdp).await.map_err(Erreur::Interne)?)
        }
        None => None,
    };
    etat.base
        .executer(move |c| {
            let tx = c.transaction()?;
            let role: Option<String> = tx
                .query_row("SELECT role FROM utilisateurs WHERE id = ?1", [&id], |l| {
                    l.get(0)
                })
                .optional()?;
            let role = role.ok_or(Erreur::Introuvable)?;
            if requete.actif == Some(false) && role == "admin" {
                return Err(Erreur::requete(
                    "L'administrateur ne peut pas être désactivé.",
                ));
            }
            if let Some(actif) = requete.actif {
                tx.execute(
                    "UPDATE utilisateurs SET actif = ?1 WHERE id = ?2",
                    rusqlite::params![i64::from(actif), id],
                )?;
                if !actif {
                    tx.execute("DELETE FROM sessions WHERE utilisateur_id = ?1", [&id])?;
                }
                journaliser(
                    &tx,
                    Some(&admin.utilisateur_id),
                    if actif {
                        "utilisateur_active"
                    } else {
                        "utilisateur_desactive"
                    },
                    Some(&id),
                    None,
                )?;
            }
            if let Some(hache) = hache {
                tx.execute(
                    "UPDATE utilisateurs SET mot_de_passe = ?1 WHERE id = ?2",
                    rusqlite::params![hache, id],
                )?;
                // Toutes ses sessions s'arrêtent : il doit se reconnecter avec le nouveau mot de passe.
                tx.execute("DELETE FROM sessions WHERE utilisateur_id = ?1", [&id])?;
                journaliser(
                    &tx,
                    Some(&admin.utilisateur_id),
                    "mot_de_passe_reinitialise",
                    Some(&id),
                    None,
                )?;
            }
            tx.commit()?;
            Ok(())
        })
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct Confirmation {
    pub confirmer: Option<String>,
}

/// Suppression définitive d'un utilisateur et de toutes ses données. L'identifiant de l'utilisateur
/// doit être répété dans `?confirmer=`.
pub async fn supprimer_utilisateur(
    State(etat): State<Etat>,
    Admin(admin): Admin,
    Path(id): Path<String>,
    Query(confirmation): Query<Confirmation>,
) -> Resultat<StatusCode> {
    etat.base
        .executer(move |c| {
            let tx = c.transaction()?;
            let ligne: Option<(String, String)> = tx
                .query_row(
                    "SELECT nom, role FROM utilisateurs WHERE id = ?1",
                    [&id],
                    |l| Ok((l.get(0)?, l.get(1)?)),
                )
                .optional()?;
            let (nom, role) = ligne.ok_or(Erreur::Introuvable)?;
            if role == "admin" {
                return Err(Erreur::requete(
                    "L'administrateur ne peut pas être supprimé.",
                ));
            }
            if confirmation.confirmer.as_deref().map(str::to_lowercase) != Some(nom.to_lowercase())
            {
                return Err(Erreur::requete(
                    "Pour supprimer définitivement, répétez l'identifiant dans « confirmer ».",
                ));
            }
            tx.execute("DELETE FROM utilisateurs WHERE id = ?1", [&id])?;
            journaliser(
                &tx,
                Some(&admin.utilisateur_id),
                "utilisateur_supprime",
                Some(&nom),
                None,
            )?;
            tx.commit()?;
            Ok(())
        })
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ——— Plugins ———

pub async fn lister_plugins(State(etat): State<Etat>, _admin: Admin) -> Resultat<Json<Vec<Value>>> {
    let liste = etat
        .base
        .executer(|c| {
            let mut requete = c.prepare("SELECT id, version, manifeste, actif_global, installe FROM plugins ORDER BY id")?;
            let mut plugins = requete
                .query_map([], |l| {
                    Ok((l.get::<_, String>(0)?, l.get::<_, String>(1)?, l.get::<_, String>(2)?, l.get::<_, i64>(3)? == 1, l.get::<_, i64>(4)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            let mut acces = c.prepare("SELECT utilisateur_id FROM plugin_acces WHERE plugin_id = ?1 ORDER BY utilisateur_id")?;
            let mut sortie = Vec::new();
            for (id, version, manifeste, actif_global, installe) in plugins.drain(..) {
                let utilisateurs = acces.query_map([&id], |l| l.get::<_, String>(0))?.collect::<Result<Vec<_>, _>>()?;
                sortie.push(json!({
                    "id": id, "version": version, "actifGlobal": actif_global, "installe": installe, "utilisateurs": utilisateurs,
                    "manifest": serde_json::from_str::<Value>(&manifeste).unwrap_or(Value::Null),
                }));
            }
            Ok(sortie)
        })
        .await?;
    Ok(Json(liste))
}

/// Écrit les fichiers du plugin dans un dossier de travail puis le met en place d'un coup.
fn mettre_en_place(
    racine: &CheminFs,
    id: &str,
    fichiers: &[etabli_noyau::paquet::FichierPlugin],
) -> Result<(), Erreur> {
    fs::create_dir_all(racine)?;
    let jeton = uuid::Uuid::new_v4().simple().to_string();
    let temporaire = racine.join(format!(".installation-{jeton}"));
    let ecrire = || -> Result<(), Erreur> {
        for f in fichiers {
            let cible = temporaire.join(&f.chemin);
            if let Some(parent) = cible.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&cible, &f.octets)?;
        }
        Ok(())
    };
    if let Err(e) = ecrire() {
        let _ = fs::remove_dir_all(&temporaire);
        return Err(e);
    }
    let definitif = racine.join(id);
    let ancien = racine.join(format!(".ancien-{jeton}"));
    let avait_ancien = definitif.exists();
    if avait_ancien {
        fs::rename(&definitif, &ancien).inspect_err(|_| {
            let _ = fs::remove_dir_all(&temporaire);
        })?;
    }
    if let Err(e) = fs::rename(&temporaire, &definitif) {
        // On remet l'ancienne version en place si quoi que ce soit échoue.
        if avait_ancien {
            let _ = fs::rename(&ancien, &definitif);
        }
        let _ = fs::remove_dir_all(&temporaire);
        return Err(e.into());
    }
    if avait_ancien {
        let _ = fs::remove_dir_all(&ancien);
    }
    Ok(())
}

/// Installe (ou met à jour) un plugin depuis un paquet `.etabli-plugin` envoyé tel quel dans le corps.
/// La signature doit correspondre à la clé publique du serveur.
pub async fn installer_plugin(
    State(etat): State<Etat>,
    Admin(admin): Admin,
    corps: Bytes,
) -> Resultat<(StatusCode, Json<Value>)> {
    let cle = etat.config.cle_publique.clone();
    let dossier = etat.dossier_plugins();
    let (id, manifeste) =
        tokio::task::spawn_blocking(move || -> Result<(String, Value), Erreur> {
            let zip = ouvrir_paquet(&corps, &cle).map_err(Erreur::Requete)?;
            let fichiers = fichiers_du_plugin(&zip).map_err(Erreur::Requete)?;
            let (id, manifeste) = lire_manifeste(&fichiers).map_err(Erreur::Requete)?;
            mettre_en_place(&dossier, &id, &fichiers)?;
            Ok((id, manifeste))
        })
        .await
        .map_err(|e| Erreur::Interne(e.to_string()))??;

    let version: String = manifeste
        .get("version")
        .and_then(Value::as_str)
        .unwrap_or("0.0.0")
        .chars()
        .take(40)
        .collect();
    let (id2, version2, texte) = (id.clone(), version.clone(), manifeste.to_string());
    etat.base
        .executer(move |c| {
            let tx = c.transaction()?;
            tx.execute(
                "INSERT INTO plugins(id, version, manifeste, installe) VALUES (?1, ?2, ?3, ?4) \
                 ON CONFLICT(id) DO UPDATE SET version = ?2, manifeste = ?3, installe = ?4",
                rusqlite::params![id2, version2, texte, maintenant_ms() as i64],
            )?;
            journaliser(
                &tx,
                Some(&admin.utilisateur_id),
                "plugin_installe",
                Some(&id2),
                Some(&version2),
            )?;
            tx.commit()?;
            Ok(())
        })
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": id, "version": version })),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModifPlugin {
    /// Vrai : le plugin est disponible pour tous ; faux : seulement pour les utilisateurs listés.
    pub actif_global: Option<bool>,
    pub utilisateurs: Option<Vec<String>>,
}

pub async fn modifier_plugin(
    State(etat): State<Etat>,
    Admin(admin): Admin,
    Path(id): Path<String>,
    Json(requete): Json<ModifPlugin>,
) -> Resultat<StatusCode> {
    if !plugin_valide(&id) {
        return Err(Erreur::Introuvable);
    }
    etat.base
        .executer(move |c| {
            let tx = c.transaction()?;
            let existe: bool = tx.query_row("SELECT 1 FROM plugins WHERE id = ?1", [&id], |_| Ok(true)).optional()?.unwrap_or(false);
            if !existe {
                return Err(Erreur::Introuvable);
            }
            if let Some(global) = requete.actif_global {
                tx.execute("UPDATE plugins SET actif_global = ?1 WHERE id = ?2", rusqlite::params![i64::from(global), id])?;
            }
            if let Some(utilisateurs) = requete.utilisateurs {
                tx.execute("DELETE FROM plugin_acces WHERE plugin_id = ?1", [&id])?;
                for utilisateur in utilisateurs {
                    let ajout = tx.execute(
                        "INSERT OR IGNORE INTO plugin_acces(plugin_id, utilisateur_id) VALUES (?1, ?2)",
                        rusqlite::params![id, utilisateur],
                    );
                    if let Err(rusqlite::Error::SqliteFailure(e, _)) = &ajout {
                        if e.code == rusqlite::ErrorCode::ConstraintViolation {
                            return Err(Erreur::requete("Un des utilisateurs indiqués n'existe pas."));
                        }
                    }
                    ajout?;
                }
            }
            journaliser(&tx, Some(&admin.utilisateur_id), "plugin_modifie", Some(&id), None)?;
            tx.commit()?;
            Ok(())
        })
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn supprimer_plugin(
    State(etat): State<Etat>,
    Admin(admin): Admin,
    Path(id): Path<String>,
) -> Resultat<StatusCode> {
    if !plugin_valide(&id) {
        return Err(Erreur::Introuvable);
    }
    let dossier = etat.dossier_plugins().join(&id);
    let id2 = id.clone();
    let supprimes = etat
        .base
        .executer(move |c| {
            let tx = c.transaction()?;
            let n = tx.execute("DELETE FROM plugins WHERE id = ?1", [&id2])?;
            if n > 0 {
                journaliser(
                    &tx,
                    Some(&admin.utilisateur_id),
                    "plugin_supprime",
                    Some(&id2),
                    None,
                )?;
            }
            tx.commit()?;
            Ok(n)
        })
        .await?;
    if supprimes == 0 {
        return Err(Erreur::Introuvable);
    }
    // Les calculs des utilisateurs ne sont jamais touchés : seuls les fichiers du plugin disparaissent.
    let _ = tokio::fs::remove_dir_all(dossier).await;
    Ok(StatusCode::NO_CONTENT)
}

// ——— Journal et export ———

#[derive(Deserialize)]
pub struct LimiteJournal {
    pub limite: Option<i64>,
}

pub async fn journal(
    State(etat): State<Etat>,
    _admin: Admin,
    Query(q): Query<LimiteJournal>,
) -> Resultat<Json<Vec<Value>>> {
    let limite = q.limite.unwrap_or(200).clamp(1, 1000);
    let lignes = etat
        .base
        .executer(move |c| {
            let mut requete = c.prepare("SELECT id, horodatage, acteur, action, cible, detail FROM journal ORDER BY id DESC LIMIT ?1")?;
            let lignes = requete
                .query_map([limite], |l| {
                    Ok(json!({
                        "id": l.get::<_, i64>(0)?, "horodatage": l.get::<_, i64>(1)?, "acteur": l.get::<_, Option<String>>(2)?,
                        "action": l.get::<_, String>(3)?, "cible": l.get::<_, Option<String>>(4)?, "detail": l.get::<_, Option<String>>(5)?,
                    }))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(lignes)
        })
        .await?;
    Ok(Json(lignes))
}

/// Copie cohérente de la base (`VACUUM INTO`), à télécharger pour une sauvegarde.
pub async fn exporter(State(etat): State<Etat>, Admin(admin): Admin) -> Resultat<Response> {
    let temporaire = etat
        .config
        .dossier
        .join(format!(".export-{}.sqlite", uuid::Uuid::new_v4().simple()));
    let chemin = temporaire.to_string_lossy().into_owned();
    let acteur = admin.utilisateur_id.clone();
    etat.base
        .executer(move |c| {
            c.execute("VACUUM INTO ?1", [&chemin])?;
            journaliser(c, Some(&acteur), "export_base", None, None)?;
            Ok(())
        })
        .await?;
    let octets = tokio::fs::read(&temporaire).await;
    let _ = tokio::fs::remove_file(&temporaire).await;
    let octets = octets?;
    let mut reponse = octets.into_response();
    let en_tetes = reponse.headers_mut();
    en_tetes.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/vnd.sqlite3"),
    );
    en_tetes.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"etabli.sqlite\""),
    );
    Ok(reponse)
}
