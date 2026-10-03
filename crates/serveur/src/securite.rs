//! Mots de passe, jetons de session et limitation des essais de connexion.

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

/// Nombre maximal de hachages Argon2 en même temps : chacun prend de la mémoire, et un flot de
/// connexions ne doit pas pouvoir épuiser celle du serveur.
const HACHAGES_SIMULTANES: usize = 4;
static PLACES_HACHAGE: tokio::sync::Semaphore =
    tokio::sync::Semaphore::const_new(HACHAGES_SIMULTANES);

pub const MOT_DE_PASSE_MIN: usize = 10;
pub const MOT_DE_PASSE_MAX: usize = 128;

/// Règles sur un nouveau mot de passe ; renvoie la phrase à afficher si elles ne sont pas respectées.
pub fn controler_mot_de_passe(mot_de_passe: &str, nom: &str) -> Result<(), String> {
    let longueur = mot_de_passe.chars().count();
    if longueur < MOT_DE_PASSE_MIN {
        return Err(format!(
            "Le mot de passe doit faire au moins {MOT_DE_PASSE_MIN} caractères."
        ));
    }
    if longueur > MOT_DE_PASSE_MAX {
        return Err(format!(
            "Le mot de passe ne doit pas dépasser {MOT_DE_PASSE_MAX} caractères."
        ));
    }
    if mot_de_passe.eq_ignore_ascii_case(nom) {
        return Err("Le mot de passe ne doit pas être identique à l'identifiant.".into());
    }
    Ok(())
}

/// Hache hors du fil asynchrone, en attendant une place libre.
pub async fn hacher_async(mot_de_passe: String) -> Result<String, String> {
    let _place = PLACES_HACHAGE.acquire().await.map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || hacher(&mot_de_passe))
        .await
        .map_err(|e| e.to_string())?
}

/// Vérifie hors du fil asynchrone, en attendant une place libre. Sans hachage connu, fait une
/// vérification factice de même durée.
pub async fn verifier_async(mot_de_passe: String, hache: Option<String>) -> bool {
    let Ok(_place) = PLACES_HACHAGE.acquire().await else {
        return false;
    };
    tokio::task::spawn_blocking(move || match hache {
        Some(h) => verifier(&mot_de_passe, &h),
        None => {
            verification_factice(&mot_de_passe);
            false
        }
    })
    .await
    .unwrap_or(false)
}

pub fn hacher(mot_de_passe: &str) -> Result<String, String> {
    let sel = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(mot_de_passe.as_bytes(), &sel)
        .map(|h| h.to_string())
        .map_err(|e| format!("hachage impossible : {e}"))
}

pub fn verifier(mot_de_passe: &str, hache: &str) -> bool {
    PasswordHash::new(hache).is_ok_and(|h| {
        Argon2::default()
            .verify_password(mot_de_passe.as_bytes(), &h)
            .is_ok()
    })
}

/// Vérification factice pour un identifiant inconnu : la réponse prend le même temps qu'un vrai
/// refus, on ne peut donc pas deviner quels identifiants existent.
pub fn verification_factice(mot_de_passe: &str) {
    static FAUX: OnceLock<String> = OnceLock::new();
    let hache = FAUX.get_or_init(|| hacher("mot de passe factice").unwrap_or_default());
    let _ = verifier(mot_de_passe, hache);
}

/// Jeton de session : 32 octets aléatoires. Seule son empreinte est gardée en base.
pub fn nouveau_jeton() -> (String, String) {
    let mut octets = [0u8; 32];
    rand::rng().fill_bytes(&mut octets);
    let jeton = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(octets);
    let empreinte = empreinte(&jeton);
    (jeton, empreinte)
}

pub fn empreinte(jeton: &str) -> String {
    Sha256::digest(jeton.as_bytes())
        .iter()
        .map(|o| format!("{o:02x}"))
        .collect()
}

/// Code à usage unique affiché dans la console du serveur au premier lancement : il prouve que
/// la personne qui crée l'administrateur a accès à la machine du serveur.
pub fn nouveau_code_installation() -> String {
    let mut octets = [0u8; 8];
    rand::rng().fill_bytes(&mut octets);
    let mut code: String = octets.iter().map(|o| format!("{o:02X}")).collect();
    code.insert(8, '-');
    code
}

/// Comparaison de deux textes en temps constant (empreintes de même longueur).
pub fn egaux(a: &str, b: &str) -> bool {
    use subtle::ConstantTimeEq;
    a.as_bytes().ct_eq(b.as_bytes()).into()
}

// ——— Limitation des essais ———

struct Essais {
    echecs: u32,
    debut: Instant,
    bloque_jusqu_a: Option<Instant>,
}

