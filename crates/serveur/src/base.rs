//! Base SQLite du serveur : seul endroit d'Établi où une base de données apparaît (docs/16).
//! Toutes les requêtes sont paramétrées ; chaque donnée d'utilisateur est lue et écrite avec
//! l'identifiant de l'utilisateur de la session, jamais avec une valeur envoyée par le client.

use crate::erreur::{Erreur, Resultat};
use rusqlite::Connection;
use std::{
    path::Path,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

/// Version du schéma, dans `PRAGMA user_version`. Une migration = une entrée de `MIGRATIONS`.
const MIGRATIONS: &[&str] = &[include_str!("schema_1.sql")];

#[derive(Clone)]
pub struct Base {
    connexion: Arc<Mutex<Connection>>,
}

pub fn maintenant_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

impl Base {
    pub fn ouvrir(fichier: &Path) -> Resultat<Self> {
        let mut connexion = Connection::open(fichier)?;
        Self::preparer(&mut connexion)?;
        Ok(Self {
            connexion: Arc::new(Mutex::new(connexion)),
        })
    }

    /// Base en mémoire, pour les tests.
    pub fn en_memoire() -> Resultat<Self> {
        let mut connexion = Connection::open_in_memory()?;
        Self::preparer(&mut connexion)?;
        Ok(Self {
            connexion: Arc::new(Mutex::new(connexion)),
        })
    }

    fn preparer(connexion: &mut Connection) -> Resultat<()> {
        connexion.pragma_update(None, "foreign_keys", "ON")?;
        connexion.pragma_update(None, "journal_mode", "WAL")?;
        connexion.pragma_update(None, "busy_timeout", 5000)?;
        // rusqlite 0.40 n'accepte plus `usize` (taille variable) : la version de schéma se lit et s'écrit en `i64`.
        let actuelle = usize::try_from(
            connexion.query_row("PRAGMA user_version", [], |l| l.get::<_, i64>(0))?,
        )
        .map_err(|_| Erreur::Interne("version de schéma négative".into()))?;
        if actuelle > MIGRATIONS.len() {
            return Err(Erreur::Interne(format!(
                "la base est plus récente que ce serveur (version {actuelle})"
            )));
        }
        for (indice, sql) in MIGRATIONS.iter().enumerate().skip(actuelle) {
            let tx = connexion.transaction()?;
            tx.execute_batch(sql)?;
            tx.pragma_update(None, "user_version", (indice + 1) as i64)?;
            tx.commit()?;
        }
        Ok(())
    }

    /// Exécute `travail` sur la connexion, hors du fil asynchrone.
    pub async fn executer<T, F>(&self, travail: F) -> Resultat<T>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> Resultat<T> + Send + 'static,
    {
        let connexion = Arc::clone(&self.connexion);
        tokio::task::spawn_blocking(move || {
            let mut garde = connexion
                .lock()
                .map_err(|_| Erreur::Interne("verrou de la base empoisonné".into()))?;
            travail(&mut garde)
        })
        .await
        .map_err(|e| Erreur::Interne(format!("tâche interrompue : {e}")))?
    }
}

/// Écrit une ligne dans le journal d'audit (actions d'administration et de sécurité).
pub fn journaliser(
    connexion: &Connection,
    acteur: Option<&str>,
    action: &str,
    cible: Option<&str>,
    detail: Option<&str>,
) -> Resultat<()> {
    connexion.execute(
        "INSERT INTO journal(horodatage, acteur, action, cible, detail) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![maintenant_ms() as i64, acteur, action, cible, detail],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_cree_et_version_notee() {
        let base = Base::en_memoire().unwrap();
        let connexion = base.connexion.lock().unwrap();
        let version: i64 = connexion
            .query_row("PRAGMA user_version", [], |l| l.get(0))
            .unwrap();
        assert_eq!(version, MIGRATIONS.len() as i64);
        for table in [
            "utilisateurs",
            "sessions",
            "documents",
            "donnees",
            "reglages",
            "plugins",
            "plugin_acces",
            "journal",
        ] {
            let n: i64 = connexion
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |l| l.get(0),
                )
                .unwrap();
            assert_eq!(n, 1, "{table}");
        }
    }

    #[test]
    fn un_seul_administrateur_garanti_par_la_base() {
        let base = Base::en_memoire().unwrap();
        let connexion = base.connexion.lock().unwrap();
        let ajout = |id: &str, nom: &str, role: &str| {
            connexion.execute(
                "INSERT INTO utilisateurs(id, nom, mot_de_passe, role, cree) VALUES (?1, ?2, 'x', ?3, 0)",
                rusqlite::params![id, nom, role],
            )
        };
        assert!(ajout("1", "chef", "admin").is_ok());
        assert!(ajout("2", "autre", "admin").is_err());
        assert!(
            ajout("3", "CHEF", "utilisateur").is_err(),
            "noms uniques sans tenir compte de la casse"
        );
        assert!(ajout("4", "eleve", "utilisateur").is_ok());
    }

    #[test]
    fn les_documents_sont_propres_a_chaque_utilisateur() {
        let base = Base::en_memoire().unwrap();
        let c = base.connexion.lock().unwrap();
        for (id, nom) in [("u1", "alice"), ("u2", "bob")] {
            c.execute("INSERT INTO utilisateurs(id, nom, mot_de_passe, role, cree) VALUES (?1, ?2, 'x', 'utilisateur', 0)", [id, nom]).unwrap();
            // Le même identifiant de document peut exister chez deux utilisateurs.
            c.execute(
                "INSERT INTO documents(utilisateur_id, id, plugin_id, app_id, data_version, titre, resume, cree, modifie, version, app_version, data) \
                 VALUES (?1, 'abcdef01', 'p', 'a', 1, 't', '', 0, 0, 1, 'v', '{}')",
                [id],
            )
            .unwrap();
        }
        let n: i64 = c
            .query_row("SELECT count(*) FROM documents", [], |l| l.get(0))
            .unwrap();
        assert_eq!(n, 2);
    }
}
