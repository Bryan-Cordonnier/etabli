//! Plugins : liste pour l'utilisateur connecté et service des fichiers des plugins installés.
//!
//! Les fichiers d'un plugin sont publics (ils ne contiennent aucune donnée d'utilisateur) : une
//! mini-app est affichée dans un cadre isolé et ne peut pas envoyer de jeton. Chaque réponse
//! porte une politique de sécurité sans accès au réseau.

use crate::hote_plugins::ModelePlugins;
use crate::{
    auth::Session,
    erreur::{Erreur, Resultat},
    etat::Etat,
};
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, Response, StatusCode},
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

/// Même politique sur l'origine dédiée aux plugins, mais sans `sandbox` : le cadre de l'application l'ajoute lui-même
/// (avec `allow-same-origin`, sans danger puisque cette origine ne contient rien de l'application) pour que le service
/// worker de cette origine puisse servir les plugins hors ligne.
const CSP_PLUGIN_ORIGINE: &str = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; \
    img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'none'; \
    base-uri 'none'; form-action 'none'";

/// Page, script et service worker de l'origine des plugins (hors ligne). Le service worker met en cache les fichiers
/// des plugins (réseau d'abord, copie gardée pour quand le serveur est injoignable) ; la page reçoit de l'application
/// la liste des fichiers à garder d'avance.
const PAGE_ENREGISTRER: &str = "<!doctype html><meta charset=\"utf-8\"><title>Plugins</title><script src=\"/enregistrer.js\"></script>";
const SCRIPT_ENREGISTRER: &str = r#"// Enregistre le service worker des plugins et garde d'avance les fichiers demandés par l'application.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw-plugins.js', { scope: '/' }).then(() => navigator.serviceWorker.ready).then(() => {
    window.parent.postMessage({ type: 'etabli:plugins-prets' }, '*');
  }).catch(() => window.parent.postMessage({ type: 'etabli:plugins-indisponibles' }, '*'));
}
window.addEventListener('message', (event) => {
  const donnees = event.data;
  if (!donnees || donnees.type !== 'etabli:garder' || !Array.isArray(donnees.chemins)) return;
  const chemins = donnees.chemins.filter((c) => typeof c === 'string' && c.startsWith('/') && !c.startsWith('//'));
  Promise.allSettled(chemins.map((c) => fetch(c))).then((r) => {
    event.source && event.source.postMessage({ type: 'etabli:gardes', total: chemins.length, reussis: r.filter((x) => x.status === 'fulfilled' && x.value.ok).length }, '*');
  });
});
"#;
const SERVICE_WORKER: &str = r#"// Service worker de l'origine des plugins d'Établi : les plugins restent utilisables hors ligne.
const CACHE = 'etabli-plugin-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const requete = event.request;
  const adresse = new URL(requete.url);
  if (requete.method !== 'GET' || adresse.origin !== self.location.origin || adresse.pathname === '/sw-plugins.js') return;
  event.respondWith((async () => {
    const arret = new AbortController();
    const delai = setTimeout(() => arret.abort(), 5000);
    try {
      const reponse = await fetch(requete, { signal: arret.signal });
      if (reponse.ok) {
        const copie = reponse.clone();
        caches.open(CACHE).then((cache) => cache.put(requete, copie));
      }
      return reponse;
    } catch {
      return (await caches.match(requete, { ignoreSearch: true })) || Response.error();
    } finally {
      clearTimeout(delai);
    }
  })());
});
"#;

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
    // Même forme que la commande `plugins_list` de l'application de bureau, plus la liste des fichiers du plugin
    // (pour les garder d'avance hors ligne).
    let racine = etat.dossier_plugins();
    let liste = manifestes
        .iter()
        .filter_map(|m| serde_json::from_str::<Value>(m).ok())
        .map(|manifest| {
            let id = manifest.get("id").and_then(Value::as_str).unwrap_or_default().to_string();
            let fichiers = fichiers_du_plugin(&racine.join(&id));
            json!({ "manifest": manifest, "official": true, "source": "catalogue", "fichiers": fichiers })
        })
        .collect();
    Ok(Json(liste))
}

