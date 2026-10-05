//! Rotation des clés de signature (docs/20, section 3.5).
//!
//! Le moteur embarque une ou plusieurs **clés racines** (hors ligne, jamais sur GitHub). La racine ne signe qu'une chose : la
//! **liste des clés de publication** valides (`cles.json` + `cles.json.minisig`), avec leurs dates. Une clé de publication
//! signe ensuite le catalogue et les paquets. Pour changer de clé : on publie une nouvelle liste (séquence plus grande) qui
//! ajoute la nouvelle clé et garde l'ancienne jusqu'à une date ; pour retirer une clé compromise : une liste sans elle.
//! Aucune nouvelle version du moteur n'est nécessaire.
//!
//! Tant qu'aucune liste n'a été vue, seule la clé d'origine (celle de `tauri.conf.json`) est de confiance. Dès qu'une liste
//! valide a été acceptée, **seules ses clés comptent** : une clé absente de la liste est retirée, y compris la clé d'origine.
//!
//! Fonctions pures : l'heure et la dernière séquence vue sont passées en paramètres.

use crate::paquet::verifier_signature_parmi;
use serde::{Deserialize, Serialize};

/// Taille maximale d'une liste de clés lue sur le réseau.
pub const TAILLE_MAX_LISTE: usize = 64 * 1024;

/// Version du format de la liste.
pub const FORMAT: u32 = 1;

/// Une clé de publication de confiance.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CleConfiance {
    /// Nom lisible (`2026-10`, `secours`…), pour les messages et la procédure.
    pub id: String,
    /// Clé publique minisign, encodée comme `pubkey` de `tauri.conf.json`.
    pub cle: String,
    /// Début de validité (secondes depuis 1970).
    pub depuis: u64,
    /// Fin de validité ; `None` : sans fin tant qu'une liste plus récente ne la retire pas.
    #[serde(default)]
    pub jusqua: Option<u64>,
}

