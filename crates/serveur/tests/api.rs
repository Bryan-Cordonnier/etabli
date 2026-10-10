//! Tests de l'API de bout en bout, sans réseau : chaque requête traverse le vrai routeur,
//! les vrais extracteurs d'authentification et une vraie base SQLite dans un dossier temporaire.

use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
    Router,
};
use etabli_serveur::{
    application, application_plugins, base::Base, preparer_installation, Config, Interne,
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use std::path::PathBuf;
use tower::ServiceExt;

const PAQUET: &[u8] = include_bytes!("../../../apps/desktop/src-tauri/fixtures/essai-1.0.0.etapl");
const CLE_ESSAI: &str = include_str!("../../../apps/desktop/src-tauri/fixtures/cle-essai.pub");
const MDP: &str = "une phrase de passe";

struct Banc {
    etat: etabli_serveur::etat::Etat,
    app: Router,
    plugins: Router,
    dossier: PathBuf,
    code: String,
}

struct Reponse {
    statut: StatusCode,
    en_tetes: axum::http::HeaderMap,
    octets: Vec<u8>,
}

impl Reponse {
    fn json(&self) -> Value {
        serde_json::from_slice(&self.octets).unwrap_or(Value::Null)
    }
}

impl Banc {
    async fn nouveau() -> Self {
        Self::avec(|_| {}).await
    }

    async fn avec(regler: impl FnOnce(&mut Config)) -> Self {
        let dossier =
            std::env::temp_dir().join(format!("etabli-serveur-{}", uuid::Uuid::new_v4().simple()));
        std::fs::create_dir_all(dossier.join("plugins")).unwrap();
        let base = Base::ouvrir(&dossier.join("etabli.sqlite")).unwrap();
        let mut config = Config {
            dossier: dossier.clone(),
            cle_publique: CLE_ESSAI.to_string(),
            application: None,
            origines: vec![],
            proxy_de_confiance: false,
            quota_utilisateur: 500 * 1024 * 1024,
            url_plugins: None,
        };
        regler(&mut config);
        let etat = Interne::nouveau(config, base);
        let code = preparer_installation(&etat)
            .await
            .unwrap()
            .expect("code d'installation");
        Self {
            app: application(etat.clone()),
            etat: etat.clone(),
            plugins: application_plugins(etat),
            dossier,
            code,
        }
    }

    async fn envoyer(
        &self,
        methode: Method,
        chemin: &str,
        jeton: Option<&str>,
        corps: Option<Value>,
    ) -> Reponse {
        let mut requete = Request::builder().method(methode).uri(chemin);
        if let Some(jeton) = jeton {
            requete = requete.header(header::AUTHORIZATION, format!("Bearer {jeton}"));
        }
        let corps = match corps {
            Some(valeur) => {
                requete = requete.header(header::CONTENT_TYPE, "application/json");
                Body::from(serde_json::to_vec(&valeur).unwrap())
            }
            None => Body::empty(),
        };
        self.terminer(requete.body(corps).unwrap()).await
    }

    /// Requête sur l'origine propre au plugin « essai » (second port, nom d'hôte `essai.plugins.test`).
    async fn get_plugins(&self, chemin: &str) -> Reponse {
        self.get_plugins_hote("essai.plugins.test:4301", chemin)
            .await
    }

    /// Requête sur le second port avec un en-tête `Host` choisi.
    async fn get_plugins_hote(&self, hote: &str, chemin: &str) -> Reponse {
        let requete = Request::builder()
            .uri(chemin)
            .header(header::HOST, hote)
            .body(Body::empty())
            .unwrap();
        let reponse = self.plugins.clone().oneshot(requete).await.unwrap();
        let (parts, corps) = reponse.into_parts();
        Reponse {
            statut: parts.status,
            en_tetes: parts.headers,
            octets: corps.collect().await.unwrap().to_bytes().to_vec(),
        }
    }

    async fn terminer(&self, requete: Request<Body>) -> Reponse {
        let reponse = self.app.clone().oneshot(requete).await.unwrap();
        let (parts, corps) = reponse.into_parts();
        Reponse {
            statut: parts.status,
            en_tetes: parts.headers,
            octets: corps.collect().await.unwrap().to_bytes().to_vec(),
        }
    }

    async fn get(&self, chemin: &str, jeton: Option<&str>) -> Reponse {
        self.envoyer(Method::GET, chemin, jeton, None).await
    }
    async fn post(&self, chemin: &str, jeton: Option<&str>, corps: Value) -> Reponse {
        self.envoyer(Method::POST, chemin, jeton, Some(corps)).await
    }
    async fn put(&self, chemin: &str, jeton: Option<&str>, corps: Value) -> Reponse {
        self.envoyer(Method::PUT, chemin, jeton, Some(corps)).await
    }
    async fn delete(&self, chemin: &str, jeton: Option<&str>) -> Reponse {
        self.envoyer(Method::DELETE, chemin, jeton, None).await
    }
    async fn patch(&self, chemin: &str, jeton: Option<&str>, corps: Value) -> Reponse {
        self.envoyer(Method::PATCH, chemin, jeton, Some(corps))
            .await
    }

    /// Crée l'administrateur « chef » et renvoie son jeton.
    async fn installer(&self) -> String {
        let r = self
            .post(
                "/api/installation",
                None,
                json!({ "code": self.code, "nom": "chef", "motDePasse": MDP }),
            )
            .await;
        assert_eq!(
            r.statut,
            StatusCode::CREATED,
            "{}",
            String::from_utf8_lossy(&r.octets)
        );
        r.json()["jeton"].as_str().unwrap().to_string()
    }

    async fn connecter(&self, nom: &str, mdp: &str) -> Reponse {
        self.post(
            "/api/session",
            None,
            json!({ "nom": nom, "motDePasse": mdp }),
        )
        .await
    }

    /// Crée un utilisateur par l'administrateur et le connecte ; renvoie (identifiant, jeton).
    async fn utilisateur(&self, admin: &str, nom: &str) -> (String, String) {
        let r = self
            .post(
                "/api/admin/utilisateurs",
                Some(admin),
                json!({ "nom": nom, "motDePasse": MDP }),
            )
            .await;
        assert_eq!(
            r.statut,
            StatusCode::CREATED,
            "{}",
            String::from_utf8_lossy(&r.octets)
        );
        let id = r.json()["id"].as_str().unwrap().to_string();
        let c = self.connecter(nom, MDP).await;
        assert_eq!(c.statut, StatusCode::OK);
        (id, c.json()["jeton"].as_str().unwrap().to_string())
    }

    async fn installer_plugin(&self, jeton: &str) -> Reponse {
        let requete = Request::builder()
            .method(Method::POST)
            .uri("/api/admin/plugins")
            .header(header::AUTHORIZATION, format!("Bearer {jeton}"))
            .header(header::CONTENT_TYPE, "application/octet-stream")
            .body(Body::from(PAQUET.to_vec()))
            .unwrap();
        self.terminer(requete).await
    }
}

impl Drop for Banc {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dossier);
    }
}

