//! `etabli-serveur` : lance le serveur facultatif d'Établi.

use clap::Parser;
use etabli_serveur::{
    application, base::Base, cle_publique_officielle, preparer_installation, Config, Interne,
};
use std::{net::SocketAddr, path::PathBuf};

#[derive(Parser)]
#[command(
    name = "etabli-serveur",
    version,
    about = "Serveur facultatif d'Établi : comptes, calculs et plugins d'une équipe"
)]
struct Arguments {
    /// Dossier des données (base etabli.sqlite et plugins/). À sauvegarder.
    #[arg(long, env = "ETABLI_DONNEES", default_value = "donnees")]
    donnees: PathBuf,

    /// Adresse d'écoute. Par défaut, seulement cette machine : pour l'ouvrir au réseau, placez le
    /// serveur derrière un proxy inverse HTTPS ou un VPN (voir docs/17).
    #[arg(long, env = "ETABLI_ECOUTE", default_value = "127.0.0.1:4300")]
    ecoute: SocketAddr,

    /// Clé publique (base64, format Tauri) qui signe les plugins acceptés. Par défaut : celle d'Établi.
    #[arg(long, env = "ETABLI_CLE_PUBLIQUE")]
    cle_publique: Option<String>,

    /// Dossier de la version web d'Établi (apps/desktop/dist-web), servie à la racine.
    #[arg(long, env = "ETABLI_APPLICATION")]
    application: Option<PathBuf>,

    /// Origine autorisée à appeler l'API depuis un autre site (répétable). Inutile si l'application
    /// est servie par ce serveur.
    #[arg(long = "origine")]
    origines: Vec<String>,

    /// Place maximale des calculs d'un utilisateur, en Mo.
    #[arg(long, env = "ETABLI_QUOTA_MO", default_value_t = 500)]
    quota_mo: u64,

    /// Lire l'adresse du client dans X-Forwarded-For (seulement derrière un proxy inverse de confiance).
    #[arg(long, env = "ETABLI_PROXY_DE_CONFIANCE")]
    proxy_de_confiance: bool,
}

#[tokio::main]
async fn main() {
    if let Err(message) = lancer(Arguments::parse()).await {
        eprintln!("Erreur : {message}");
        std::process::exit(1);
    }
}

async fn lancer(args: Arguments) -> Result<(), String> {
    std::fs::create_dir_all(args.donnees.join("plugins"))
        .map_err(|e| format!("dossier des données : {e}"))?;
    let base = Base::ouvrir(&args.donnees.join("etabli.sqlite"))
        .map_err(|e| format!("base de données : {e:?}"))?;
    let config = Config {
        dossier: args.donnees,
        cle_publique: args.cle_publique.unwrap_or_else(cle_publique_officielle),
        application: args.application,
        origines: args.origines,
        proxy_de_confiance: args.proxy_de_confiance,
        quota_utilisateur: args.quota_mo.saturating_mul(1024 * 1024),
    };
    let etat = Interne::nouveau(config, base);

    if let Some(code) = preparer_installation(&etat)
        .await
        .map_err(|e| format!("{e:?}"))?
    {
        eprintln!("\nPremier lancement : aucun compte n'existe encore.");
        eprintln!(
            "Code d'installation (à saisir une seule fois pour créer l'administrateur) : {code}\n"
        );
    }

    let ecouteur = tokio::net::TcpListener::bind(args.ecoute)
        .await
        .map_err(|e| format!("impossible d'écouter sur {} : {e}", args.ecoute))?;
    eprintln!(
        "Établi serveur {} sur http://{}",
        env!("CARGO_PKG_VERSION"),
        args.ecoute
    );
    axum::serve(
        ecouteur,
        application(etat).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await
    .map_err(|e| e.to_string())
}
