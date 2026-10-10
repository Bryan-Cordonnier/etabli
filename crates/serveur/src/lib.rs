//! Serveur facultatif d'Établi (docs/16) : comptes, calculs, réglages et plugins d'une équipe ou
//! d'une maison, sur une machine que l'on héberge soi-même. Sans serveur, Établi fonctionne
//! comme avant, entièrement en local.

pub mod auth;
pub mod base;
pub mod erreur;
pub mod etat;
mod hote_plugins;
mod routes_admin;
mod routes_documents;
mod routes_donnees;
mod routes_evenements;
mod routes_plugins;
mod routes_session;
pub mod securite;

use axum::{
    extract::{DefaultBodyLimit, Request, State},
    http::{header, HeaderName, HeaderValue, Method},
    middleware::{self, Next},
    response::Response,
    routing::{get, patch, post},
    Router,
};
use etat::Etat;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    services::{ServeDir, ServeFile},
};

pub use etat::{Config, Interne};
pub use hote_plugins::ModelePlugins;

/// Clé publique des mises à jour d'Établi : elle signe aussi les paquets de plugins (`.etapl`).
pub fn cle_publique_officielle() -> String {
    let conf: serde_json::Value = serde_json::from_str(include_str!(
        "../../../apps/desktop/src-tauri/tauri.conf.json"
    ))
    .unwrap_or(serde_json::Value::Null);
    conf["plugins"]["updater"]["pubkey"]
        .as_str()
        .unwrap_or_default()
        .to_string()
}

/// Taille maximale d'un paquet de plugin envoyé par l'administrateur.
const PAQUET_MAX: usize = 70 * 1024 * 1024;
/// Corps de requête par défaut ; les calculs et les paquets ont leur propre limite.
const CORPS_MAX: usize = 256 * 1024;

/// En-têtes de sécurité communs. Les pages de plugins portent leur propre politique.
async fn en_tetes(State(etat): State<Etat>, requete: Request, suite: Next) -> Response {
    let chemin = requete.uri().path().to_string();
    let mut reponse = suite.run(requete).await;
    let h = reponse.headers_mut();
    h.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    h.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    if chemin.starts_with("/api/") {
        h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    } else if !chemin.starts_with("/plugins/") {
        // Pages de l'application : aucune ressource extérieure, pas d'intégration dans un autre site. Les cadres
        // des mini-apps peuvent venir de l'origine dédiée aux plugins, si elle est configurée.
        let cadres = match etat
            .config
            .url_plugins
            .as_deref()
            .map(ModelePlugins::analyser)
        {
            Some(Ok(modele)) => format!("'self' {}", modele.source_csp()),
            _ => "'self'".to_string(),
        };
        let politique = format!(
            "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; \
             img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src {cadres}; \
             worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
        );
        if let Ok(valeur) = HeaderValue::from_str(&politique) {
            h.insert(header::CONTENT_SECURITY_POLICY, valeur);
        }
        h.insert(
            HeaderName::from_static("x-frame-options"),
            HeaderValue::from_static("DENY"),
        );
    }
    reponse
}

/// Routeur des origines de plugins (second port) : chaque plugin a son propre nom d'hôte (`<id>.<domaine>`), et ce
/// routeur ne sert, selon l'en-tête `Host`, que les fichiers de CE plugin et son service worker — ni API, ni application,
/// ni donnée d'utilisateur, ni fichier d'un autre plugin.
pub fn application_plugins(etat: Etat) -> Router {
    Router::new()
        .route("/{*chemin}", get(routes_plugins::fichier_hote))
        .route("/enregistrer.html", get(routes_plugins::page_enregistrer))
        .route("/enregistrer.js", get(routes_plugins::script_enregistrer))
        .route("/sw-plugins.js", get(routes_plugins::service_worker))
        .layer(middleware::from_fn(en_tetes_plugins))
        .with_state(etat)
}

/// En-têtes communs de l'origine des plugins (la politique propre à chaque réponse est posée par les routes).
async fn en_tetes_plugins(requete: Request, suite: Next) -> Response {
    let mut reponse = suite.run(requete).await;
    let h = reponse.headers_mut();
    h.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    h.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    reponse
}

