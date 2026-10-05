package fr.etabli.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Règles d'adresse des plugins : tout ce qui n'est pas exactement la forme attendue est refusé. */
public class CheminsPluginsTest {

    private static final String H = "https://maths.plugins.localhost";

    @Test
    public void accepteLesAdressesNormales() {
        CheminsPlugins.Demande d = CheminsPlugins.analyser(H + "/apps/pythagore/index.html");
        assertNotNull(d);
        assertEquals("maths", d.id);
        assertEquals("apps/pythagore/index.html", d.chemin);
        assertEquals("public/plugins/maths/apps/pythagore/index.html", d.cheminAsset());

        assertNotNull(CheminsPlugins.analyser(H + "/manifest.json"));
        assertNotNull(CheminsPlugins.analyser(H + ":443/manifest.json"));
        assertNotNull(CheminsPlugins.analyser("https://economie-3d.plugins.localhost/a.js?v=2"));
        assertEquals("a b.js", CheminsPlugins.analyser(H + "/a%20b.js").chemin);
        assertEquals("é.css", CheminsPlugins.analyser(H + "/%C3%A9.css").chemin);
    }

    @Test
    public void refuseLesEvasionsDeChemin() {
        String[] mauvais = {
            "/../secret.txt",
            "/apps/../../secret.txt",
            "/%2e%2e/secret.txt",
            "/%2E%2E/secret.txt",
            "/.%2e/secret.txt",
            "/apps%2f..%2f..%2fsecret.txt",
            "/apps%2Fa.html",
            "/apps%5ca.html",
            "/a%00.html",
            "/a%0d%0a.html",
            "/%252e%252e/x",
            "/./manifest.json",
            "/",
            "//manifest.json",
            "/apps//a.html",
            "/apps/",
            "/.cache",
            "/apps/.cache",
            "/c:",
            "/a:b",
            "/a%3ab",
            "/a%zz",
            "/a%2",
            "/a%",
            "/%ff.js",
            "/%c0%ae%c0%ae/x",
            "/a b.js",
            "/é.js",
        };
        for (String chemin : mauvais) {
            assertNull(chemin, CheminsPlugins.analyser(H + chemin));
        }
        assertNull(CheminsPlugins.analyser(H));
        assertNull(CheminsPlugins.analyser(H + "/a\\b"));
        assertNull(CheminsPlugins.analyser(H + "/" + "a".repeat(300)));
        assertNull(CheminsPlugins.analyser(H + "/" + "a/".repeat(600) + "x"));
    }

    @Test
    public void refuseLesHotesEtrangers() {
        String[] mauvais = {
            "https://plugins.localhost/a.js",
            "https://.plugins.localhost/a.js",
            "https://localhost/plugins/maths/a.js",
            "https://a.b.plugins.localhost/a.js",
            "https://maths.plugins.localhost.evil.com/a.js",
            "https://maths.plugins.localhostx/a.js",
            "https://maths-plugins.localhost/a.js",
            "https://MATHS.plugins.localhost/a.js",
            "https://ma_ths.plugins.localhost/a.js",
            "https://-maths.plugins.localhost/a.js",
            "https://maths-.plugins.localhost/a.js",
            "https://" + "a".repeat(64) + ".plugins.localhost/a.js",
            "http://maths.plugins.localhost/a.js",
            "ftp://maths.plugins.localhost/a.js",
            "//maths.plugins.localhost/a.js",
            "https://user@maths.plugins.localhost/a.js",
            "https://evil.com@maths.plugins.localhost/a.js",
            "https://maths.plugins.localhost@evil.com/a.js",
            "https://maths.plugins.localhost:8443/a.js",
            "https://maths.plugins.localhost:/a.js",
            "https://maths.plugins.localhost:443x/a.js",
            "https://maths.plugins.localhost\\@evil.com/a.js",
            "https://maths.plugins.localhost/a.js#x",
            "",
        };
        for (String url : mauvais) {
            assertNull(url, CheminsPlugins.analyser(url));
        }
        assertNull(CheminsPlugins.analyser(null));
    }

