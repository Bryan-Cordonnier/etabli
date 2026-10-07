use crate::plugins::Source;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

/// Emplacements utilisés par l'application (cahier des charges, section 7.3).
pub struct AppPaths {
    /// Dossier de travail : un sous-dossier de documents `.etabli` par plugin.
    pub documents: PathBuf,
    /// Réglages de l'application et plugins installés par l'utilisateur.
    pub config: PathBuf,
    /// Plugins livrés avec la distribution, écrits ici au démarrage (voir `integres.rs`).
    pub integres: PathBuf,
    /// Plugins installés depuis un fichier `.etabli-plugin` (un dossier par plugin).
    pub installes: PathBuf,
    /// Dossiers où chercher des plugins, dans l'ordre : le premier trouvé pour un identifiant gagne.
    pub plugin_roots: Vec<(PathBuf, Source)>,
}

impl AppPaths {
    pub fn resolve<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Self> {
        // En développement, `ETABLI_DATA_DIR` (défini par env-dev.ps1) garde les données
        // de test hors de Documents et d'AppData.
        let override_dir = std::env::var_os("ETABLI_DATA_DIR").map(PathBuf::from);

        let (documents, config) = match &override_dir {
            Some(dir) => (dir.join("documents"), dir.join("config")),
            None => Self::par_defaut(app)?,
        };

        let integres = config.join("integres");
        let installes = config.join("installes");
        let mut plugin_roots: Vec<(PathBuf, Source)> = Vec::new();
        // Développement : le dossier de plugins donné au lancement, puis ceux du dépôt, passent avant les plugins livrés.
        if cfg!(debug_assertions) {
            if let Some(dossier) = std::env::var_os("ETABLE_PLUGINS_DIR").map(PathBuf::from) {
                plugin_roots.push((dossier, Source::Integre));
            }
            #[cfg(desktop)]
            plugin_roots.push((
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../plugins"),
                Source::Integre,
            ));
        }
        plugin_roots.push((integres.clone(), Source::Integre));
        plugin_roots.push((installes.clone(), Source::Installe));
        plugin_roots.push((config.join("plugins"), Source::Utilisateur));

        Ok(Self {
            plugin_roots,
            integres,
            installes,
            documents,
            config,
        })
    }

    /// Windows : Documents et AppData. Android : le stockage privé de l'application (pas d'accès aux Documents partagés).
    #[cfg(desktop)]
    fn par_defaut<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<(PathBuf, PathBuf)> {
        Ok((
            app.path().document_dir()?.join("Etabli"),
            app.path().config_dir()?.join("Etabli"),
        ))
    }

    #[cfg(mobile)]
    fn par_defaut<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<(PathBuf, PathBuf)> {
        Ok((
            app.path().app_data_dir()?.join("documents"),
            app.path().app_config_dir()?,
        ))
    }
}
