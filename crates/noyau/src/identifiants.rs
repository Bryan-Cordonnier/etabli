//! Noms acceptés pour les identifiants qui deviennent des chemins, des clés ou des adresses.

/// Identifiant de plugin ou de mini-app : minuscules, chiffres et tirets, 64 caractères au plus.
pub fn plugin_valide(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Identifiant de document : 8 à 64 caractères hexadécimaux.
pub fn document_valide(id: &str) -> bool {
    id.len() >= 8 && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Nom d'un fichier de données (réglages de plugin, services) : minuscules, chiffres, tirets et
/// points, sans chemin ni fichier caché, 64 caractères au plus.
pub fn donnees_valide(nom: &str) -> bool {
    !nom.is_empty()
        && nom.len() <= 64
        && !nom.starts_with('.')
        && nom
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.')
}

/// Nom d'utilisateur : 3 à 32 caractères, lettres, chiffres, point, tiret et tiret bas.
pub fn utilisateur_valide(nom: &str) -> bool {
    (3..=32).contains(&nom.chars().count())
        && nom
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plugins() {
        for ok in ["maths", "tolerie", "debit-tubes", "a1"] {
            assert!(plugin_valide(ok), "{ok}");
        }
        for ko in ["", "Maths", "a/b", "..", "a b", "é", &"a".repeat(65)] {
            assert!(!plugin_valide(ko), "{ko}");
        }
    }

    #[test]
    fn documents() {
        assert!(document_valide("3f2a9c1e"));
        assert!(document_valide(&"a".repeat(32)));
        for ko in ["", "3f2a9c1", "zzzzzzzz", "../../etc", &"a".repeat(65)] {
            assert!(!document_valide(ko), "{ko}");
        }
    }

    #[test]
    fn donnees() {
        for ok in ["plugin.economie", "service.fournisseurs.liste", "a-b"] {
            assert!(donnees_valide(ok), "{ok}");
        }
        for ko in [
            "",
            "../settings",
            "a/b",
            "a\\b",
            ".cache",
            "Fournisseurs",
            "c:",
        ] {
            assert!(!donnees_valide(ko), "{ko}");
        }
    }

    #[test]
    fn utilisateurs() {
        for ok in ["bryan", "a.b-c_d", "Bryan42"] {
            assert!(utilisateur_valide(ok), "{ok}");
        }
        for ko in ["ab", "", "a b", "a/b", "é", &"a".repeat(33)] {
            assert!(!utilisateur_valide(ko), "{ko}");
        }
    }
}