    @Test
    public void accepteUnIdentifiantDe63Caracteres() {
        String id = "a".repeat(63);
        assertNotNull(CheminsPlugins.analyser("https://" + id + ".plugins.localhost/a.js"));
        assertTrue(CheminsPlugins.idValide(id));
        assertFalse(CheminsPlugins.idValide(id + "a"));
    }

    @Test
    public void idValideSuitLaRegleDuNoyau() {
        for (String ok : new String[] {"maths", "economie-3d", "a", "9", "a-b-c"}) assertTrue(ok, CheminsPlugins.idValide(ok));
        for (String ko : new String[] {"", null, "Maths", "a.b", "a_b", "-a", "a-", "a b", "é", "a/b", ".."}) {
            assertFalse(String.valueOf(ko), CheminsPlugins.idValide(ko));
        }
    }

    @Test
    public void concerneToutLeDomaineMemeMalForme() {
        String[] concernes = {
            H + "/a.js",
            "http://maths.plugins.localhost/a.js",
            "https://plugins.localhost/",
            "https://MATHS.Plugins.Localhost/a.js",
            "https://a.b.plugins.localhost/a.js",
            "https://maths.plugins.localhost.:443/a.js",
            "https://user@maths.plugins.localhost/",
            "https://maths.plugins.localhost:8443/a.js",
            "https://maths.plugins.localhost\\@evil.com/",
            "https://maths.plugins.localhost?x=1",
            "https://maths.plugins.localhost#x",
        };
        for (String url : concernes) assertTrue(url, CheminsPlugins.concerne(url));
        String[] autres = {
            "https://localhost/index.html",
            "https://exemple.fr/plugins.localhost",
            "https://maths.plugins.localhost.evil.com/a.js",
            "https://evil.com/?h=maths.plugins.localhost",
            "https://evil.com@exemple.fr/maths.plugins.localhost",
            "data:text/html,x",
            "about:blank",
            "",
            null,
        };
        for (String url : autres) assertFalse(String.valueOf(url), CheminsPlugins.concerne(url));
    }

    @Test
    public void typesMime() {
        assertEquals("text/html; charset=utf-8", CheminsPlugins.typeMime("apps/a/index.html"));
        assertEquals("text/javascript; charset=utf-8", CheminsPlugins.typeMime("assets/a-1.js"));
        assertEquals("text/javascript; charset=utf-8", CheminsPlugins.typeMime("assets/a.MJS"));
        assertEquals("text/css; charset=utf-8", CheminsPlugins.typeMime("a.css"));
        assertEquals("application/json", CheminsPlugins.typeMime("manifest.json"));
        assertEquals("image/svg+xml", CheminsPlugins.typeMime("i.svg"));
        assertEquals("font/woff2", CheminsPlugins.typeMime("f.woff2"));
        assertEquals("application/wasm", CheminsPlugins.typeMime("m.wasm"));
        assertEquals("application/octet-stream", CheminsPlugins.typeMime("inconnu.xyz"));
        assertEquals("application/octet-stream", CheminsPlugins.typeMime("sansextension"));
    }

    @Test
    public void laPolitiqueNAutoriseAucunReseau() {
        String csp = CheminsPlugins.csp("https://localhost");
        assertTrue(csp.contains("default-src 'none'"));
        assertTrue(csp.contains("connect-src 'none'"));
        assertTrue(csp.contains("form-action 'none'"));
        assertTrue(csp.contains("base-uri 'none'"));
        assertTrue(csp.endsWith("frame-ancestors https://localhost"));
        assertFalse(csp.contains("'unsafe-eval'"));
        assertFalse(csp.contains("http:"));
        assertFalse(csp.contains("*"));
    }
}