fn calcul(titre: &str) -> Value {
    json!({ "pluginId": "tolerie", "appId": "ve", "dataVersion": 1, "title": titre, "summary": "résumé", "data": { "epaisseur": "3" } })
}

// ——— Installation et connexion ———

#[tokio::test]
async fn installation_une_seule_fois_avec_le_bon_code() {
    let b = Banc::nouveau().await;
    let mauvais = b
        .post(
            "/api/installation",
            None,
            json!({ "code": "FAUX", "nom": "chef", "motDePasse": MDP }),
        )
        .await;
    assert_eq!(mauvais.statut, StatusCode::UNAUTHORIZED);
    let court = b
        .post(
            "/api/installation",
            None,
            json!({ "code": b.code, "nom": "chef", "motDePasse": "court" }),
        )
        .await;
    assert_eq!(court.statut, StatusCode::BAD_REQUEST);
    let nom_invalide = b
        .post(
            "/api/installation",
            None,
            json!({ "code": b.code, "nom": "a b", "motDePasse": MDP }),
        )
        .await;
    assert_eq!(nom_invalide.statut, StatusCode::BAD_REQUEST);

    let jeton = b.installer().await;
    let moi = b.get("/api/moi", Some(&jeton)).await.json();
    assert_eq!(moi["nom"], "chef");
    assert_eq!(moi["role"], "admin");

    // Le code est consommé : un second administrateur est impossible.
    let encore = b
        .post(
            "/api/installation",
            None,
            json!({ "code": b.code, "nom": "pirate", "motDePasse": MDP }),
        )
        .await;
    assert_eq!(encore.statut, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn l_installation_est_limitee_en_essais() {
    let b = Banc::nouveau().await;
    for _ in 0..5 {
        let r = b
            .post(
                "/api/installation",
                None,
                json!({ "code": "FAUX", "nom": "chef", "motDePasse": MDP }),
            )
            .await;
        assert_eq!(r.statut, StatusCode::UNAUTHORIZED);
    }
    let r = b
        .post(
            "/api/installation",
            None,
            json!({ "code": b.code, "nom": "chef", "motDePasse": MDP }),
        )
        .await;
    assert_eq!(
        r.statut,
        StatusCode::TOO_MANY_REQUESTS,
        "même le bon code est refusé pendant le blocage"
    );
    assert!(r.en_tetes.contains_key(header::RETRY_AFTER));
}

#[tokio::test]
async fn connexion_message_unique_et_blocage() {
    let b = Banc::nouveau().await;
    b.installer().await;
    let inconnu = b.connecter("personne", MDP).await;
    let mauvais = b.connecter("chef", "mauvais mot de passe").await;
    assert_eq!(inconnu.statut, StatusCode::UNAUTHORIZED);
    assert_eq!(mauvais.statut, StatusCode::UNAUTHORIZED);
    assert_eq!(
        inconnu.json(),
        mauvais.json(),
        "on ne révèle pas si l'identifiant existe"
    );

    // « chef » compte déjà 1 échec ; le blocage tombe au 5e.
    for _ in 0..3 {
        b.connecter("chef", "mauvais mot de passe").await;
    }
    assert_eq!(
        b.connecter("chef", MDP).await.statut,
        StatusCode::OK,
        "4 échecs : pas encore bloqué, et un succès efface le compteur"
    );
    for _ in 0..5 {
        b.connecter("chef", "mauvais mot de passe").await;
    }
    let bloque = b.connecter("chef", MDP).await;
    assert_eq!(
        bloque.statut,
        StatusCode::TOO_MANY_REQUESTS,
        "bon mot de passe refusé pendant le blocage"
    );
    assert!(bloque.en_tetes.contains_key(header::RETRY_AFTER));
}

#[tokio::test]
async fn connexion_insensible_a_la_casse_et_deconnexion() {
    let b = Banc::nouveau().await;
    b.installer().await;
    let c = b.connecter("  CHEF ", MDP).await;
    assert_eq!(c.statut, StatusCode::OK);
    let jeton = c.json()["jeton"].as_str().unwrap().to_string();
    assert_eq!(b.get("/api/moi", Some(&jeton)).await.statut, StatusCode::OK);
    assert_eq!(
        b.delete("/api/session", Some(&jeton)).await.statut,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        b.get("/api/moi", Some(&jeton)).await.statut,
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn toutes_les_routes_de_l_api_exigent_une_session() {
    let b = Banc::nouveau().await;
    b.installer().await;
    let routes = [
        (Method::GET, "/api/moi"),
        (Method::POST, "/api/moi/mot-de-passe"),
        (Method::GET, "/api/moi/export"),
        (Method::GET, "/api/documents"),
        (Method::PUT, "/api/documents"),
        (Method::GET, "/api/documents/3f2a9c1e"),
        (Method::DELETE, "/api/documents/3f2a9c1e"),
        (Method::GET, "/api/donnees/plugin.maths"),
        (Method::PUT, "/api/donnees/plugin.maths"),
        (Method::GET, "/api/reglages"),
        (Method::PUT, "/api/reglages"),
        (Method::GET, "/api/plugins"),
        (Method::GET, "/api/admin/utilisateurs"),
        (Method::POST, "/api/admin/utilisateurs"),
        (Method::PATCH, "/api/admin/utilisateurs/x"),
        (Method::DELETE, "/api/admin/utilisateurs/x"),
        (Method::GET, "/api/admin/plugins"),
        (Method::POST, "/api/admin/plugins"),
        (Method::PATCH, "/api/admin/plugins/maths"),
        (Method::DELETE, "/api/admin/plugins/maths"),
        (Method::GET, "/api/admin/journal"),
        (Method::GET, "/api/admin/export"),
    ];
    for (methode, chemin) in routes {
        for jeton in [None, Some("jeton-inconnu")] {
            let corps = if methode == Method::GET || methode == Method::DELETE {
                None
            } else {
                Some(json!({}))
            };
            let r = b.envoyer(methode.clone(), chemin, jeton, corps).await;
            assert_eq!(
                r.statut,
                StatusCode::UNAUTHORIZED,
                "{methode} {chemin} avec {jeton:?}"
            );
        }
    }
}

#[tokio::test]
async fn le_mot_de_passe_n_est_jamais_stocke_en_clair() {
    let b = Banc::nouveau().await;
    b.installer().await;
    let connexion = rusqlite::Connection::open(b.dossier.join("etabli.sqlite")).unwrap();
    let hache: String = connexion
        .query_row("SELECT mot_de_passe FROM utilisateurs", [], |l| l.get(0))
        .unwrap();
    assert!(hache.starts_with("$argon2id$"));
    assert!(!hache.contains(MDP));
    let n: i64 = connexion
        .query_row(
            "SELECT count(*) FROM sessions WHERE empreinte LIKE '%.%' OR length(empreinte) <> 64",
            [],
            |l| l.get(0),
        )
        .unwrap();
    assert_eq!(
        n, 0,
        "seules des empreintes SHA-256 sont stockées, jamais le jeton"
    );
}

#[tokio::test]
async fn changer_son_mot_de_passe_coupe_les_autres_sessions() {
    let b = Banc::nouveau().await;
    let admin = b.installer().await;
    let (_, ancien) = b.utilisateur(&admin, "alice").await;
    let autre_appareil = b.connecter("alice", MDP).await.json()["jeton"]
        .as_str()
        .unwrap()
        .to_string();

    let faux = b
        .post(
            "/api/moi/mot-de-passe",
            Some(&ancien),
            json!({ "actuel": "mauvais mot de passe", "nouveau": "nouvelle phrase de passe" }),
        )
        .await;
    assert_eq!(faux.statut, StatusCode::UNAUTHORIZED);
    let court = b
        .post(
            "/api/moi/mot-de-passe",
            Some(&ancien),
            json!({ "actuel": MDP, "nouveau": "court" }),
        )
        .await;
    assert_eq!(court.statut, StatusCode::BAD_REQUEST);
    let ok = b
        .post(
            "/api/moi/mot-de-passe",
            Some(&ancien),
            json!({ "actuel": MDP, "nouveau": "nouvelle phrase de passe" }),
        )
        .await;
    assert_eq!(ok.statut, StatusCode::NO_CONTENT);

    assert_eq!(
        b.get("/api/moi", Some(&ancien)).await.statut,
        StatusCode::OK,
        "la session qui change le mot de passe continue"
    );
    assert_eq!(
        b.get("/api/moi", Some(&autre_appareil)).await.statut,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        b.connecter("alice", MDP).await.statut,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        b.connecter("alice", "nouvelle phrase de passe")
            .await
            .statut,
        StatusCode::OK
    );
}

// ——— Calculs ———

#[tokio::test]
async fn calculs_creation_lecture_liste_suppression() {
    let b = Banc::nouveau().await;
    let admin = b.installer().await;
    let (_, alice) = b.utilisateur(&admin, "alice").await;

    let cree = b
        .put("/api/documents", Some(&alice), calcul("  Équerre 50 × 50 "))
        .await;
    assert_eq!(
        cree.statut,
        StatusCode::OK,
        "{}",
        String::from_utf8_lossy(&cree.octets)
    );
    let meta = cree.json();
    assert_eq!(meta["title"], "Équerre 50 × 50");
    assert_eq!(meta["version"], 1);
    let id = meta["id"].as_str().unwrap().to_string();

    let lu = b
        .get(&format!("/api/documents/{id}"), Some(&alice))
        .await
        .json();
    assert_eq!(lu["data"]["epaisseur"], "3");
    assert_eq!(lu["pluginId"], "tolerie");
    assert_eq!(lu["format"], 1);

    let liste = b
        .get("/api/documents?plugin=tolerie", Some(&alice))
        .await
        .json();
    assert_eq!(liste.as_array().unwrap().len(), 1);
    assert!(
        liste[0].get("data").is_none(),
        "la liste ne contient pas les données"
    );
    assert_eq!(
        b.get("/api/documents?plugin=maths", Some(&alice))
            .await
            .json()
            .as_array()
            .unwrap()
            .len(),
        0
    );
    assert_eq!(
        b.get("/api/documents?plugin=..%2F", Some(&alice))
            .await
            .statut,
        StatusCode::BAD_REQUEST
    );

    assert_eq!(
        b.delete(&format!("/api/documents/{id}"), Some(&alice))
            .await
            .statut,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        b.get(&format!("/api/documents/{id}"), Some(&alice))
            .await
            .statut,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        b.get("/api/documents", Some(&alice))
            .await
            .json()
            .as_array()
            .unwrap()
            .len(),
        0
    );
    assert_eq!(
        b.delete(&format!("/api/documents/{id}"), Some(&alice))
            .await
            .statut,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn calculs_conflit_de_version() {
    let b = Banc::nouveau().await;
    let admin = b.installer().await;
    let (_, alice) = b.utilisateur(&admin, "alice").await;
    let id = b
        .put("/api/documents", Some(&alice), calcul("A"))
        .await
        .json()["id"]
        .as_str()
        .unwrap()
        .to_string();

    let mut v2 = calcul("B");
    v2["id"] = json!(id);
    v2["versionAttendue"] = json!(1);
    let r = b.put("/api/documents", Some(&alice), v2.clone()).await;
    assert_eq!(
        (r.statut, r.json()["version"].clone()),
        (StatusCode::OK, json!(2))
    );

    // Un autre appareil enregistre encore avec la version 1 qu'il avait lue : refusé.
    let perime = b.put("/api/documents", Some(&alice), v2).await;
    assert_eq!(perime.statut, StatusCode::CONFLICT);
    assert_eq!(perime.json()["versionActuelle"], 2);
    let lu = b
        .get(&format!("/api/documents/{id}"), Some(&alice))
        .await
        .json();
    assert_eq!(lu["title"], "B");

    let mut v3 = calcul("C");
    v3["id"] = json!(id);
    v3["versionAttendue"] = json!(2);
    assert_eq!(
        b.put("/api/documents", Some(&alice), v3).await.statut,
        StatusCode::OK
    );
}

#[tokio::test]
async fn calculs_entrees_invalides_refusees() {
    let b = Banc::nouveau().await;
    let admin = b.installer().await;
    let (_, alice) = b.utilisateur(&admin, "alice").await;
    for id in ["../../etc/passwd", "zz", "'; DROP TABLE documents; --"] {
        let mut c = calcul("T");
        c["id"] = json!(id);
        assert_eq!(
            b.put("/api/documents", Some(&alice), c).await.statut,
            StatusCode::BAD_REQUEST,
            "{id}"
        );
    }
    let mut mauvais_plugin = calcul("T");
    mauvais_plugin["pluginId"] = json!("../x");
    assert_eq!(
        b.put("/api/documents", Some(&alice), mauvais_plugin)
            .await
            .statut,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        b.put("/api/documents", Some(&alice), calcul("   "))
            .await
            .statut,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        b.get("/api/documents/pas-un-id", Some(&alice)).await.statut,
        StatusCode::NOT_FOUND
    );

    let mut gros = calcul("Gros");
    gros["data"] = json!({ "x": "a".repeat(6 * 1024 * 1024) });
    let r = b.put("/api/documents", Some(&alice), gros).await;
    assert_eq!(r.statut, StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn un_utilisateur_ne_voit_ni_ne_touche_les_donnees_d_un_autre() {
    let b = Banc::nouveau().await;
    let admin = b.installer().await;
    let (_, alice) = b.utilisateur(&admin, "alice").await;
    let (_, bob) = b.utilisateur(&admin, "bob").await;

    let id = b
        .put("/api/documents", Some(&alice), calcul("Secret d'Alice"))
        .await
        .json()["id"]
        .as_str()
        .unwrap()
        .to_string();
    b.put(
        "/api/donnees/plugin.economie",
        Some(&alice),
        json!({ "barre": 6000 }),
    )
    .await;
    b.put(
        "/api/reglages",
        Some(&alice),
        json!({ "settings": { "theme": "sombre" } }),
    )
    .await;

    // Lecture, liste, suppression : rien n'est visible pour Bob.
    assert_eq!(
        b.get(&format!("/api/documents/{id}"), Some(&bob))
            .await
            .statut,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        b.get("/api/documents", Some(&bob))
            .await
            .json()
            .as_array()
            .unwrap()
            .len(),
        0
    );
    assert_eq!(
        b.delete(&format!("/api/documents/{id}"), Some(&bob))
            .await
            .statut,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        b.get("/api/donnees/plugin.economie", Some(&bob))
            .await
            .json(),
        Value::Null
    );
    assert_eq!(b.get("/api/reglages", Some(&bob)).await.json(), json!({}));

    // Bob enregistre avec le même identifiant : c'est SON calcul, celui d'Alice ne change pas.
    let mut c = calcul("Calcul de Bob");
    c["id"] = json!(id);
    let r = b.put("/api/documents", Some(&bob), c).await;
    assert_eq!(r.statut, StatusCode::OK);
    assert_eq!(r.json()["version"], 1);
    assert_eq!(
        b.get(&format!("/api/documents/{id}"), Some(&alice))
            .await
            .json()["title"],
        "Secret d'Alice"
    );

    // L'export personnel ne contient que ses propres données.
    let export = b.get("/api/moi/export", Some(&bob)).await.json();
    assert_eq!(export["documents"].as_array().unwrap().len(), 1);
    assert_eq!(export["documents"][0]["title"], "Calcul de Bob");
    assert!(export["donnees"].as_object().unwrap().is_empty());
}

// ——— Données et réglages ———

#[tokio::test]
async fn donnees_et_reglages() {
    let b = Banc::nouveau().await;
    let admin = b.installer().await;
    let (_, alice) = b.utilisateur(&admin, "alice").await;

    assert_eq!(
        b.get("/api/donnees/plugin.economie", Some(&alice))
            .await
            .json(),
        Value::Null
    );
    let v1 = b
        .put(
            "/api/donnees/plugin.economie",
            Some(&alice),
            json!({ "barre": 6000 }),
        )
        .await;
    assert_eq!(v1.json()["version"], 1);
    let v2 = b
        .put(
            "/api/donnees/plugin.economie",
            Some(&alice),
            json!({ "barre": 3000 }),
        )
        .await;
    assert_eq!(v2.json()["version"], 2);
    assert_eq!(
        b.get("/api/donnees/plugin.economie", Some(&alice))
            .await
            .json()["barre"],
        3000
    );

    for nom in ["..%2Fsettings", "a%2Fb", ".cache", "Fournisseurs", "c%3A"] {
        assert_eq!(
            b.get(&format!("/api/donnees/{nom}"), Some(&alice))
                .await
                .statut,
            StatusCode::BAD_REQUEST,
            "{nom}"
        );
        assert_eq!(
            b.put(&format!("/api/donnees/{nom}"), Some(&alice), json!(1))
                .await
                .statut,
            StatusCode::BAD_REQUEST,
            "{nom}"
        );
    }
    let gros = b
        .put(
            "/api/donnees/plugin.x",
            Some(&alice),
            json!({ "x": "a".repeat(1_100_000) }),
        )
        .await;
    assert!(
        matches!(gros.statut, StatusCode::PAYLOAD_TOO_LARGE),
        "{}",
        gros.statut
    );

    assert_eq!(b.get("/api/reglages", Some(&alice)).await.json(), json!({}));
    assert_eq!(
        b.put("/api/reglages", Some(&alice), json!([1, 2]))
            .await
            .statut,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        b.put(
            "/api/reglages",
            Some(&alice),
            json!({ "settings": { "theme": "sombre" }, "session": {} })
        )
        .await
        .statut,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        b.get("/api/reglages", Some(&alice)).await.json()["settings"]["theme"],
        "sombre"
    );
}

// ——— Administration ———

#[tokio::test]
async fn l_administration_est_reservee_a_l_administrateur() {
    let b = Banc::nouveau().await;
    let admin = b.installer().await;
    let (id, alice) = b.utilisateur(&admin, "alice").await;
    let interdits = [
        (Method::GET, "/api/admin/utilisateurs".to_string()),
        (Method::POST, "/api/admin/utilisateurs".to_string()),
        (Method::PATCH, format!("/api/admin/utilisateurs/{id}")),
        (Method::DELETE, format!("/api/admin/utilisateurs/{id}")),
        (Method::GET, "/api/admin/plugins".to_string()),
        (Method::PATCH, "/api/admin/plugins/maths".to_string()),
        (Method::DELETE, "/api/admin/plugins/maths".to_string()),
        (Method::GET, "/api/admin/journal".to_string()),
        (Method::GET, "/api/admin/export".to_string()),
    ];
    for (methode, chemin) in interdits {
        let corps = if methode == Method::GET || methode == Method::DELETE {
            None
        } else {
            Some(json!({}))
        };
        let r = b
            .envoyer(methode.clone(), &chemin, Some(&alice), corps)
            .await;
        assert_eq!(r.statut, StatusCode::FORBIDDEN, "{methode} {chemin}");
    }
    assert_eq!(
        b.installer_plugin(&alice).await.statut,
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn gestion_des_utilisateurs() {
    let b = Banc::nouveau().await;
    let admin = b.installer().await;
    let (alice_id, alice) = b.utilisateur(&admin, "alice").await;

    // Doublon (casse ignorée), nom invalide, mot de passe faible.
    assert_eq!(
        b.post(
            "/api/admin/utilisateurs",
            Some(&admin),
            json!({ "nom": "ALICE", "motDePasse": MDP })
        )
        .await
        .statut,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        b.post(
            "/api/admin/utilisateurs",
            Some(&admin),
            json!({ "nom": "x", "motDePasse": MDP })
        )
        .await
        .statut,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        b.post(
            "/api/admin/utilisateurs",
            Some(&admin),
            json!({ "nom": "bob", "motDePasse": "faible" })
        )
        .await
        .statut,
        StatusCode::BAD_REQUEST
    );
    // Le rôle demandé est ignoré : il n'y a qu'un administrateur.
    let tentative = b
        .post(
            "/api/admin/utilisateurs",
            Some(&admin),
            json!({ "nom": "bob", "motDePasse": MDP, "role": "admin" }),
        )
        .await;
    assert_eq!(tentative.json()["role"], "utilisateur");

    // Désactiver coupe les sessions et interdit de se reconnecter.
    assert_eq!(
        b.patch(
            &format!("/api/admin/utilisateurs/{alice_id}"),
            Some(&admin),
            json!({ "actif": false })
        )
        .await
        .statut,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        b.get("/api/moi", Some(&alice)).await.statut,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        b.connecter("alice", MDP).await.statut,
        StatusCode::UNAUTHORIZED
    );
    b.patch(
        &format!("/api/admin/utilisateurs/{alice_id}"),
        Some(&admin),
        json!({ "actif": true }),
    )
    .await;
    assert_eq!(b.connecter("alice", MDP).await.statut, StatusCode::OK);

    // Réinitialisation du mot de passe.
    let nouvelle = b.connecter("alice", MDP).await.json()["jeton"]
        .as_str()
        .unwrap()
        .to_string();
    b.patch(
        &format!("/api/admin/utilisateurs/{alice_id}"),
        Some(&admin),
        json!({ "motDePasse": "mot de passe neuf 1" }),
    )
    .await;
    assert_eq!(
        b.get("/api/moi", Some(&nouvelle)).await.statut,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        b.connecter("alice", "mot de passe neuf 1").await.statut,
        StatusCode::OK
    );

    // L'administrateur ne se désactive ni ne se supprime.
    let moi = b.get("/api/moi", Some(&admin)).await.json();
    let admin_id = moi["id"].as_str().unwrap();
    assert_eq!(
        b.patch(
            &format!("/api/admin/utilisateurs/{admin_id}"),
            Some(&admin),
            json!({ "actif": false })
        )
        .await
        .statut,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        b.delete(
            &format!("/api/admin/utilisateurs/{admin_id}?confirmer=chef"),
            Some(&admin)
        )
        .await
        .statut,
        StatusCode::BAD_REQUEST
    );

    // Suppression définitive : confirmation obligatoire, données comprises.
    let jeton = b.connecter("alice", "mot de passe neuf 1").await.json()["jeton"]
        .as_str()
        .unwrap()
        .to_string();
    b.put("/api/documents", Some(&jeton), calcul("à supprimer"))
        .await;
    assert_eq!(
        b.delete(&format!("/api/admin/utilisateurs/{alice_id}"), Some(&admin))
            .await
            .statut,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        b.delete(
            &format!("/api/admin/utilisateurs/{alice_id}?confirmer=alice"),
            Some(&admin)
        )
        .await
        .statut,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        b.get("/api/moi", Some(&jeton)).await.statut,
        StatusCode::UNAUTHORIZED
    );
    let connexion = rusqlite::Connection::open(b.dossier.join("etabli.sqlite")).unwrap();
    let restes: i64 = connexion
        .query_row("SELECT count(*) FROM documents", [], |l| l.get(0))
        .unwrap();
    assert_eq!(
        restes, 0,
        "les calculs de l'utilisateur supprimé disparaissent avec lui"
    );

    let journal = b.get("/api/admin/journal", Some(&admin)).await.json();
    let actions: Vec<&str> = journal
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["action"].as_str().unwrap())
        .collect();
    for attendue in [
        "installation",
        "utilisateur_cree",
        "utilisateur_desactive",
        "mot_de_passe_reinitialise",
        "utilisateur_supprime",
        "connexion_refusee",
    ] {
        assert!(
            actions.contains(&attendue),
            "journal sans « {attendue} » : {actions:?}"
        );
    }
}

// ——— Plugins ———

#[tokio::test]
async fn plugin_signe_installe_liste_et_servi() {
    let b = Banc::nouveau().await;
    let admin = b.installer().await;
    let (alice_id, alice) = b.utilisateur(&admin, "alice").await;

    let installe = b.installer_plugin(&admin).await;
    assert_eq!(
        installe.statut,
        StatusCode::CREATED,
        "{}",
        String::from_utf8_lossy(&installe.octets)
    );
    assert_eq!(installe.json()["id"], "essai");

    let liste = b.get("/api/plugins", Some(&alice)).await.json();
    assert_eq!(liste[0]["manifest"]["id"], "essai");
    assert_eq!(
        b.get("/api/moi", Some(&alice)).await.json()["plugins"],
        json!(["essai"])
    );

    // Les fichiers sont servis avec une politique sans réseau, lisible par un cadre isolé.
    let page = b.get("/plugins/essai/apps/bonjour/index.html", None).await;
    assert_eq!(page.statut, StatusCode::OK);
    assert_eq!(
        page.en_tetes[header::CONTENT_TYPE],
        "text/html; charset=utf-8"
    );
    let csp = page.en_tetes[header::CONTENT_SECURITY_POLICY]
        .to_str()
        .unwrap();
    assert!(csp.contains("connect-src 'none'"));
    // Origine opaque même hors d'un cadre (page ouverte directement) : jamais `allow-same-origin`.
    assert!(
        csp.contains("sandbox allow-scripts") && !csp.contains("allow-same-origin"),
        "{csp}"
    );
    assert_eq!(page.en_tetes[header::ACCESS_CONTROL_ALLOW_ORIGIN], "*");
    assert_eq!(page.en_tetes[header::X_CONTENT_TYPE_OPTIONS], "nosniff");

    // Seulement pour certains utilisateurs.
    assert_eq!(
        b.patch(
            "/api/admin/plugins/essai",
            Some(&admin),
            json!({ "actifGlobal": false })
        )
        .await
        .statut,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        b.get("/api/plugins", Some(&alice))
            .await
            .json()
            .as_array()
            .unwrap()
            .len(),
        0
    );
    assert_eq!(
        b.get("/api/plugins", Some(&admin))
            .await
            .json()
            .as_array()
            .unwrap()
            .len(),
        0,
        "même l'administrateur n'a que ce qui lui est donné"
    );
    assert_eq!(
        b.patch(
            "/api/admin/plugins/essai",
            Some(&admin),
            json!({ "utilisateurs": [alice_id] })
        )
        .await
        .statut,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        b.get("/api/plugins", Some(&alice))
            .await
            .json()
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        b.patch(
            "/api/admin/plugins/essai",
            Some(&admin),
            json!({ "utilisateurs": ["inconnu"] })
        )
        .await
        .statut,
        StatusCode::BAD_REQUEST
    );

    // Mise à jour : les réglages d'accès sont conservés.
    assert_eq!(b.installer_plugin(&admin).await.statut, StatusCode::CREATED);
    assert_eq!(
        b.get("/api/plugins", Some(&alice))
            .await
            .json()
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let entrees = std::fs::read_dir(b.dossier.join("plugins"))
        .unwrap()
        .count();
    assert_eq!(entrees, 1, "aucun dossier temporaire ne reste");

    // Désinstallation.
    assert_eq!(
        b.delete("/api/admin/plugins/essai", Some(&admin))
            .await
            .statut,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        b.get("/plugins/essai/manifest.json", None).await.statut,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        b.delete("/api/admin/plugins/essai", Some(&admin))
            .await
            .statut,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn plugins_refus_des_paquets_douteux_et_des_evasions_de_chemin() {
    let b = Banc::nouveau().await;
    let admin = b.installer().await;

    // Pas un paquet, ou paquet modifié : refusés avant toute écriture.
    let requete = |octets: Vec<u8>| {
        Request::builder()
            .method(Method::POST)
            .uri("/api/admin/plugins")
            .header(header::AUTHORIZATION, format!("Bearer {admin}"))
            .body(Body::from(octets))
            .unwrap()
    };
    assert_eq!(
        b.terminer(requete(b"pas un zip".to_vec())).await.statut,
        StatusCode::BAD_REQUEST
    );
    let mut falsifie = PAQUET.to_vec();
    let milieu = falsifie.len() / 2;
    falsifie[milieu] ^= 0xff;
    assert_eq!(
        b.terminer(requete(falsifie)).await.statut,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        std::fs::read_dir(b.dossier.join("plugins"))
            .unwrap()
            .count(),
        0
    );

    // Serveur configuré avec une autre clé : le paquet d'essai n'est pas accepté.
    let autre = Banc::avec(|c| c.cle_publique = etabli_serveur::cle_publique_officielle()).await;
    let admin2 = autre.installer().await;
    assert_eq!(
        autre.installer_plugin(&admin2).await.statut,
        StatusCode::BAD_REQUEST
    );

    // Évasions de chemin vers un fichier secret posé à côté des plugins.
    std::fs::write(b.dossier.join("secret.txt"), "secret").unwrap();
    assert_eq!(b.installer_plugin(&admin).await.statut, StatusCode::CREATED);
    for chemin in [
        "/plugins/essai/..%2F..%2Fsecret.txt",
        "/plugins/essai/%2e%2e/%2e%2e/secret.txt",
        "/plugins/essai/apps/../../../secret.txt",
        "/plugins/..%2Fetabli.sqlite/x",
        "/plugins/essai/apps",
        "/plugins/essai/manifest.json%00.png",
        "/plugins/ESSAI/manifest.json",
    ] {
        let r = b.get(chemin, None).await;
        assert_ne!(r.statut, StatusCode::OK, "{chemin}");
        assert!(
            !String::from_utf8_lossy(&r.octets).contains("secret"),
            "{chemin}"
        );
    }
}

// ——— Export, en-têtes, CORS ———

#[tokio::test]
async fn export_de_la_base_pour_l_administrateur() {
    let b = Banc::nouveau().await;
    let admin = b.installer().await;
    let (_, alice) = b.utilisateur(&admin, "alice").await;
    b.put("/api/documents", Some(&alice), calcul("sauvegardé"))
        .await;

    let r = b.get("/api/admin/export", Some(&admin)).await;
    assert_eq!(r.statut, StatusCode::OK);
    assert_eq!(r.en_tetes[header::CONTENT_TYPE], "application/vnd.sqlite3");
    assert!(r.octets.starts_with(b"SQLite format 3\0"));
    let temporaires: Vec<_> = std::fs::read_dir(&b.dossier)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|e| e.file_name().to_string_lossy().starts_with(".export-"))
        .collect();
    assert!(
        temporaires.is_empty(),
        "le fichier temporaire d'export est supprimé"
    );

    // La copie est une vraie base lisible.
    let copie = b.dossier.join("copie.sqlite");
    std::fs::write(&copie, &r.octets).unwrap();
    let connexion = rusqlite::Connection::open(&copie).unwrap();
    let n: i64 = connexion
        .query_row("SELECT count(*) FROM documents", [], |l| l.get(0))
        .unwrap();
    assert_eq!(n, 1);
}

#[tokio::test]
async fn en_tetes_de_securite_et_cors() {
    let b = Banc::nouveau().await;
    let admin = b.installer().await;
    let api = b.get("/api/moi", Some(&admin)).await;
    assert_eq!(api.en_tetes[header::CACHE_CONTROL], "no-store");
    assert_eq!(api.en_tetes[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
    assert_eq!(api.en_tetes[header::REFERRER_POLICY], "no-referrer");

    // Sans origine configurée, aucun en-tête CORS : un autre site ne peut pas appeler l'API depuis un navigateur.
    let requete = Request::builder()
        .method(Method::OPTIONS)
        .uri("/api/moi")
        .header(header::ORIGIN, "https://exemple.fr")
        .header(header::ACCESS_CONTROL_REQUEST_METHOD, "GET")
        .body(Body::empty())
        .unwrap();
    let r = b.terminer(requete).await;
    assert!(!r.en_tetes.contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN));

    let ouvert = Banc::avec(|c| c.origines = vec!["https://budget.exemple.fr".into()]).await;
    let preflight = |origine: &str| {
        Request::builder()
            .method(Method::OPTIONS)
            .uri("/api/moi")
            .header(header::ORIGIN, origine)
            .header(header::ACCESS_CONTROL_REQUEST_METHOD, "GET")
            .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "authorization")
            .body(Body::empty())
            .unwrap()
    };
    let autorise = ouvert
        .terminer(preflight("https://budget.exemple.fr"))
        .await;
    assert_eq!(
        autorise.en_tetes[header::ACCESS_CONTROL_ALLOW_ORIGIN],
        "https://budget.exemple.fr"
    );
    let refuse = ouvert.terminer(preflight("https://pirate.exemple")).await;
    assert!(!refuse
        .en_tetes
        .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN));
}

#[tokio::test]
async fn l_application_web_est_servie_avec_une_politique_stricte() {
    let dossier_app =
        std::env::temp_dir().join(format!("etabli-app-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&dossier_app).unwrap();
    std::fs::write(
        dossier_app.join("index.html"),
        "<!doctype html><title>Établi</title>",
    )
    .unwrap();
    let chemin = dossier_app.clone();
    let b = Banc::avec(move |c| c.application = Some(chemin)).await;

    for adresse in ["/", "/une/page/inconnue"] {
        let r = b.get(adresse, None).await;
        assert!(
            String::from_utf8_lossy(&r.octets).contains("<title>Établi</title>"),
            "{adresse}"
        );
        let csp = r.en_tetes[header::CONTENT_SECURITY_POLICY]
            .to_str()
            .unwrap()
            .to_string();
        assert!(
            csp.contains("frame-ancestors 'none'") && csp.contains("default-src 'self'"),
            "{csp}"
        );
        assert_eq!(r.en_tetes["x-frame-options"], "DENY");
    }
    let _ = std::fs::remove_dir_all(dossier_app);
}

#[tokio::test]
async fn adresse_du_client_derriere_un_proxy_de_confiance() {
    // Sans option, X-Forwarded-For est ignoré : un client ne peut pas se faire passer pour une autre adresse
    // afin d'échapper au blocage par adresse.
    let b = Banc::nouveau().await;
    b.installer().await;
    for i in 0..40 {
        let requete = Request::builder()
            .method(Method::POST)
            .uri("/api/session")
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-forwarded-for", format!("10.0.0.{i}"))
            .body(Body::from(
                json!({ "nom": format!("inconnu{i}"), "motDePasse": "mauvais mot de passe" })
                    .to_string(),
            ))
            .unwrap();
        b.terminer(requete).await;
    }
    let bloque = b.connecter("chef", MDP).await;
    assert_eq!(
        bloque.statut,
        StatusCode::TOO_MANY_REQUESTS,
        "30 échecs depuis la même adresse bloquent l'adresse"
    );
}

#[tokio::test]
async fn quota_de_stockage_par_utilisateur() {
    let b = Banc::avec(|c| c.quota_utilisateur = 2000).await;
    let admin = b.installer().await;
    let (_, alice) = b.utilisateur(&admin, "alice").await;
    let (_, bob) = b.utilisateur(&admin, "bob").await;
    let mut gros = calcul("Gros");
    gros["data"] = json!({ "x": "a".repeat(1500) });
    let id = b
        .put("/api/documents", Some(&alice), gros.clone())
        .await
        .json()["id"]
        .as_str()
        .unwrap()
        .to_string();
    // Un second calcul de cette taille dépasse le quota d'Alice…
    assert_eq!(
        b.put("/api/documents", Some(&alice), gros.clone())
            .await
            .statut,
        StatusCode::BAD_REQUEST
    );
    // …mais ré-enregistrer le même calcul ne compte pas deux fois, et Bob a son propre quota.
    gros["id"] = json!(id);
    assert_eq!(
        b.put("/api/documents", Some(&alice), gros.clone())
            .await
            .statut,
        StatusCode::OK
    );
    gros.as_object_mut().unwrap().remove("id");
    assert_eq!(
        b.put("/api/documents", Some(&bob), gros).await.statut,
        StatusCode::OK
    );
}

#[tokio::test]
async fn adresses_api_inconnues_et_identifiant_enorme() {
    let dossier_app =
        std::env::temp_dir().join(format!("etabli-app-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&dossier_app).unwrap();
    std::fs::write(dossier_app.join("index.html"), "<title>Établi</title>").unwrap();
    let chemin = dossier_app.clone();
    let b = Banc::avec(move |c| c.application = Some(chemin)).await;
    b.installer().await;

    // Une faute de frappe dans l'API ne doit pas renvoyer la page d'accueil avec un code 200.
    let r = b.get("/api/documentz", None).await;
    assert_eq!(r.statut, StatusCode::NOT_FOUND);
    assert!(r.json()["erreur"].is_string());

    // Un identifiant de 100 Ko est refusé sans ralentir ni gonfler la mémoire du limiteur.
    let r = b.connecter(&"a".repeat(100_000), MDP).await;
    assert_eq!(r.statut, StatusCode::UNAUTHORIZED);
    let _ = std::fs::remove_dir_all(dossier_app);
}

#[tokio::test]
async fn connexions_simultanees_toutes_traitees() {
    // Les hachages Argon2 passent par une file de 4 : 12 connexions en parallèle doivent toutes aboutir.
    let b = Banc::nouveau().await;
    b.installer().await;
    let mut taches = Vec::new();
    for _ in 0..12 {
        let app = b.app.clone();
        taches.push(tokio::spawn(async move {
            let requete = Request::builder()
                .method(Method::POST)
                .uri("/api/session")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    json!({ "nom": "chef", "motDePasse": MDP }).to_string(),
                ))
                .unwrap();
            app.oneshot(requete).await.unwrap().status()
        }));
    }
    for t in taches {
        assert_eq!(t.await.unwrap(), StatusCode::OK);
    }
}

#[tokio::test]
async fn etat_public_sans_session() {
    let b = Banc::nouveau().await;
    let avant = b.get("/api/etat", None).await;
    assert_eq!(avant.statut, StatusCode::OK);
    assert_eq!(avant.json()["serveur"], "etabli");
    assert_eq!(avant.json()["installe"], false);
    b.installer().await;
    assert_eq!(b.get("/api/etat", None).await.json()["installe"], true);
    // Rien d'autre n'est révélé : ni utilisateurs, ni plugins, ni chemins.
    let mut champs: Vec<String> = b
        .get("/api/etat", None)
        .await
        .json()
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    champs.sort();
    assert_eq!(
        champs,
        ["installe", "serveur", "urlPlugins", "version"],
        "seuls ces champs sont publics"
    );
}

#[tokio::test]
async fn plugins_livres_avec_l_application_web_servis_en_repli() {
    // La version web contient une copie des plugins (mode « Établi seul ») ; la route /plugins ne doit pas la masquer.
    let dossier_app =
        std::env::temp_dir().join(format!("etabli-app-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(dossier_app.join("plugins/livre/apps")).unwrap();
    std::fs::create_dir_all(dossier_app.join("plugins/essai")).unwrap();
    std::fs::write(dossier_app.join("index.html"), "<title>Établi</title>").unwrap();
    std::fs::write(
        dossier_app.join("plugins/livre/manifest.json"),
        r#"{"id":"livre"}"#,
    )
    .unwrap();
    std::fs::write(
        dossier_app.join("plugins/livre/apps/a.html"),
        "<p>livré</p>",
    )
    .unwrap();
    std::fs::write(
        dossier_app.join("plugins/essai/manifest.json"),
        r#"{"id":"essai","origine":"livre avec l'application"}"#,
    )
    .unwrap();
    std::fs::write(dossier_app.join("secret.txt"), "secret").unwrap();
    let chemin = dossier_app.clone();
    let b = Banc::avec(move |c| c.application = Some(chemin)).await;
    let admin = b.installer().await;

    let livre = b.get("/plugins/livre/apps/a.html", None).await;
    assert_eq!(livre.statut, StatusCode::OK);
    assert!(String::from_utf8_lossy(&livre.octets).contains("livré"));
    // Même politique d'isolation que les plugins du serveur.
    assert!(livre.en_tetes[header::CONTENT_SECURITY_POLICY]
        .to_str()
        .unwrap()
        .contains("sandbox allow-scripts"));

    // Un plugin installé sur le serveur l'emporte sur la copie livrée du même nom.
    assert_eq!(b.installer_plugin(&admin).await.statut, StatusCode::CREATED);
    let installe = b.get("/plugins/essai/manifest.json", None).await;
    assert!(!String::from_utf8_lossy(&installe.octets).contains("livre avec l'application"));

    // Les mêmes garde-fous de chemin s'appliquent au repli.
    for chemin in [
        "/plugins/livre/..%2F..%2Fsecret.txt",
        "/plugins/livre/%2e%2e/%2e%2e/secret.txt",
        "/plugins/inconnu/manifest.json",
    ] {
        let r = b.get(chemin, None).await;
        assert_ne!(r.statut, StatusCode::OK, "{chemin}");
        assert!(
            !String::from_utf8_lossy(&r.octets).contains("secret"),
            "{chemin}"
        );
    }
    let _ = std::fs::remove_dir_all(dossier_app);
}

#[tokio::test]
async fn origine_propre_a_chaque_plugin() {
    let dossier_app =
        std::env::temp_dir().join(format!("etabli-app-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&dossier_app).unwrap();
    std::fs::write(dossier_app.join("index.html"), "<title>Établi</title>").unwrap();
    let chemin = dossier_app.clone();
    let b = Banc::avec(move |c| {
        c.application = Some(chemin);
        c.url_plugins = Some("http://{id}.plugins.test:4301".into());
    })
    .await;
    let admin = b.installer().await;
    assert_eq!(b.installer_plugin(&admin).await.statut, StatusCode::CREATED);

    // L'état public donne le modèle ; la liste des plugins dit quels fichiers garder hors ligne.
    assert_eq!(
        b.get("/api/etat", None).await.json()["urlPlugins"],
        "http://{id}.plugins.test:4301"
    );
    let plugins = b.get("/api/plugins", Some(&admin)).await.json();
    let fichiers: Vec<&str> = plugins[0]["fichiers"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| f.as_str().unwrap())
        .collect();
    assert!(
        fichiers.contains(&"manifest.json") && fichiers.contains(&"apps/bonjour/index.html"),
        "{fichiers:?}"
    );

    // Sur l'origine du plugin : ses fichiers, sans la directive « sandbox » (le cadre l'ajoute), et rien d'autre.
    let page = b.get_plugins("/apps/bonjour/index.html").await;
    assert_eq!(page.statut, StatusCode::OK);
    let csp = page.en_tetes[header::CONTENT_SECURITY_POLICY]
        .to_str()
        .unwrap();
    assert!(
        csp.contains("connect-src 'none'") && !csp.contains("sandbox"),
        "{csp}"
    );
    assert_eq!(page.en_tetes[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
    for interdit in [
        "/api/etat",
        "/api/moi",
        "/",
        "/index.html",
        "/api/documents",
        "/plugins/essai/manifest.json",
    ] {
        assert_eq!(
            b.get_plugins(interdit).await.statut,
            StatusCode::NOT_FOUND,
            "{interdit}"
        );
    }

    // Un plugin ne lit jamais les fichiers d'un autre : le nom d'hôte désigne le seul plugin servi.
    assert_eq!(
        b.get_plugins_hote("autre.plugins.test:4301", "/apps/bonjour/index.html")
            .await
            .statut,
        StatusCode::NOT_FOUND
    );
    // Hôtes étrangers ou mal formés : rien n'est servi (protection contre le « DNS rebinding »).
    for hote in [
        "127.0.0.1:4301",
        "plugins.test",
        "essai.evil.com",
        "essai.plugins.test.evil.com",
        "a.essai.plugins.test",
        "essai.plugins.test:abc",
        "",
    ] {
        assert_eq!(
            b.get_plugins_hote(hote, "/apps/bonjour/index.html")
                .await
                .statut,
            StatusCode::NOT_FOUND,
            "hôte {hote:?}"
        );
    }
    // Sans en-tête Host du tout.
    let sans_hote = Request::builder()
        .uri("/manifest.json")
        .body(Body::empty())
        .unwrap();
    let r = b.plugins.clone().oneshot(sans_hote).await.unwrap();
    assert_eq!(r.status(), StatusCode::NOT_FOUND);

    // Les mêmes garde-fous de chemin.
    std::fs::write(b.dossier.join("secret.txt"), "secret").unwrap();
    for chemin in [
        "/..%2F..%2Fsecret.txt",
        "/%2e%2e/%2e%2e/secret.txt",
        "/apps/../../../secret.txt",
        "/..%2Fetabli.sqlite",
    ] {
        let r = b.get_plugins(chemin).await;
        assert_ne!(r.statut, StatusCode::OK, "{chemin}");
        assert!(
            !String::from_utf8_lossy(&r.octets).contains("secret"),
            "{chemin}"
        );
    }

    // Service worker et page d'enregistrement, aussi réservés à l'hôte d'un plugin.
    let sw = b.get_plugins("/sw-plugins.js").await;
    assert_eq!(sw.statut, StatusCode::OK);
    assert_eq!(sw.en_tetes["service-worker-allowed"], "/");
    let code = String::from_utf8_lossy(&sw.octets);
    assert!(
        !code.contains("/api/"),
        "le service worker ne touche pas à l'API"
    );
    for page in ["/enregistrer.html", "/enregistrer.js", "/sw-plugins.js"] {
        assert_eq!(b.get_plugins(page).await.statut, StatusCode::OK, "{page}");
        assert_eq!(
            b.get_plugins_hote("evil.com", page).await.statut,
            StatusCode::NOT_FOUND,
            "{page} sur un hôte étranger"
        );
    }

    // La page de l'application autorise ces cadres, et eux seulement.
    let accueil = b.get("/", None).await;
    let csp_app = accueil.en_tetes[header::CONTENT_SECURITY_POLICY]
        .to_str()
        .unwrap();
    assert!(
        csp_app.contains("frame-src 'self' http://*.plugins.test:4301;"),
        "{csp_app}"
    );
    let _ = std::fs::remove_dir_all(dossier_app);
}

#[tokio::test]
async fn sans_origine_dediee_les_cadres_restent_sur_l_origine_principale() {
    let dossier_app =
        std::env::temp_dir().join(format!("etabli-app-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&dossier_app).unwrap();
    std::fs::write(dossier_app.join("index.html"), "<title>Établi</title>").unwrap();
    let chemin = dossier_app.clone();
    let b = Banc::avec(move |c| c.application = Some(chemin)).await;
    assert_eq!(
        b.get("/api/etat", None).await.json()["urlPlugins"],
        Value::Null
    );
    let csp = b.get("/", None).await.en_tetes[header::CONTENT_SECURITY_POLICY]
        .to_str()
        .unwrap()
        .to_string();
    assert!(csp.contains("frame-src 'self';"), "{csp}");
    let _ = std::fs::remove_dir_all(dossier_app);
}

#[tokio::test]
async fn un_changement_de_donnee_est_diffuse_au_meme_utilisateur_seulement() {
    let b = Banc::nouveau().await;
    let admin = b.installer().await;
    // Le flux demande une session.
    assert_eq!(
        b.get("/api/evenements", None).await.statut,
        StatusCode::UNAUTHORIZED
    );
    let mut ecoute = b.etat.evenements.subscribe();
    assert_eq!(
        b.put(
            "/api/donnees/plugin.courses",
            Some(&admin),
            json!({ "a": 1 })
        )
        .await
        .statut,
        StatusCode::OK
    );
    let e = tokio::time::timeout(std::time::Duration::from_secs(2), ecoute.recv())
        .await
        .unwrap()
        .unwrap();
    assert_eq!((e.genre, e.nom.as_str()), ("donnees", "plugin.courses"));
}
