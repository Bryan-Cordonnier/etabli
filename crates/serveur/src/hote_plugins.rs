//! Origine propre à chaque plugin (docs/19). Les fichiers d'un plugin sont servis sur `http(s)://<id>.<domaine>[:port]` :
//! le navigateur isole alors les plugins les uns des autres (stockage, service worker, cache) et de l'application.

use etabli_noyau::identifiants::plugin_valide;

/// Un identifiant de plugin peut servir de nom d'hôte : 63 caractères au plus, sans tiret au début ni à la fin.
pub fn etiquette_dns_valide(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 63
        && !id.starts_with('-')
        && !id.ends_with('-')
        && !id.contains('.')
}

/// Modèle d'adresse publique des plugins, par exemple `https://{id}.plugins.exemple.fr` ou `http://{id}.localhost:4301`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelePlugins {
    /// Texte d'origine, `{id}` compris.
    pub modele: String,
    /// Suffixe de l'hôte après l'identifiant, sans port : `.plugins.exemple.fr`.
    suffixe: String,
}

impl ModelePlugins {
    /// Analyse un modèle. Refuse tout ce qui n'est pas `http(s)://{id}.<domaine>[:port]` : pas de chemin, pas d'espace.
    pub fn analyser(texte: &str) -> Result<Self, String> {
        let erreur = || {
            "--url-plugins doit avoir la forme http(s)://{id}.domaine[:port] (par exemple https://{id}.plugins.exemple.fr)."
                .to_string()
        };
        let texte = texte.trim();
        let reste = texte
            .strip_prefix("https://")
            .or_else(|| texte.strip_prefix("http://"))
            .ok_or_else(erreur)?;
        let apres_id = reste.strip_prefix("{id}.").ok_or_else(erreur)?;
        let (hote, port) = match apres_id.rsplit_once(':') {
            Some((h, p)) => (h, Some(p)),
            None => (apres_id, None),
        };
        if let Some(p) = port {
            if p.is_empty() || p.len() > 5 || !p.bytes().all(|b| b.is_ascii_digit()) {
                return Err(erreur());
            }
        }
        let valide = !hote.is_empty()
            && hote.split('.').all(|etiquette| {
                !etiquette.is_empty()
                    && etiquette.len() <= 63
                    && !etiquette.starts_with('-')
                    && !etiquette.ends_with('-')
                    && etiquette
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            });
        if !valide {
            return Err(erreur());
        }
        Ok(Self {
            modele: texte.to_string(),
            suffixe: format!(".{hote}"),
        })
    }

    /// Identifiant du plugin désigné par l'en-tête `Host` d'une requête, ou `None` si l'hôte n'est pas de ce modèle.
    /// Le port est ignoré (un proxy peut le retirer) ; seul compte le nom d'hôte.
    pub fn id_depuis_hote(&self, hote: &str) -> Option<String> {
        let hote = hote.trim().to_ascii_lowercase();
        let sans_port = match hote.rsplit_once(':') {
            Some((h, p)) if !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()) => h,
            Some(_) => return None,
            None => hote.as_str(),
        };
        let id = sans_port.strip_suffix(&self.suffixe)?;
        (plugin_valide(id) && etiquette_dns_valide(id)).then(|| id.to_string())
    }

    /// Source CSP qui autorise les cadres de tous les plugins : `http://*.localhost:4301`.
    pub fn source_csp(&self) -> String {
        self.modele.replacen("{id}", "*", 1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analyse_les_modeles_valides() {
        for m in [
            "https://{id}.plugins.exemple.fr",
            "http://{id}.localhost:4301",
            "http://{id}.plugins.home.lan:8080",
        ] {
            assert!(ModelePlugins::analyser(m).is_ok(), "{m}");
        }
    }

    #[test]
    fn refuse_les_modeles_douteux() {
        for m in [
            "",
            "ftp://{id}.exemple.fr",
            "http://exemple.fr",
            "http://{id}exemple.fr",
            "http://{id}.exemple.fr/plugins",
            "http://{id}.exemple.fr:abc",
            "http://{id}.exemple.fr:",
            "http://{id}.exemple.fr;frame-src *",
            "http://{id}.exemple.fr *",
            "http://{id}..exemple.fr",
            "http://{id}.-exemple.fr",
            "http://{id}.EXEMPLE.fr",
            "http://{id}.",
            "http://a.{id}.exemple.fr",
        ] {
            assert!(ModelePlugins::analyser(m).is_err(), "{m}");
        }
    }

    #[test]
    fn retrouve_l_identifiant_depuis_l_hote() {
        let m = ModelePlugins::analyser("http://{id}.plugins.test:4301").unwrap();
        assert_eq!(
            m.id_depuis_hote("maths.plugins.test:4301").as_deref(),
            Some("maths")
        );
        assert_eq!(
            m.id_depuis_hote("MATHS.plugins.test").as_deref(),
            Some("maths")
        );
        assert_eq!(
            m.id_depuis_hote("economie-3d.plugins.test:9").as_deref(),
            Some("economie-3d")
        );
    }

    #[test]
    fn refuse_les_hotes_etrangers() {
        let m = ModelePlugins::analyser("http://{id}.plugins.test:4301").unwrap();
        for h in [
            "",
            "plugins.test",
            ".plugins.test",
            "maths.autre.test",
            "maths.plugins.test.evil.com",
            "evil.com",
            "a.b.plugins.test",
            "ma_ths.plugins.test",
            "maths.plugins.test:",
            "maths.plugins.test:abc",
            "../x.plugins.test",
            "127.0.0.1:4301",
            "-maths.plugins.test",
            "maths-.plugins.test",
        ] {
            assert_eq!(m.id_depuis_hote(h), None, "{h}");
        }
    }

    #[test]
    fn source_csp_remplace_l_identifiant() {
        let m = ModelePlugins::analyser("http://{id}.localhost:4301").unwrap();
        assert_eq!(m.source_csp(), "http://*.localhost:4301");
    }
}
