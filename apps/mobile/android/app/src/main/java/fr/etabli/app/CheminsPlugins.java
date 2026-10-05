package fr.etabli.app;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Règles d'adresse des plugins sur Android : un plugin = une origine {@code https://<id>.plugins.localhost}.
 *
 * <p>Classe volontairement sans aucune dépendance Android, pour être testée sur un poste de développement
 * ({@code CheminsPluginsTest}). Mêmes règles que le serveur (crates/serveur : {@code ModelePlugins::id_depuis_hote},
 * {@code chemin_sur}) et que l'identifiant de plugin du noyau ({@code plugin_valide}). Tout est refusé par défaut :
 * une adresse n'est servie que si elle correspond exactement à la forme attendue.
 */
final class CheminsPlugins {

    /** Suffixe du nom d'hôte, après l'identifiant. */
    static final String SUFFIXE = ".plugins.localhost";

    /** Modèle annoncé à l'interface (variable {@code {id}}). */
    static final String MODELE = "https://{id}" + SUFFIXE;

    /** Dossier des plugins dans les ressources embarquées de l'application (voir scripts/preparer.mjs). */
    static final String DOSSIER_ASSETS = "public/plugins";

    private static final int CHEMIN_MAX = 1024;
    private static final int SEGMENT_MAX = 255;

    private CheminsPlugins() {}

    /** Ce que demande une adresse de plugin : l'identifiant du plugin et le chemin du fichier dans son dossier. */
    static final class Demande {
        final String id;
        final String chemin;

        Demande(String id, String chemin) {
            this.id = id;
            this.chemin = chemin;
        }

        /** Chemin de la ressource embarquée, par exemple {@code public/plugins/maths/apps/a.html}. */
        String cheminAsset() {
            return DOSSIER_ASSETS + "/" + id + "/" + chemin;
        }
    }

    /** Un identifiant de plugin est valide s'il l'est pour le noyau ET peut servir de nom d'hôte. */
    static boolean idValide(String id) {
        if (id == null || id.isEmpty() || id.length() > 63) return false;
        if (id.charAt(0) == '-' || id.charAt(id.length() - 1) == '-') return false;
        for (int i = 0; i < id.length(); i++) {
            char c = id.charAt(i);
            boolean ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-';
            if (!ok) return false;
        }
        return true;
    }

    /**
     * Vrai si l'adresse vise le domaine des plugins (ou l'un de ses sous-domaines), même mal formée : l'interception
     * répond alors 404 au lieu de laisser la requête partir vers le réseau.
     */
    static boolean concerne(String url) {
        String hote = hoteBrut(url);
        if (hote == null) return false;
        return hote.equals(SUFFIXE.substring(1)) || hote.endsWith(SUFFIXE);
    }

    /** Hôte (sans identifiants ni port, en minuscules) d'une adresse, lu de façon tolérante ; {@code null} sans « :// ». */
    private static String hoteBrut(String url) {
        if (url == null) return null;
        int debut = url.indexOf("://");
        if (debut < 0) return null;
        int fin = debut + 3;
        while (fin < url.length() && "/?#\\".indexOf(url.charAt(fin)) < 0) fin++;
        String autorite = url.substring(debut + 3, fin);
        int arobase = autorite.lastIndexOf('@');
        if (arobase >= 0) autorite = autorite.substring(arobase + 1);
        int deuxPoints = autorite.lastIndexOf(':');
        if (deuxPoints >= 0 && !autorite.endsWith("]")) autorite = autorite.substring(0, deuxPoints);
        while (autorite.endsWith(".")) autorite = autorite.substring(0, autorite.length() - 1);
        return autorite.toLowerCase(Locale.ROOT);
    }

    /**
     * Analyse stricte d'une adresse {@code https://<id>.plugins.localhost[:443]/<chemin>[?requête]}.
     *
     * @return la demande, ou {@code null} si quoi que ce soit s'écarte de la forme attendue
     */
    static Demande analyser(String url) {
        if (url == null || url.length() > CHEMIN_MAX + 128) return null;
        final String schema = "https://";
        if (!url.startsWith(schema)) return null;
        String reste = url.substring(schema.length());
        // La requête est ignorée ; un fragment n'est jamais envoyé, et une barre oblique inverse n'a rien à faire ici.
        int fragment = reste.indexOf('#');
        if (fragment >= 0 || reste.indexOf('\\') >= 0) return null;
        int requete = reste.indexOf('?');
        if (requete >= 0) reste = reste.substring(0, requete);

        int barre = reste.indexOf('/');
        if (barre < 0) return null;
        String autorite = reste.substring(0, barre);
        String cheminBrut = reste.substring(barre);

        // Ni identifiants (« u@hote »), ni port autre que celui de https.
        if (autorite.indexOf('@') >= 0) return null;
        int deuxPoints = autorite.indexOf(':');
        if (deuxPoints >= 0) {
            if (!autorite.substring(deuxPoints + 1).equals("443")) return null;
            autorite = autorite.substring(0, deuxPoints);
        }
        if (!autorite.endsWith(SUFFIXE)) return null;
        String id = autorite.substring(0, autorite.length() - SUFFIXE.length());
        // Un seul niveau : « a.b.plugins.localhost » est refusé parce que « . » n'est pas permis dans un identifiant.
        if (!idValide(id)) return null;

        String chemin = cheminSur(cheminBrut);
        return chemin == null ? null : new Demande(id, chemin);
    }

