//! Catalogue signé des plugins (docs/20) : la liste des versions disponibles, signée comme un paquet, avec un numéro de
//! séquence qui ne fait qu'augmenter, une date d'expiration et la liste des versions révoquées.
//!
//! Pourquoi signer le catalogue lui-même : chaque paquet est déjà signé, mais sans cela celui qui contrôle l'hébergement
//! pourrait servir un vieux catalogue qui renvoie vers une ancienne version (signée, mais vulnérable) ou cacher une
//! révocation. La séquence interdit le retour en arrière, l'expiration interdit de figer un catalogue périmé.
//!
//! Fonctions pures : l'heure et la dernière séquence vue sont passées en paramètres.

use crate::paquet::verifier_signature_parmi;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;

/// Taille maximale d'un catalogue lu sur le réseau.
pub const TAILLE_MAX_CATALOGUE: usize = 4 * 1024 * 1024;

/// Version du format du catalogue signé (le format 1, non signé, n'est plus accepté une fois la migration faite).
pub const FORMAT: u32 = 2;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Revocation {
    pub id: String,
    /// Toutes les versions strictement inférieures à celle-ci sont révoquées.
    #[serde(default)]
    pub avant: Option<String>,
    /// Versions précises révoquées.
    #[serde(default)]
    pub versions: Vec<String>,
    #[serde(default)]
    pub raison: String,
}

/// Arrêt programmé d'un contrat d'API de plugin (docs/19, section 4 ; docs/20). La date vient du catalogue **signé** : la
/// repousser ou l'avancer ne demande pas de nouvelle version d'Établi. Sans entrée pour une majeure, rien n'est jamais refusé.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArretContrat {
    /// Version majeure du contrat concernée (1 pour `apiVersion` « ^1 »).
    pub majeure: u32,
    /// À partir de cette date (secondes depuis 1970), l'installation affiche un avertissement.
    #[serde(default)]
    pub avertir_des: Option<u64>,
    /// À partir de cette date, le catalogue refuse d'installer ou de mettre à jour un plugin de ce contrat.
    #[serde(default)]
    pub refuser_des: Option<u64>,
    /// Phrase pour l'utilisateur (« Les plugins ^1 ne seront plus acceptés après… ») ; texte par défaut si vide.
    #[serde(default)]
    pub message: String,
}

/// Ce que le moteur fait d'un plugin selon son contrat et la date.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StatutContrat {
    Accepte,
    /// Accepté, mais l'utilisateur est prévenu (phrase prête à afficher).
    Avertir(String),
    /// Refusé (phrase prête à afficher).
    Refuse(String),
}