/// Compte les échecs par clé (identifiant, adresse…). Au-delà de `max` échecs dans la `fenetre`,
/// la clé est bloquée pendant `blocage`. Un succès efface le compteur.
pub struct Limiteur {
    max: u32,
    fenetre: Duration,
    blocage: Duration,
    etat: Mutex<HashMap<String, Essais>>,
}

impl Limiteur {
    pub fn new(max: u32, fenetre: Duration, blocage: Duration) -> Self {
        Self {
            max,
            fenetre,
            blocage,
            etat: Mutex::new(HashMap::new()),
        }
    }

    /// `Err(secondes)` si la clé est bloquée.
    pub fn verifier(&self, cle: &str) -> Result<(), u64> {
        let Ok(etat) = self.etat.lock() else {
            return Ok(());
        };
        match etat.get(cle).and_then(|e| e.bloque_jusqu_a) {
            Some(fin) if fin > Instant::now() => Err((fin - Instant::now()).as_secs() + 1),
            _ => Ok(()),
        }
    }

    pub fn echec(&self, cle: &str) {
        let Ok(mut etat) = self.etat.lock() else {
            return;
        };
        let maintenant = Instant::now();
        // Pas de croissance sans limite : on oublie les clés dont la fenêtre est passée.
        if etat.len() > 10_000 {
            let (fenetre, blocage) = (self.fenetre, self.blocage);
            etat.retain(|_, e| {
                e.bloque_jusqu_a.is_some_and(|f| f > maintenant)
                    || maintenant.duration_since(e.debut) < fenetre.max(blocage)
            });
        }
        let essais = etat.entry(cle.to_string()).or_insert(Essais {
            echecs: 0,
            debut: maintenant,
            bloque_jusqu_a: None,
        });
        if maintenant.duration_since(essais.debut) > self.fenetre {
            essais.echecs = 0;
            essais.debut = maintenant;
            essais.bloque_jusqu_a = None;
        }
        essais.echecs += 1;
        if essais.echecs >= self.max {
            essais.bloque_jusqu_a = Some(maintenant + self.blocage);
        }
    }

    pub fn succes(&self, cle: &str) {
        if let Ok(mut etat) = self.etat.lock() {
            etat.remove(cle);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn regles_du_mot_de_passe() {
        assert!(controler_mot_de_passe("court", "bryan").is_err());
        assert!(controler_mot_de_passe(&"a".repeat(129), "bryan").is_err());
        assert!(controler_mot_de_passe("bryan-bryan", "BRYAN-BRYAN").is_err());
        assert!(controler_mot_de_passe("une phrase de passe", "bryan").is_ok());
    }

    #[test]
    fn hachage_argon2id() {
        let hache = hacher("une phrase de passe").unwrap();
        assert!(hache.starts_with("$argon2id$"));
        assert!(!hache.contains("phrase"));
        assert!(verifier("une phrase de passe", &hache));
        assert!(!verifier("une autre phrase", &hache));
        assert!(!verifier("x", "pas un hachage"));
        assert_ne!(
            hache,
            hacher("une phrase de passe").unwrap(),
            "chaque hachage a son sel"
        );
    }

    #[test]
    fn jetons_uniques_et_empreintes_stables() {
        let (a, ea) = nouveau_jeton();
        let (b, eb) = nouveau_jeton();
        assert_ne!(a, b);
        assert_eq!(a.len(), 43);
        assert_eq!(empreinte(&a), ea);
        assert_ne!(ea, eb);
        assert_ne!(a, ea, "le jeton n'est pas son empreinte");
    }

    #[test]
    fn code_d_installation() {
        let code = nouveau_code_installation();
        assert_eq!(code.len(), 17);
        assert_eq!(code.as_bytes()[8], b'-');
    }

    #[test]
    fn blocage_apres_trop_d_echecs() {
        let l = Limiteur::new(3, Duration::from_secs(60), Duration::from_secs(60));
        assert!(l.verifier("a").is_ok());
        l.echec("a");
        l.echec("a");
        assert!(l.verifier("a").is_ok());
        l.echec("a");
        assert!(l.verifier("a").is_err());
        assert!(
            l.verifier("b").is_ok(),
            "les autres clés ne sont pas touchées"
        );
        l.succes("a");
        assert!(l.verifier("a").is_ok());
    }

    #[test]
    fn le_blocage_prend_fin() {
        let l = Limiteur::new(1, Duration::from_secs(60), Duration::from_millis(30));
        l.echec("a");
        assert!(l.verifier("a").is_err());
        std::thread::sleep(Duration::from_millis(60));
        assert!(l.verifier("a").is_ok());
    }

    #[test]
    fn comparaison_en_temps_constant() {
        assert!(egaux("abc", "abc"));
        assert!(!egaux("abc", "abd"));
        assert!(!egaux("abc", "abcd"));
    }
}