/// Chemins (relatifs, avec des « / ») de tous les fichiers d'un plugin installé.
fn fichiers_du_plugin(dossier: &std::path::Path) -> Vec<String> {
    fn parcourir(base: &std::path::Path, dossier: &std::path::Path, sortie: &mut Vec<String>) {
        let Ok(entrees) = std::fs::read_dir(dossier) else {
            return;
        };
        for entree in entrees.filter_map(Result::ok) {
            let chemin = entree.path();
            // Pas de lien symbolique suivi : seuls les vrais fichiers du plugin sont listés.
            let Ok(type_fichier) = entree.file_type() else {
                continue;
            };
            if type_fichier.is_dir() {
                parcourir(base, &chemin, sortie);
            } else if type_fichier.is_file() {
                if let Ok(relatif) = chemin.strip_prefix(base) {
                    sortie.push(
                        relatif
                            .components()
                            .map(|c| c.as_os_str().to_string_lossy())
                            .collect::<Vec<_>>()
                            .join("/"),
                    );
                }
            }
        }
    }
    let mut sortie = Vec::new();
    parcourir(dossier, dossier, &mut sortie);
    sortie.sort();
    sortie
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

/// Fichier d'un plugin sur l'origine principale : politique avec `sandbox` (origine opaque, même ouvert directement).
pub async fn fichier(
    State(etat): State<Etat>,
    Path((id, chemin)): Path<(String, String)>,
) -> Result<Response<Body>, Erreur> {
    servir(&etat, &id, &chemin, CSP_PLUGIN).await
}

/// Identifiant du plugin désigné par l'en-tête `Host` (origine propre à chaque plugin), ou « introuvable » : hôte inconnu,
/// modèle absent ou plugin non valide.
fn plugin_de_l_hote(etat: &Etat, en_tetes: &HeaderMap) -> Result<String, Erreur> {
    let modele = etat
        .config
        .url_plugins
        .as_deref()
        .and_then(|u| ModelePlugins::analyser(u).ok())
        .ok_or(Erreur::Introuvable)?;
    en_tetes
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| modele.id_depuis_hote(h))
        .ok_or(Erreur::Introuvable)
}

/// Fichier d'un plugin sur son origine propre : seul le plugin désigné par le nom d'hôte est servi.
pub async fn fichier_hote(
    State(etat): State<Etat>,
    en_tetes: HeaderMap,
    Path(chemin): Path<String>,
) -> Result<Response<Body>, Erreur> {
    let id = plugin_de_l_hote(&etat, &en_tetes)?;
    servir(&etat, &id, &chemin, CSP_PLUGIN_ORIGINE).await
}

fn statique(
    contenu: &'static str,
    type_contenu: &'static str,
    service_worker: bool,
) -> Response<Body> {
    let mut reponse = Response::new(Body::from(contenu));
    let h = reponse.headers_mut();
    h.insert(header::CONTENT_TYPE, HeaderValue::from_static(type_contenu));
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    h.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "default-src 'none'; script-src 'self'; connect-src 'self'; frame-ancestors *",
        ),
    );
    if service_worker {
        h.insert("service-worker-allowed", HeaderValue::from_static("/"));
    }
    reponse
}

pub async fn page_enregistrer(
    State(etat): State<Etat>,
    en_tetes: HeaderMap,
) -> Result<Response<Body>, Erreur> {
    plugin_de_l_hote(&etat, &en_tetes)?;
    Ok(statique(
        PAGE_ENREGISTRER,
        "text/html; charset=utf-8",
        false,
    ))
}
pub async fn script_enregistrer(
    State(etat): State<Etat>,
    en_tetes: HeaderMap,
) -> Result<Response<Body>, Erreur> {
    plugin_de_l_hote(&etat, &en_tetes)?;
    Ok(statique(
        SCRIPT_ENREGISTRER,
        "text/javascript; charset=utf-8",
        false,
    ))
}
pub async fn service_worker(
    State(etat): State<Etat>,
    en_tetes: HeaderMap,
) -> Result<Response<Body>, Erreur> {
    plugin_de_l_hote(&etat, &en_tetes)?;
    Ok(statique(
        SERVICE_WORKER,
        "text/javascript; charset=utf-8",
        true,
    ))
}

async fn servir(
    etat: &Etat,
    id: &str,
    chemin: &str,
    csp: &'static str,
) -> Result<Response<Body>, Erreur> {
    // D'abord les plugins installés sur le serveur ; à défaut, ceux livrés avec la version web servie à la racine
    // (`<application>/plugins/`), que le mode « Établi seul » utilise : sans ce repli, cette route les masquerait.
    let mut racines = vec![etat.dossier_plugins()];
    if let Some(application) = &etat.config.application {
        racines.push(application.join("plugins"));
    }
    let Some(fichier) = racines
        .iter()
        .find_map(|racine| chemin_sur(racine, id, chemin))
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
        HeaderValue::from_static(type_mime(chemin)),
    );
    en_tetes.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(csp),
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
