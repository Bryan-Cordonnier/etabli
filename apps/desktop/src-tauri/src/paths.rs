use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

/// Emplacements utilisés par l'application (cahier des charges, section 7.3).
pub struct AppPaths {
    /// Dossier de travail : un sous-dossier de documents `.etabli` par plugin.
    pub documents: PathBuf,
    /// Réglages de l'application et plugins installés par l'utilisateur.
    pub config: PathBuf,
    /// Dossiers où chercher des plugins, avec `true` pour les plugins officiels.
    pub plugin_roots: Vec<(PathBuf, bool)>,
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

        // Plugins officiels : directement dans le dépôt en développement,
        // dans les ressources de l'application une fois installée.
        let official = if cfg!(debug_assertions) {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../plugins")
        } else {
            app.path().resource_dir()?.join("plugins")
        };

        Ok(Self {
            plugin_roots: vec![(official, true), (config.join("plugins"), false)],
            documents,
            config,
        })
    }
}
