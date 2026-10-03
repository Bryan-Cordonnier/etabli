//! État partagé par toutes les requêtes et configuration du serveur.

use crate::{base::Base, securite::Limiteur};
use std::{path::PathBuf, sync::Arc, time::Duration};

/// Durée maximale d'une session, et durée sans activité au bout de laquelle elle s'éteint.
pub const SESSION_MAX: Duration = Duration::from_secs(30 * 24 * 3600);
pub const SESSION_INACTIVITE: Duration = Duration::from_secs(14 * 24 * 3600);

#[derive(Clone, Debug)]
pub struct Config {
    /// Dossier des données : `etabli.sqlite` et `plugins/`.
    pub dossier: PathBuf,
    /// Clé publique minisign (base64, format Tauri) qui signe les paquets de plugins acceptés.
    pub cle_publique: String,
    /// Dossier de la version web d'Établi à servir à la racine (facultatif).
    pub application: Option<PathBuf>,
    /// Origines autorisées à appeler l'API depuis un autre site (vide : aucune, même origine seulement).
    pub origines: Vec<String>,
    /// Lire l'adresse du client dans `X-Forwarded-For` (seulement derrière un proxy inverse de confiance).
    pub proxy_de_confiance: bool,
    /// Place maximale occupée par les calculs d'un utilisateur, en octets.
    pub quota_utilisateur: u64,
    /// Adresse publique de l'origine dédiée aux plugins (second port ou second nom d'hôte). Elle permet aux
    /// mini-apps de fonctionner hors ligne tout en restant séparées de l'application. Doit différer de
    /// l'origine de l'application.
    pub url_plugins: Option<String>,
}

pub struct Interne {
    pub config: Config,
    pub base: Base,
    /// Essais de connexion par identifiant.
    pub limite_nom: Limiteur,
    /// Essais de connexion par adresse.
    pub limite_ip: Limiteur,
    /// Tentatives sur l'installation initiale.
    pub limite_installation: Limiteur,
}

pub type Etat = Arc<Interne>;

impl Interne {
    pub fn nouveau(config: Config, base: Base) -> Etat {
        Arc::new(Self {
            config,
            base,
            limite_nom: Limiteur::new(5, Duration::from_secs(600), Duration::from_secs(600)),
            limite_ip: Limiteur::new(30, Duration::from_secs(600), Duration::from_secs(600)),
            limite_installation: Limiteur::new(
                5,
                Duration::from_secs(600),
                Duration::from_secs(900),
            ),
        })
    }

    pub fn dossier_plugins(&self) -> PathBuf {
        self.config.dossier.join("plugins")
    }
}
