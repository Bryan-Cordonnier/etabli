//! Capture de l'écran sous l'aperçu rapide, en basse résolution : la page la floute
//! progressivement à l'ouverture (l'effet acrylique de Windows, lui, apparaît d'un coup).

/// Image RGBA, ligne par ligne depuis le haut.
pub struct Ecran {
    pub largeur: u32,
    pub hauteur: u32,
    pub pixels: Vec<u8>,
}

impl Ecran {
    /// Format envoyé à la page : largeur et hauteur (u32 petit-boutiste), puis les pixels.
    pub fn octets(self) -> Vec<u8> {
        let mut octets = Vec::with_capacity(8 + self.pixels.len());
        octets.extend_from_slice(&self.largeur.to_le_bytes());
        octets.extend_from_slice(&self.hauteur.to_le_bytes());
        octets.extend(self.pixels);
        octets
    }
}

/// Réduction appliquée : au moins de moitié, et jamais plus de 1 280 pixels de large.
/// L'image est floutée à l'écran : une résolution plus fine ne se verrait pas.
fn taille_reduite(largeur: u32, hauteur: u32) -> (u32, u32) {
    let diviseur = (f64::from(largeur) / 1280.0).ceil().max(2.0);
    let reduire = |v: u32| ((f64::from(v) / diviseur).round() as u32).max(1);
    (reduire(largeur), reduire(hauteur))
}

/// Zone de l'écran en pixels physiques (position et taille d'un moniteur).
#[cfg(windows)]
pub fn ecran(x: i32, y: i32, largeur: u32, hauteur: u32) -> Option<Ecran> {
    use std::{mem::size_of, ptr::null_mut};
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
        ReleaseDC, SelectObject, SetBrushOrgEx, SetStretchBltMode, StretchBlt, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HALFTONE, SRCCOPY,
    };

    let (l, h) = taille_reduite(largeur, hauteur);
    let (li, hi) = (i32::try_from(l).ok()?, i32::try_from(h).ok()?);
    let (lsrc, hsrc) = (i32::try_from(largeur).ok()?, i32::try_from(hauteur).ok()?);

    // SAFETY : appels GDI classiques ; chaque objet créé est libéré avant de sortir,
    // et le tampon a exactement la taille demandée à GetDIBits (l × h × 4 octets).
    unsafe {
        let ecran = GetDC(null_mut());
        if ecran.is_null() {
            return None;
        }
        let memoire = CreateCompatibleDC(ecran);
        let image = CreateCompatibleBitmap(ecran, li, hi);
        let ancienne = SelectObject(memoire, image);
        // HALFTONE : réduction lissée (moyenne des pixels), sans crénelage.
        SetStretchBltMode(memoire, HALFTONE);
        SetBrushOrgEx(memoire, 0, 0, null_mut());
        let copie = StretchBlt(memoire, 0, 0, li, hi, ecran, x, y, lsrc, hsrc, SRCCOPY);

        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader = BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: li,
            biHeight: -hi, // négatif : lignes depuis le haut
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            ..std::mem::zeroed()
        };
        let mut pixels = vec![0u8; (l * h * 4) as usize];
        SelectObject(memoire, ancienne);
        let lignes = GetDIBits(
            memoire,
            image,
            0,
            h,
            pixels.as_mut_ptr().cast(),
            &mut info,
            DIB_RGB_COLORS,
        );

        DeleteObject(image);
        DeleteDC(memoire);
        ReleaseDC(null_mut(), ecran);

        if copie == 0 || lignes != hi {
            return None;
        }
        // GDI donne du BGRA (alpha à 0) ; la page attend du RGBA opaque.
        for pixel in pixels.chunks_exact_mut(4) {
            pixel.swap(0, 2);
            pixel[3] = 255;
        }
        Some(Ecran {
            largeur: l,
            hauteur: h,
            pixels,
        })
    }
}

#[cfg(not(windows))]
pub fn ecran(_x: i32, _y: i32, _largeur: u32, _hauteur: u32) -> Option<Ecran> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reduit_au_moins_de_moitie() {
        assert_eq!(taille_reduite(1920, 1080), (960, 540));
        assert_eq!(taille_reduite(1366, 768), (683, 384));
        assert_eq!(taille_reduite(3840, 2160), (1280, 720));
    }

    #[test]
    fn entete_puis_pixels() {
        let ecran = Ecran {
            largeur: 2,
            hauteur: 1,
            pixels: vec![1, 2, 3, 255, 4, 5, 6, 255],
        };
        assert_eq!(
            ecran.octets(),
            vec![2, 0, 0, 0, 1, 0, 0, 0, 1, 2, 3, 255, 4, 5, 6, 255]
        );
    }
}
