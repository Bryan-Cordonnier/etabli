//! Sources de catalogue configurables (docs/20, section 3.2) : un atelier peut pointer vers son propre registre.
//!
//! Une source est une adresse `https` de `catalogue.json` et la clé publique qui signe ce catalogue et ses paquets. Elle obéit
//! aux mêmes contrôles que la source officielle (signature obligatoire, séquence, expiration, révocations), avec **sa propre
//! mémoire de séquence** : on ne mélange pas les séquences de deux registres. Les paquets doivent être dans le même dossier que
//! le catalogue (même règle que « seulement les Releases du dépôt » pour la source officielle).
//!
//! Fonctions pures : validation et dérivation d'adresses, aucune entrée-sortie.

use crate::paquet::cle_publique_valide;

/// Canaux connus (docs/20, section 3.3). Un seul catalogue officiel existe : `stable`. `beta` est réservé.
pub const CANAL_STABLE: &str = "stable";
pub const CANAL_BETA: &str = "beta";

const URL_MAX: usize = 2048;

/// Une source validée : tout ce que le moteur en déduit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceValidee {
    pub url: String,
    /// Les paquets doivent venir d'une adresse qui commence par ce dossier.
    pub prefixe: String,
    /// Adresse de la signature du catalogue.
    pub url_signature: String,
    /// Nom du fichier (dans la configuration) où retenir la séquence vue de cette source.
    pub fichier_etat: String,
}

/// FNV-1a 64 bits : un nom de fichier stable par adresse (pas de la sécurité, juste de la séparation).
fn empreinte(texte: &str) -> u64 {
    texte.bytes().fold(0xcbf2_9ce4_8422_2325, |h, o| {
        (h ^ u64::from(o)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

/// Contrôle l'adresse et la clé d'une source personnalisée.
pub fn valider_source(url: &str, cle_publique: &str) -> Result<SourceValidee, String> {
    let url = url.trim();
    if url.len() > URL_MAX
        || !url.starts_with("https://")
        || url.chars().any(|c| c.is_whitespace() || c.is_control())
        || url.contains('#')
        || url.contains('?')
    {
        return Err(
            "Adresse de source refusée : il faut une adresse https:// sans espace, ni ? ni #."
                .into(),
        );
    }
    let reste = &url["https://".len()..];
    let (hote, chemin) = reste
        .split_once('/')
        .ok_or_else(|| "Adresse de source refusée : le chemin du catalogue manque.".to_string())?;
    // Pas d'identifiants dans l'adresse (https://utilisateur@hote/…) : ils prêteraient à confusion.
    if hote.is_empty() || hote.contains('@') {
        return Err("Adresse de source refusée : nom d'hôte invalide.".into());
    }
    if !chemin.ends_with(".json") || chemin.split('/').any(|m| m == "..") {
        return Err("Adresse de source refusée : elle doit désigner un fichier .json.".into());
    }
    if !cle_publique_valide(cle_publique) {
        return Err(
            "Clé publique de la source illisible : collez le contenu du fichier .pub.".into(),
        );
    }
    let dossier_fin = url.rfind('/').unwrap_or(url.len() - 1) + 1;
    Ok(SourceValidee {
        url: url.to_string(),
        prefixe: url[..dossier_fin].to_string(),
        url_signature: format!("{url}.minisig"),
        fichier_etat: format!("catalogue-etat-{:016x}.json", empreinte(url)),
    })
}

/// Le canal demandé est-il disponible ? Seul `stable` l'est pour l'instant : le catalogue `beta` n'est pas publié.
pub fn verifier_canal(canal: &str) -> Result<(), String> {
    match canal {
        CANAL_STABLE => Ok(()),
        CANAL_BETA => {
            Err("Le canal bêta n'est pas encore publié : revenez au canal stable.".into())
        }
        _ => Err(format!("Canal inconnu : « {canal} ».")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLE: &str = include_str!("../fixtures/cle-publication-1-essai.pub");

    #[test]
    fn source_valide_et_adresses_derivees() {
        let s = valider_source("https://registre.exemple.fr/etabli/catalogue.json", CLE).unwrap();
        assert_eq!(s.prefixe, "https://registre.exemple.fr/etabli/");
        assert_eq!(
            s.url_signature,
            "https://registre.exemple.fr/etabli/catalogue.json.minisig"
        );
        assert!(s.fichier_etat.starts_with("catalogue-etat-") && s.fichier_etat.ends_with(".json"));
        // Deux adresses : deux mémoires de séquence ; la même adresse : la même.
        let autre =
            valider_source("https://registre.exemple.fr/autre/catalogue.json", CLE).unwrap();
        assert_ne!(s.fichier_etat, autre.fichier_etat);
        assert_eq!(
            s,
            valider_source("  https://registre.exemple.fr/etabli/catalogue.json ", CLE).unwrap()
        );
    }

    #[test]
    fn adresses_refusees() {
        for mauvaise in [
            "",
            "http://registre.exemple.fr/catalogue.json",
            "ftp://registre.exemple.fr/catalogue.json",
            "https://registre.exemple.fr",
            "https://registre.exemple.fr/catalogue.txt",
            "https://registre.exemple.fr/a b/catalogue.json",
            "https://registre.exemple.fr/catalogue.json?x=1",
            "https://registre.exemple.fr/catalogue.json#x",
            "https://moi@registre.exemple.fr/catalogue.json",
            "https:///catalogue.json",
            "https://registre.exemple.fr/../catalogue.json",
        ] {
            assert!(valider_source(mauvaise, CLE).is_err(), "{mauvaise}");
        }
        let longue = format!("https://h.fr/{}.json", "a".repeat(URL_MAX));
        assert!(valider_source(&longue, CLE).is_err());
    }

    #[test]
    fn cle_illisible_refusee() {
        for mauvaise in ["", "pas une clé", "bm9uIG1pbmlzaWdu"] {
            assert!(
                valider_source("https://h.fr/c.json", mauvaise).is_err(),
                "{mauvaise}"
            );
        }
    }

    #[test]
    fn canaux() {
        assert!(verifier_canal("stable").is_ok());
        assert!(verifier_canal("beta")
            .unwrap_err()
            .contains("pas encore publié"));
        assert!(verifier_canal("nightly").is_err());
    }
}