/// Version majeure d'un contrat d'après `apiVersion` (`^2`, `>=2.1`, `2`) ; 1 si le texte est illisible ou absent
/// (même règle que `majeure` côté interface, `plugins/permissions.ts`).
pub fn majeure_contrat(api_version: &str) -> u32 {
    let chiffres: String = api_version
        .chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take_while(char::is_ascii_digit)
        .collect();
    chiffres
        .parse::<u32>()
        .ok()
        .filter(|&n| n >= 1)
        .unwrap_or(1)
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Catalogue {
    pub format: u32,
    /// Numéro qui augmente à chaque publication : un client refuse un catalogue de séquence inférieure à la dernière vue.
    pub sequence: u64,
    /// Fin de validité (secondes depuis 1970).
    pub expire: u64,
    #[serde(default)]
    pub plugins: Vec<Value>,
    #[serde(default)]
    pub revocations: Vec<Revocation>,
    /// Arrêts programmés de contrats d'API (absent : aucun arrêt prévu).
    #[serde(default)]
    pub contrats: Vec<ArretContrat>,
}

/// Vérifie la signature d'un catalogue puis son contenu : format, expiration, séquence.
///
/// - `derniere_sequence` : la plus grande séquence déjà acceptée par ce client (0 s'il n'en a jamais vu) ;
/// - `maintenant` : l'heure courante en secondes depuis 1970, fournie par l'appelant (jamais lue ici).
pub fn verifier_catalogue(
    octets: &[u8],
    signature: &str,
    cle_publique: &str,
    maintenant: u64,
    derniere_sequence: u64,
) -> Result<Catalogue, String> {
    verifier_catalogue_parmi(
        octets,
        signature,
        &[cle_publique],
        maintenant,
        derniere_sequence,
    )
}

/// Comme [`verifier_catalogue`], avec plusieurs clés de confiance (rotation, `crate::cles`) : une seule doit avoir signé.
pub fn verifier_catalogue_parmi<S: AsRef<str>>(
    octets: &[u8],
    signature: &str,
    cles_publiques: &[S],
    maintenant: u64,
    derniere_sequence: u64,
) -> Result<Catalogue, String> {
    if octets.len() > TAILLE_MAX_CATALOGUE {
        return Err("Catalogue trop volumineux.".into());
    }
    // La signature d'abord : on n'analyse rien de ce qui n'est pas authentique.
    verifier_signature_parmi(octets, signature, cles_publiques)
        .map_err(|_| "Catalogue refusé : signature invalide.".to_string())?;
    let catalogue: Catalogue = serde_json::from_slice(octets)
        .map_err(|_| "Catalogue illisible (format inattendu).".to_string())?;
    if catalogue.format != FORMAT {
        return Err(format!(
            "Catalogue de format {} : cette version d'Établi attend le format {FORMAT}.",
            catalogue.format
        ));
    }
    if catalogue.expire <= maintenant {
        return Err("Catalogue expiré : il faut un catalogue plus récent.".into());
    }
    if catalogue.sequence < derniere_sequence {
        return Err(format!(
            "Catalogue refusé : séquence {} inférieure à la dernière vue ({derniere_sequence}), retour en arrière suspect.",
            catalogue.sequence
        ));
    }
    Ok(catalogue)
}

/// Découpe `1.2.3` ou `1.2.3-beta.1` en (majeur, mineur, correctif, pré-version).
fn analyser(version: &str) -> Option<([u64; 3], Option<String>)> {
    let (noyau, pre) = match version.trim().split_once('-') {
        Some((n, p)) => (n, Some(p.to_string())),
        None => (version.trim(), None),
    };
    let mut parties = noyau.split('.');
    let mut nombres = [0u64; 3];
    for nombre in &mut nombres {
        *nombre = parties.next()?.parse().ok()?;
    }
    if parties.next().is_some() {
        return None;
    }
    if pre.as_deref() == Some("") {
        return None;
    }
    Some((nombres, pre))
}

/// Compare deux versions « majeur.mineur.correctif[-préversion] ». Une pré-version précède sa version finale.
/// `None` si l'une des deux est illisible.
pub fn comparer_versions(a: &str, b: &str) -> Option<Ordering> {
    let (na, pa) = analyser(a)?;
    let (nb, pb) = analyser(b)?;
    Some(na.cmp(&nb).then_with(|| match (pa, pb) {
        (None, None) => Ordering::Equal,
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (Some(x), Some(y)) => x.cmp(&y),
    }))
}

/// Statut d'un contrat à une date, d'après les arrêts programmés.
pub fn statut_contrat(
    arrets: &[ArretContrat],
    api_version: &str,
    maintenant: u64,
) -> StatutContrat {
    let majeure = majeure_contrat(api_version);
    let Some(arret) = arrets.iter().find(|a| a.majeure == majeure) else {
        return StatutContrat::Accepte;
    };
    let phrase = |defaut: &str| {
        if arret.message.trim().is_empty() {
            defaut.to_string()
        } else {
            arret.message.trim().to_string()
        }
    };
    if arret.refuser_des.is_some_and(|d| maintenant >= d) {
        return StatutContrat::Refuse(phrase(&format!(
            "Les plugins du contrat ^{majeure} ne sont plus acceptés : une version plus récente du plugin est nécessaire."
        )));
    }
    if arret.avertir_des.is_some_and(|d| maintenant >= d) {
        return StatutContrat::Avertir(phrase(&format!(
            "Les plugins du contrat ^{majeure} cesseront d'être acceptés."
        )));
    }
    StatutContrat::Accepte
}

impl Catalogue {
    /// Statut du contrat d'un plugin (voir [`statut_contrat`]).
    pub fn statut_contrat(&self, api_version: &str, maintenant: u64) -> StatutContrat {
        statut_contrat(&self.contrats, api_version, maintenant)
    }

    /// Raison pour laquelle cette version d'un plugin est révoquée, ou `None` si elle peut être utilisée.
    /// Une version illisible est considérée comme révoquée par une règle « avant » (par prudence).
    pub fn revocation(&self, id: &str, version: &str) -> Option<&str> {
        self.revocations
            .iter()
            .filter(|r| r.id == id)
            .find(|r| {
                r.versions.iter().any(|v| v == version)
                    || r.avant.as_deref().is_some_and(|avant| {
                        comparer_versions(version, avant).is_none_or(|o| o == Ordering::Less)
                    })
            })
            .map(|r| r.raison.as_str())
    }
}

/// Décide si une version peut être installée à la place de celle qui l'est déjà.
/// - une version identique ou plus ancienne est refusée, sauf retour en arrière demandé par l'utilisateur ;
/// - une version révoquée n'est jamais installée.
pub fn peut_installer(
    catalogue: &Catalogue,
    id: &str,
    installee: Option<&str>,
    candidate: &str,
    retour_arriere: bool,
) -> Result<(), String> {
    if analyser(candidate).is_none() {
        return Err(format!("Version illisible : {candidate}"));
    }
    if let Some(raison) = catalogue.revocation(id, candidate) {
        return Err(format!(
            "La version {candidate} de « {id} » est révoquée : {raison}."
        ));
    }
    if let Some(installee) = installee {
        match comparer_versions(candidate, installee) {
            Some(Ordering::Greater) => {}
            Some(_) if retour_arriere => {}
            Some(_) => {
                return Err(format!(
                    "La version {candidate} n'est pas plus récente que la {installee} installée : installation refusée."
                ))
            }
            None => return Err("Version illisible.".into()),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const CATALOGUE: &[u8] = include_bytes!("../fixtures/catalogue-essai.json");
    const SIGNATURE: &str = include_str!("../fixtures/catalogue-essai.json.sig");
    const CLE: &str = include_str!("../fixtures/cle-catalogue-essai.pub");
    const CLE_OFFICIELLE: &str =
        include_str!("../../../apps/desktop/src-tauri/fixtures/cle-essai.pub");
    const MAINTENANT: u64 = 1_790_000_000;

    fn catalogue() -> Catalogue {
        verifier_catalogue(CATALOGUE, SIGNATURE, CLE, MAINTENANT, 0)
            .expect("catalogue d'essai valide")
    }

    #[test]
    fn catalogue_signe_accepte() {
        let c = catalogue();
        assert_eq!(c.sequence, 7);
        assert_eq!(c.plugins.len(), 2);
        assert_eq!(c.revocations.len(), 2);
    }

    #[test]
    fn signature_etrangere_ou_contenu_modifie_refuse() {
        assert!(verifier_catalogue(CATALOGUE, SIGNATURE, CLE_OFFICIELLE, MAINTENANT, 0).is_err());
        let mut modifie = CATALOGUE.to_vec();
        modifie.extend_from_slice(b" ");
        let e = verifier_catalogue(&modifie, SIGNATURE, CLE, MAINTENANT, 0).unwrap_err();
        assert!(e.contains("signature"), "{e}");
        assert!(verifier_catalogue(CATALOGUE, "pas une signature", CLE, MAINTENANT, 0).is_err());
        assert!(verifier_catalogue(CATALOGUE, SIGNATURE, "pas une clé", MAINTENANT, 0).is_err());
    }

    #[test]
    fn catalogue_expire_refuse() {
        let e = verifier_catalogue(CATALOGUE, SIGNATURE, CLE, 4_102_444_800, 0).unwrap_err();
        assert!(e.contains("expiré"), "{e}");
        assert!(verifier_catalogue(CATALOGUE, SIGNATURE, CLE, 4_102_444_799, 0).is_ok());
    }

    #[test]
    fn retour_en_arriere_de_la_sequence_refuse() {
        assert!(
            verifier_catalogue(CATALOGUE, SIGNATURE, CLE, MAINTENANT, 7).is_ok(),
            "séquence égale : accepté"
        );
        assert!(verifier_catalogue(CATALOGUE, SIGNATURE, CLE, MAINTENANT, 6).is_ok());
        let e = verifier_catalogue(CATALOGUE, SIGNATURE, CLE, MAINTENANT, 8).unwrap_err();
        assert!(e.contains("retour en arrière"), "{e}");
    }

    #[test]
    fn catalogue_trop_gros_refuse() {
        let gros = vec![b' '; TAILLE_MAX_CATALOGUE + 1];
        assert!(verifier_catalogue(&gros, SIGNATURE, CLE, MAINTENANT, 0).is_err());
    }

    #[test]
    fn versions_comparees() {
        use Ordering::*;
        for (a, b, attendu) in [
            ("1.2.0", "1.10.0", Less),
            ("2.0.0", "1.99.99", Greater),
            ("1.0.0", "1.0.0", Equal),
            ("1.0.0-beta.1", "1.0.0", Less),
            ("1.0.0", "1.0.0-rc.1", Greater),
            ("1.0.0-alpha", "1.0.0-beta", Less),
            ("0.5.0", "0.4.9", Greater),
        ] {
            assert_eq!(comparer_versions(a, b), Some(attendu), "{a} {b}");
        }
        for mauvais in [
            "", "1", "1.2", "1.2.3.4", "a.b.c", "1.2.x", "1.0.0-", "-1.0.0", "1..0",
        ] {
            assert_eq!(comparer_versions(mauvais, "1.0.0"), None, "{mauvais}");
        }
    }

    #[test]
    fn revocations() {
        let c = catalogue();
        assert!(c.revocation("tracage", "1.1.1").unwrap().contains("faille"));
        assert!(
            c.revocation("tracage", "1.2.0").is_none(),
            "la version corrigée n'est pas révoquée"
        );
        assert!(c.revocation("tracage", "1.3.0").is_none());
        assert!(c
            .revocation("machines", "1.0.0")
            .unwrap()
            .contains("corrompues"));
        assert!(c.revocation("machines", "1.0.1").is_none());
        assert!(
            c.revocation("maths", "0.0.1").is_none(),
            "un autre plugin n'est pas touché"
        );
        // Une version illisible sous une règle « avant » est révoquée par prudence.
        assert!(c.revocation("tracage", "n'importe quoi").is_some());
    }

    #[test]
    fn installation_et_retour_en_arriere() {
        let c = catalogue();
        // Mise à jour normale.
        assert!(peut_installer(&c, "maths", Some("1.0.1"), "1.1.0", false).is_ok());
        // Première installation.
        assert!(peut_installer(&c, "maths", None, "1.1.0", false).is_ok());
        // Même version ou plus ancienne : refus, sauf retour en arrière voulu.
        assert!(peut_installer(&c, "maths", Some("1.1.0"), "1.1.0", false).is_err());
        assert!(peut_installer(&c, "maths", Some("1.1.0"), "1.0.1", false).is_err());
        assert!(peut_installer(&c, "maths", Some("1.1.0"), "1.0.1", true).is_ok());
        // Une version révoquée n'est jamais installée, même en retour en arrière.
        assert!(peut_installer(&c, "tracage", Some("1.2.0"), "1.1.1", true).is_err());
        assert!(peut_installer(&c, "tracage", None, "1.0.0", false).is_err());
        // Version illisible.
        assert!(peut_installer(&c, "maths", None, "latest", false).is_err());
        assert!(peut_installer(&c, "maths", Some("zzz"), "1.1.0", false).is_err());
    }

    fn arret(avertir: Option<u64>, refuser: Option<u64>, message: &str) -> Vec<ArretContrat> {
        vec![ArretContrat {
            majeure: 1,
            avertir_des: avertir,
            refuser_des: refuser,
            message: message.into(),
        }]
    }

    #[test]
    fn majeure_du_contrat() {
        for (texte, attendu) in [
            ("^1", 1),
            ("^2", 2),
            ("^2.1", 2),
            (">=3", 3),
            ("2", 2),
            ("", 1),
            ("latest", 1),
            ("^0", 1),
            ("^99999999999", 1),
        ] {
            assert_eq!(majeure_contrat(texte), attendu, "{texte}");
        }
    }

    #[test]
    fn arret_du_contrat_avertissement_puis_refus() {
        let a = arret(Some(100), Some(200), "");
        assert_eq!(statut_contrat(&a, "^1", 99), StatutContrat::Accepte);
        assert!(
            matches!(statut_contrat(&a, "^1", 100), StatutContrat::Avertir(m) if m.contains("^1"))
        );
        assert!(matches!(
            statut_contrat(&a, "^1", 199),
            StatutContrat::Avertir(_)
        ));
        assert!(
            matches!(statut_contrat(&a, "^1", 200), StatutContrat::Refuse(m) if m.contains("plus acceptés"))
        );
        // Le contrat 2 n'est jamais touché, ni un plugin sans apiVersion lisible n'échappe au contrat 1.
        assert_eq!(statut_contrat(&a, "^2", 9_999), StatutContrat::Accepte);
        assert!(matches!(
            statut_contrat(&a, "", 200),
            StatutContrat::Refuse(_)
        ));
    }

    #[test]
    fn arret_sans_date_ou_sans_entree_ne_refuse_jamais() {
        assert_eq!(statut_contrat(&[], "^1", u64::MAX), StatutContrat::Accepte);
        assert_eq!(
            statut_contrat(&arret(None, None, ""), "^1", u64::MAX),
            StatutContrat::Accepte
        );
        // Refus sans avertissement préalable : permis (c'est une décision de publication), refus seul.
        assert!(matches!(
            statut_contrat(&arret(None, Some(5), "Fini."), "^1", 5),
            StatutContrat::Refuse(m) if m == "Fini."
        ));
    }

    #[test]
    fn le_catalogue_signe_porte_les_arrets() {
        // Le catalogue d'essai n'en annonce aucun : champ absent = aucun arrêt.
        assert!(catalogue().contrats.is_empty());
        let c: Catalogue = serde_json::from_str(
            r#"{"format":2,"sequence":1,"expire":9,"contrats":[{"majeure":1,"refuser_des":7}]}"#,
        )
        .unwrap();
        assert_eq!(c.statut_contrat("^1", 6), StatutContrat::Accepte);
        assert!(matches!(
            c.statut_contrat("^1", 7),
            StatutContrat::Refuse(_)
        ));
        // Un champ mal formé fait refuser tout le catalogue (signé, donc c'est une erreur de publication) plutôt que d'ignorer l'arrêt.
        assert!(serde_json::from_str::<Catalogue>(
            r#"{"format":2,"sequence":1,"expire":9,"contrats":[{"majeure":"un"}]}"#
        )
        .is_err());
    }

    #[test]
    fn format_inattendu_refuse() {
        // Un catalogue authentique mais d'un ancien format n'est pas lu comme un format 2.
        let e = verifier_catalogue(
            include_bytes!("../fixtures/catalogue-essai-format1.json"),
            include_str!("../fixtures/catalogue-essai-format1.json.sig"),
            CLE,
            MAINTENANT,
            0,
        )
        .unwrap_err();
        assert!(e.contains("format"), "{e}");
    }
}