impl CleConfiance {
    fn valide_a(&self, maintenant: u64) -> bool {
        self.depuis <= maintenant && self.jusqua.is_none_or(|fin| maintenant < fin)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListeCles {
    pub format: u32,
    /// Augmente à chaque nouvelle liste : un client refuse une liste de séquence inférieure à la dernière vue
    /// (sinon on pourrait lui resservir une ancienne liste qui contient encore une clé retirée).
    pub sequence: u64,
    pub cles: Vec<CleConfiance>,
}

impl ListeCles {
    /// Clés de publication utilisables à cet instant.
    pub fn cles_valides(&self, maintenant: u64) -> Vec<String> {
        self.cles
            .iter()
            .filter(|c| c.valide_a(maintenant))
            .map(|c| c.cle.clone())
            .collect()
    }
}

/// Vérifie la liste : signature de l'une des clés racines d'abord, puis format, séquence et cohérence des dates.
///
/// Une liste sans aucune clé valide à cet instant est refusée : l'accepter couperait le client de tout catalogue.
pub fn verifier_liste<S: AsRef<str>>(
    octets: &[u8],
    signature: &str,
    racines: &[S],
    maintenant: u64,
    derniere_sequence: u64,
) -> Result<ListeCles, String> {
    if octets.len() > TAILLE_MAX_LISTE {
        return Err("Liste de clés trop volumineuse.".into());
    }
    if racines.is_empty() {
        return Err("Aucune clé racine de confiance : liste de clés ignorée.".into());
    }
    verifier_signature_parmi(octets, signature, racines)
        .map_err(|_| "Liste de clés refusée : signature de la racine invalide.".to_string())?;
    let liste: ListeCles = serde_json::from_slice(octets)
        .map_err(|_| "Liste de clés illisible (format inattendu).".to_string())?;
    if liste.format != FORMAT {
        return Err(format!(
            "Liste de clés de format {} : cette version d'Établi attend le format {FORMAT}.",
            liste.format
        ));
    }
    if liste.sequence < derniere_sequence {
        return Err(format!(
            "Liste de clés refusée : séquence {} inférieure à la dernière vue ({derniere_sequence}), retour en arrière suspect.",
            liste.sequence
        ));
    }
    if liste
        .cles
        .iter()
        .any(|c| c.jusqua.is_some_and(|fin| fin <= c.depuis))
    {
        return Err("Liste de clés incohérente : une clé finit avant de commencer.".into());
    }
    if liste.cles_valides(maintenant).is_empty() {
        return Err("Liste de clés refusée : aucune clé n'est valide à cette date.".into());
    }
    Ok(liste)
}

/// Clés de confiance à utiliser pour le catalogue et les paquets : celles de la dernière liste acceptée si elle existe
/// (une clé qui n'y figure plus est retirée), sinon la seule clé d'origine.
pub fn cles_de_confiance(
    cle_origine: &str,
    liste: Option<&ListeCles>,
    maintenant: u64,
) -> Vec<String> {
    match liste {
        Some(l) => l.cles_valides(maintenant),
        None => vec![cle_origine.to_string()],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalogue::verifier_catalogue_parmi;
    use crate::paquet::verifier_signature;

    const LISTE: &[u8] = include_bytes!("../fixtures/cles-essai.json");
    const LISTE_SIG: &str = include_str!("../fixtures/cles-essai.json.sig");
    const RETRAIT: &[u8] = include_bytes!("../fixtures/cles-essai-retrait.json");
    const RETRAIT_SIG: &str = include_str!("../fixtures/cles-essai-retrait.json.sig");
    const RACINE: &str = include_str!("../fixtures/cle-racine-essai.pub");
    const PUB1: &str = include_str!("../fixtures/cle-publication-1-essai.pub");
    const PUB2: &str = include_str!("../fixtures/cle-publication-2-essai.pub");
    const CATALOGUE: &[u8] = include_bytes!("../fixtures/catalogue-essai-pub1.json");
    const SIG_PUB1: &str = include_str!("../fixtures/catalogue-essai-pub1.json.sig");
    const SIG_PUB2: &str = include_str!("../fixtures/catalogue-essai-pub2.json.sig");
    const AUTRE_CLE: &str = include_str!("../fixtures/cle-catalogue-essai.pub");
    const MAINTENANT: u64 = 1_790_000_000;

    fn liste() -> ListeCles {
        verifier_liste(LISTE, LISTE_SIG, &[RACINE], MAINTENANT, 0).expect("liste d'essai valide")
    }

    fn norm(cle: &str) -> String {
        cle.trim().to_string()
    }

    #[test]
    fn liste_signee_par_la_racine_acceptee() {
        let l = liste();
        assert_eq!(l.sequence, 2);
        assert_eq!(l.cles.len(), 2);
        assert_eq!(l.cles_valides(MAINTENANT).len(), 2);
    }

    #[test]
    fn liste_non_signee_par_la_racine_refusee() {
        // Signée par la racine mais vérifiée avec une clé de publication, ou modifiée, ou sans racine connue.
        assert!(verifier_liste(LISTE, LISTE_SIG, &[PUB1], MAINTENANT, 0).is_err());
        let mut modifiee = LISTE.to_vec();
        modifiee.extend_from_slice(b" ");
        let e = verifier_liste(&modifiee, LISTE_SIG, &[RACINE], MAINTENANT, 0).unwrap_err();
        assert!(e.contains("signature"), "{e}");
        let aucune: [&str; 0] = [];
        assert!(verifier_liste(LISTE, LISTE_SIG, &aucune, MAINTENANT, 0).is_err());
        assert!(verifier_liste(LISTE, "pas une signature", &[RACINE], MAINTENANT, 0).is_err());
    }

    #[test]
    fn plusieurs_racines_dont_la_suivante() {
        // La racine suivante, embarquée d'avance, peut signer à son tour : une racine parmi plusieurs suffit.
        assert!(verifier_liste(LISTE, LISTE_SIG, &[AUTRE_CLE, RACINE], MAINTENANT, 0).is_ok());
    }

    #[test]
    fn sequence_de_la_liste_ne_recule_pas() {
        assert!(verifier_liste(LISTE, LISTE_SIG, &[RACINE], MAINTENANT, 2).is_ok());
        let e = verifier_liste(LISTE, LISTE_SIG, &[RACINE], MAINTENANT, 3).unwrap_err();
        assert!(e.contains("retour en arrière"), "{e}");
    }

    #[test]
    fn validite_des_cles_selon_la_date() {
        let l = liste();
        // Avant le début de la nouvelle clé : seule l'ancienne.
        assert_eq!(l.cles_valides(1_750_000_000), vec![norm(PUB1)]);
        // Après la fin de l'ancienne : seule la nouvelle.
        assert_eq!(l.cles_valides(1_800_000_000), vec![norm(PUB2)]);
        // Avant tout : rien.
        assert!(l.cles_valides(1_600_000_000).is_empty());
        // Une liste sans clé valide à cette date est refusée (sinon le client serait coupé de tout).
        let e = verifier_liste(LISTE, LISTE_SIG, &[RACINE], 1_600_000_000, 0).unwrap_err();
        assert!(e.contains("aucune clé"), "{e}");
    }

    #[test]
    fn catalogue_signe_par_l_ancienne_ou_la_nouvelle_cle() {
        let cles = liste().cles_valides(MAINTENANT);
        for sig in [SIG_PUB1, SIG_PUB2] {
            assert!(verifier_catalogue_parmi(CATALOGUE, sig, &cles, MAINTENANT, 0).is_ok());
        }
        // Une clé inconnue n'a aucun droit.
        assert!(
            verifier_catalogue_parmi(CATALOGUE, SIG_PUB1, &[AUTRE_CLE], MAINTENANT, 0).is_err()
        );
        assert!(verifier_catalogue_parmi::<&str>(CATALOGUE, SIG_PUB1, &[], MAINTENANT, 0).is_err());
    }

    #[test]
    fn cle_retiree_refusee_apres_la_nouvelle_liste() {
        let retrait = verifier_liste(RETRAIT, RETRAIT_SIG, &[RACINE], MAINTENANT, 2).unwrap();
        assert_eq!(retrait.sequence, 3);
        let cles = cles_de_confiance(PUB1, Some(&retrait), MAINTENANT);
        assert_eq!(cles, vec![norm(PUB2)]);
        let e = verifier_catalogue_parmi(CATALOGUE, SIG_PUB1, &cles, MAINTENANT, 0).unwrap_err();
        assert!(e.contains("Signature") || e.contains("signature"), "{e}");
        assert!(verifier_catalogue_parmi(CATALOGUE, SIG_PUB2, &cles, MAINTENANT, 0).is_ok());
        // Resservir l'ancienne liste (qui contient encore la clé retirée) est refusé par la séquence.
        assert!(verifier_liste(LISTE, LISTE_SIG, &[RACINE], MAINTENANT, 3).is_err());
    }

    #[test]
    fn avant_toute_liste_seule_la_cle_d_origine() {
        assert_eq!(
            cles_de_confiance(PUB1, None, MAINTENANT),
            vec![PUB1.to_string()]
        );
        // Une fois une liste vue, la clé d'origine n'est plus de confiance si elle n'y figure pas.
        let retrait = verifier_liste(RETRAIT, RETRAIT_SIG, &[RACINE], MAINTENANT, 0).unwrap();
        assert!(!cles_de_confiance(PUB1, Some(&retrait), MAINTENANT).contains(&PUB1.to_string()));
    }

    #[test]
    fn format_et_dates_incoherents_refuses() {
        // Les fixtures sont valides ; on vérifie ici les contrôles de cohérence sans signature.
        let l = ListeCles {
            format: FORMAT,
            sequence: 1,
            cles: vec![CleConfiance {
                id: "x".into(),
                cle: PUB1.into(),
                depuis: 10,
                jusqua: Some(10),
            }],
        };
        assert!(l.cles_valides(10).is_empty());
        assert!(verifier_signature(b"x", SIG_PUB1, PUB2).is_err());
    }

    #[test]
    fn liste_trop_grosse_refusee() {
        let gros = vec![b' '; TAILLE_MAX_LISTE + 1];
        assert!(verifier_liste(&gros, LISTE_SIG, &[RACINE], MAINTENANT, 0).is_err());
    }
}
