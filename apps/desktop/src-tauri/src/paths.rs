use crate::plugins::Source;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

/// Emplacements utilisés par l'application (cahier des charges, section 7.3).
pub struct AppPaths {
    /// Dossier de travail : un sous-dossier de documents `.etabli` par plugin.
    pub documents: PathBuf,
    /// Réglages de l'application et plugins installés par l'utilisateur.
    pub config: PathBuf,
    /// Plugins installés depuis le catalogue ou un fichier `.etabli-plugin` (un dossier par plugin).
    pub catalogue: PathBuf,
    /// Dossiers où chercher des plugins, dans l'ordre : le premier trouvé pour un identifiant gagne.
    pub plugin_roots: Vec<(PathBuf, Source)>,
}

impl AppPaths {
    pub fn resolve<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Self> {
        // En développement, `ETABLI_DATA_DIR` (défini par env-dev.ps1) garde les données
        // de test hors de Documents et d'AppData.
        let override_dir = std::env::var_os("ETABLI_DATA_DIR").map(PathBuf::from);

        let documents = match &override_dir {
            Some(dir) => dir.join("documents"),
            None => app.path().document_dir()?.join("Etabli"),
        };
        let config = match &override_dir {
            Some(dir) => dir.join("config"),
            None => app.path().config_dir()?.join("Etabli"),
        };

        // Plugins intégrés : ceux du dépôt en développement ; une fois installée, l'application
        // n'en contient plus (ils viennent du catalogue), le dossier des ressources reste lu.
        let integres = if cfg!(debug_assertions) {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../plugins")
        } else {
            app.path().resource_dir()?.join("plugins")
        };
        let catalogue = config.join("catalogue");

        Ok(Self {
            plugin_roots: vec![
                (integres, Source::Integre),
                (catalogue.clone(), Source::Catalogue),
                (config.join("plugins"), Source::Utilisateur),
            ],
            catalogue,
            documents,
            config,
        })
    }
}
