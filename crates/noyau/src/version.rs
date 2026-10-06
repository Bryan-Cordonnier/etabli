//! Comparaison de versions « majeur.mineur.correctif[-préversion] » : fonctions pures, partagées par l'application de bureau
//! (refuser de réinstaller une version plus ancienne) et le serveur.

use std::cmp::Ordering;

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

/// Une version bien formée (`1.2.3` ou `1.2.3-beta.1`).
pub fn version_valide(version: &str) -> bool {
    analyser(version).is_some()
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

#[cfg(test)]
mod tests {
    use super::*;

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
            assert!(!version_valide(mauvais), "{mauvais}");
        }
    }
}