pub fn application(etat: Etat) -> Router {
    let api = Router::new()
        .route("/etat", get(routes_session::etat_public))
        .route("/installation", post(routes_session::installation))
        .route(
            "/session",
            post(routes_session::connexion).delete(routes_session::deconnexion),
        )
        .route("/moi", get(routes_session::moi))
        .route("/evenements", get(routes_evenements::flux))
        .route(
            "/moi/mot-de-passe",
            post(routes_session::changer_mot_de_passe),
        )
        .route("/moi/export", get(routes_session::export_personnel))
        .route(
            "/documents",
            get(routes_documents::lister)
                .put(routes_documents::enregistrer)
                .layer(DefaultBodyLimit::max(
                    etabli_noyau::document::TAILLE_MAX + 4096,
                )),
        )
        .route(
            "/documents/{id}",
            get(routes_documents::lire).delete(routes_documents::supprimer),
        )
        .route(
            "/donnees/{nom}",
            get(routes_donnees::lire)
                .put(routes_donnees::ecrire)
                .layer(DefaultBodyLimit::max(routes_donnees::TAILLE_MAX + 4096)),
        )
        .route(
            "/reglages",
            get(routes_donnees::lire_reglages)
                .put(routes_donnees::ecrire_reglages)
                .layer(DefaultBodyLimit::max(routes_donnees::TAILLE_MAX + 4096)),
        )
        .route("/plugins", get(routes_plugins::lister))
        .route(
            "/admin/utilisateurs",
            get(routes_admin::lister_utilisateurs).post(routes_admin::creer_utilisateur),
        )
        .route(
            "/admin/utilisateurs/{id}",
            patch(routes_admin::modifier_utilisateur).delete(routes_admin::supprimer_utilisateur),
        )
        .route(
            "/admin/plugins",
            get(routes_admin::lister_plugins)
                .post(routes_admin::installer_plugin)
                .layer(DefaultBodyLimit::max(PAQUET_MAX)),
        )
        .route(
            "/admin/plugins/{id}",
            patch(routes_admin::modifier_plugin).delete(routes_admin::supprimer_plugin),
        )
        .route("/admin/journal", get(routes_admin::journal))
        .route("/admin/export", get(routes_admin::exporter))
        .fallback(|| async { erreur::Erreur::Introuvable });

    let mut app = Router::new()
        .nest("/api", api)
        .route("/plugins/{id}/{*chemin}", get(routes_plugins::fichier))
        .layer(DefaultBodyLimit::max(CORPS_MAX));

    if let Some(dossier) = etat.config.application.clone() {
        let index = dossier.join("index.html");
        app = app.fallback_service(ServeDir::new(dossier).not_found_service(ServeFile::new(index)));
    }

    let origines: Vec<HeaderValue> = etat
        .config
        .origines
        .iter()
        .filter_map(|o| o.parse().ok())
        .collect();
    let mut app = app.layer(middleware::from_fn_with_state(etat.clone(), en_tetes));
    if !origines.is_empty() {
        app = app.layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::list(origines))
                .allow_methods([
                    Method::GET,
                    Method::PUT,
                    Method::POST,
                    Method::PATCH,
                    Method::DELETE,
                ])
                .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
                .max_age(std::time::Duration::from_secs(600)),
        );
    }
    app.with_state(etat)
}

/// Au premier lancement (aucun utilisateur), fabrique le code d'installation, n'en garde que
/// l'empreinte en base et le renvoie pour affichage dans la console.
pub async fn preparer_installation(etat: &Etat) -> erreur::Resultat<Option<String>> {
    etat.base
        .executer(|c| {
            let utilisateurs: i64 =
                c.query_row("SELECT count(*) FROM utilisateurs", [], |l| l.get(0))?;
            if utilisateurs > 0 {
                return Ok(None);
            }
            let code = securite::nouveau_code_installation();
            c.execute(
                "INSERT INTO configuration(cle, valeur) VALUES ('code_installation', ?1) \
                 ON CONFLICT(cle) DO UPDATE SET valeur = ?1",
                [securite::empreinte(&code)],
            )?;
            Ok(Some(code))
        })
        .await
}