    /**
     * Chemin relatif sûr à partir du chemin d'une adresse (commençant par « / », encodé en pourcentage), ou {@code null}.
     * Segments simples seulement : ni vide, ni « . » ou « .. », ni fichier caché, ni séparateur ou caractère de contrôle
     * obtenu après décodage, ni double encodage.
     */
    static String cheminSur(String cheminBrut) {
        if (cheminBrut == null || cheminBrut.length() < 2 || cheminBrut.length() > CHEMIN_MAX) return null;
        if (cheminBrut.charAt(0) != '/') return null;
        String[] segments = cheminBrut.substring(1).split("/", -1);
        StringBuilder sortie = new StringBuilder();
        for (int i = 0; i < segments.length; i++) {
            String segment = decoderSegment(segments[i]);
            if (segment == null) return null;
            if (i > 0) sortie.append('/');
            sortie.append(segment);
        }
        return sortie.toString();
    }

    /** Valeur d'un chiffre hexadécimal ASCII, ou -1 (Character.digit accepterait aussi des chiffres d'autres écritures). */
    private static int chiffreHex(char c) {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        if (c >= 'A' && c <= 'F') return c - 'A' + 10;
        return -1;
    }

    /** Décode un segment (UTF-8 strict) et le contrôle ; {@code null} s'il est refusé. */
    private static String decoderSegment(String brut) {
        if (brut.isEmpty() || brut.length() > SEGMENT_MAX) return null;
        byte[] octets = new byte[brut.length()];
        int n = 0;
        for (int i = 0; i < brut.length(); i++) {
            char c = brut.charAt(i);
            if (c == '%') {
                int haut = i + 1 < brut.length() ? chiffreHex(brut.charAt(i + 1)) : -1;
                int bas = i + 2 < brut.length() ? chiffreHex(brut.charAt(i + 2)) : -1;
                if (haut < 0 || bas < 0) return null;
                octets[n++] = (byte) (haut * 16 + bas);
                i += 2;
            } else if (c > 0x20 && c < 0x7f) {
                octets[n++] = (byte) c;
            } else {
                // Espace, contrôle ou caractère non ASCII non encodé : l'adresse d'une requête est déjà encodée.
                return null;
            }
        }
        String texte;
        try {
            texte =
                StandardCharsets.UTF_8
                    .newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(octets, 0, n))
                    .toString();
        } catch (CharacterCodingException e) {
            return null;
        }
        if (texte.isEmpty() || texte.charAt(0) == '.') return null;
        for (int i = 0; i < texte.length(); i++) {
            char c = texte.charAt(i);
            if (c < 0x20 || c == 0x7f || c == '/' || c == '\\' || c == ':' || c == '%' || c == '?' || c == '#') return null;
        }
        return texte;
    }

    /** Type de contenu d'après l'extension (mêmes types que le serveur : {@code type_mime} du noyau). */
    static String typeMime(String chemin) {
        int point = chemin.lastIndexOf('.');
        String extension = point < 0 ? "" : chemin.substring(point + 1).toLowerCase(Locale.ROOT);
        switch (extension) {
            case "html":
                return "text/html; charset=utf-8";
            case "js":
            case "mjs":
                return "text/javascript; charset=utf-8";
            case "css":
                return "text/css; charset=utf-8";
            case "json":
                return "application/json";
            case "svg":
                return "image/svg+xml";
            case "png":
                return "image/png";
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            case "webp":
                return "image/webp";
            case "woff2":
                return "font/woff2";
            case "woff":
                return "font/woff";
            case "wasm":
                return "application/wasm";
            case "txt":
            case "md":
                return "text/plain; charset=utf-8";
            default:
                return "application/octet-stream";
        }
    }

    /**
     * Politique de sécurité des pages de plugins : mêmes règles que le serveur (aucun accès réseau, seulement leurs
     * propres fichiers), plus {@code frame-ancestors} limité à l'application. Pas de {@code sandbox} ici : le cadre de
     * l'application l'ajoute lui-même.
     */
    static String csp(String origineApplication) {
        return (
            "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'none'; " +
            "base-uri 'none'; form-action 'none'; frame-ancestors " +
            origineApplication
        );
    }
}
