//! Plugins : liste pour l'utilisateur connecté et service des fichiers des plugins installés.
//!
//! Les fichiers d'un plugin sont publics (ils ne contiennent aucune donnée d'utilisateur) : une
//! mini-app est affichée dans un cadre isolé et ne peut pas envoyer de jeton. Chaque réponse
//! porte une politique de sécurité sans accès au réseau.

use crate::{
    auth::Session,
    erreur::{Erreur, Resultat},
    etat::Etat,
};
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderValue, Response, StatusCode},
    Json,
};
use etabli_noyau::{identifiants::plugin_valide, paquet::type_mime};
use serde_json::{json, Value};
use std::path::PathBuf;

/// Politique de sécurité des pages de plugins : aucun accès réseau, seulement leurs propres fichiers.
/// `sandbox allow-scripts` (sans `allow-same-origin`) impose une origine opaque même si la page est ouverte
/// directement dans un onglet : un plugin ne peut jamais lire ce que l'application garde pour l'origine du serveur.
const CSP_PLUGIN: &str = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; \
    img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'none'; \
    base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts";

pub async fn lister(State(etat): State<Etat>, session: Session) -> Resultat<Json<Vec<Value>>> {
    let manifestes: Vec<String> = etat
        .base
        .executer(move |c| {
            let mut requete = c.prepare(
                "SELECT p.manifeste FROM plugins p WHERE p.actif_global = 1 \
                 OR EXISTS (SELECT 1 FROM plugin_acces a WHERE a.plugin_id = p.id AND a.utilisateur_id = ?1) ORDER BY p.id",
            )?;
            let lignes = requete.query_map([&session.utilisateur_id], |l| l.get::<_, String>(0))?.collect::<Result<Vec<_>, _>>()?;
            Ok(lignes)
        })
        .await?;
    // Même forme que la commande `plugins_list` de l'application de bureau.
    let liste = manifestes
        .iter()
        .filter_map(|m| serde_json::from_str::<Value>(m).ok())
        .map(|manifest| json!({ "manifest": manifest, "official": true, "source": "catalogue" }))
        .collect();
    Ok(Json(liste))
}

/// Chemin sûr sous le dossier du plugin : segments simples seulement, et résultat contrôlé après
/// résolution des liens symboliques.
fn chemin_sur(racine: &std::path::Path, id: &str, chemin: &str) -> Option<PathBuf> {
    if !plugin_valide(id) {
        return None;
    }
    let mut fichier = racine.join(id);
    for segment in chemin.split('/') {
        if segment.is_empty()
            || segment == "."
            || segment == ".."
            || segment.contains(['\\', '\0', ':'])
        {
            return None;
        }
        fichier.push(segment);
    }
    let reel = fichier.canonicalize().ok()?;
    let base = racine.join(id).canonicalize().ok()?;
    (reel.starts_with(&base) && reel.is_file()).then_some(reel)
}

pub async fn fichier(
    State(etat): State<Etat>,
    Path((id, chemin)): Path<(String, String)>,
) -> Result<Response<Body>, Erreur> {
    // D'abord les plugins installés sur le serveur ; à défaut, ceux livrés avec la version web servie à la racine
    // (`<application>/plugins/`), que le mode « Établi seul » utilise : sans ce repli, cette route les masquerait.
    let mut racines = vec![etat.dossier_plugins()];
    if let Some(application) = &etat.config.application {
        racines.push(application.join("plugins"));
    }
    let Some(fichier) = racines
        .iter()
        .find_map(|racine| chemin_sur(racine, &id, &chemin))
    else {
        return Err(Erreur::Introuvable);
    };
    let octets = tokio::fs::read(&fichier)
        .await
        .map_err(|_| Erreur::Introuvable)?;
    let mut reponse = Response::new(Body::from(octets));
    *reponse.status_mut() = StatusCode::OK;
    let en_tetes = reponse.headers_mut();
    en_tetes.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(type_mime(&chemin)),
    );
    en_tetes.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(CSP_PLUGIN),
    );
    // Le cadre isolé a une origine opaque : ses scripts modules sont des requêtes CORS.
    en_tetes.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    en_tetes.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    Ok(reponse)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn chemins_sur_refuse_les_evasions() {
        let racine =
            std::env::temp_dir().join(format!("etabli-chemins-{}", uuid::Uuid::new_v4().simple()));
        fs::create_dir_all(racine.join("maths/apps")).unwrap();
        fs::write(racine.join("maths/manifest.json"), "{}").unwrap();
        fs::write(racine.join("maths/apps/a.html"), "x").unwrap();
        fs::write(racine.join("secret.txt"), "secret").unwrap();

        assert!(chemin_sur(&racine, "maths", "manifest.json").is_some());
        assert!(chemin_sur(&racine, "maths", "apps/a.html").is_some());
        for mauvais in [
            "../secret.txt",
            "apps/../../secret.txt",
            "",
            "apps/",
            "/etc/passwd",
            "a\\b",
            "apps//a.html",
            "./manifest.json",
            "c:",
        ] {
            assert!(chemin_sur(&racine, "maths", mauvais).is_none(), "{mauvais}");
        }
        assert!(chemin_sur(&racine, "..", "secret.txt").is_none());
        assert!(chemin_sur(&racine, "MATHS", "manifest.json").is_none());
        assert!(chemin_sur(&racine, "absent", "manifest.json").is_none());
        assert!(
            chemin_sur(&racine, "maths", "apps").is_none(),
            "un dossier n'est pas servi"
        );
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(racine.join("secret.txt"), racine.join("maths/lien.txt"))
                .unwrap();
            assert!(
                chemin_sur(&racine, "maths", "lien.txt").is_none(),
                "un lien vers l'extérieur est refusé"
            );
        }
        let _ = fs::remove_dir_all(&racine);
    }
}
