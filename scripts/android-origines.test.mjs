// Cohérence entre la partie native d'Android (Java, non compilable hors de la CI) et le reste du dépôt : mêmes types de
// fichiers, même politique de sécurité, même modèle d'adresse que le serveur et que l'interface. Le Java lui-même est
// testé par JUnit (CheminsPluginsTest, lancé par la CI Android) ; ce test ne lit que le texte des sources.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CSP_PLUGIN_WEB } from "./construire-web.mjs";

const lire = (chemin) => readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), "utf-8");
const JAVA = "apps/mobile/android/app/src/main/java/fr/etabli/app/";
const chemins = lire(`${JAVA}CheminsPlugins.java`);

/** Valeur d'une chaîne Java faite de morceaux littéraux concaténés. */
function chaineJava(texte) {
  return [...texte.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("");
}

test("le modèle d'adresse est le même côté Java et côté interface", () => {
  const ts = lire("apps/desktop/src/lib/mobile/origines.ts");
  const modeleTs = /MODELE_ANDROID = "([^"]+)"/.exec(ts)[1];
  assert.equal(modeleTs, "https://{id}.plugins.localhost");
  const suffixe = /SUFFIXE = "([^"]+)"/.exec(chemins)[1];
  assert.equal(`https://{id}${suffixe}`, modeleTs);
  assert.match(chemins, /MODELE = "https:\/\/\{id\}" \+ SUFFIXE/);
});

test("la politique de sécurité est celle de la version web, plus frame-ancestors", () => {
  const corps = /static String csp\(String origineApplication\) \{\s*return \(([\s\S]*?)\);\s*\}/.exec(chemins)[1];
  const csp = chaineJava(corps.split("origineApplication")[0]);
  assert.equal(csp, `${CSP_PLUGIN_WEB}; frame-ancestors `);
  assert.doesNotMatch(csp, /sandbox/);
});

test("les types de fichiers sont ceux du serveur (type_mime du noyau)", () => {
  const rust = lire("crates/noyau/src/paquet.rs");
  const table = (source, motif) => {
    const out = new Map();
    for (const m of source.matchAll(motif)) {
      const type = m[2];
      for (const ext of m[1].match(/"([a-z0-9]+)"/g).map((e) => e.slice(1, -1))) out.set(ext, type);
    }
    return out;
  };
  const rustTable = table(rust.slice(rust.indexOf("pub fn type_mime")), /Some\(((?:"[a-z0-9]+"(?: \| )?)+)\) => "([^"]+)"/g);
  const bloc = chemins.slice(chemins.indexOf("static String typeMime"));
  const javaTable = new Map();
  for (const m of bloc.matchAll(/((?:case "[a-z0-9]+":\s*)+)return "([^"]+)";/g)) {
    for (const e of m[1].matchAll(/case "([a-z0-9]+)"/g)) javaTable.set(e[1], m[2]);
  }
  assert.ok(rustTable.size >= 10, "table Rust lue");
  assert.deepEqual([...javaTable].sort(), [...rustTable].sort());
});

test("les plugins sont lus là où scripts/preparer.mjs les remet", () => {
  const preparer = lire("apps/mobile/scripts/preparer.mjs");
  assert.match(preparer, /"assets", "public", "plugins"/);
  assert.match(chemins, /DOSSIER_ASSETS = "public\/plugins"/);
});

test("le pont natif n'est pas exposé aux cadres et l'interception est installée", () => {
  const activite = lire(`${JAVA}MainActivity.java`);
  for (const nom of ["androidBridge", "CapacitorHttpAndroidInterface", "CapacitorCookiesAndroidInterface"]) {
    assert.match(activite, new RegExp(`"${nom}"`));
  }
  assert.match(activite, /removeJavascriptInterface/);
  assert.match(activite, /setWebViewClient\(new OriginesPlugins\(bridge\)\)/);
  assert.match(activite, /registerPlugin\(EtabliOriginesPlugin\.class\)/);
  // Le retrait doit précéder tout chargement : il se fait juste après super.onCreate, avant que la boucle rende la main.
  assert.ok(activite.indexOf("super.onCreate") < activite.indexOf("removeJavascriptInterface"));
});

test("l'interception ne laisse rien partir vers le réseau pour le domaine des plugins", () => {
  const client = lire(`${JAVA}OriginesPlugins.java`);
  assert.match(client, /if \(!CheminsPlugins\.concerne\(url\)\)\s*\{\s*return super\.shouldInterceptRequest/);
  assert.match(client, /catch \(RuntimeException e\)/);
  assert.doesNotMatch(client, /HttpURLConnection|OkHttp|openConnection|java\.net\./);
  assert.match(client, /Content-Security-Policy/);
  assert.match(client, /X-Content-Type-Options/);
});
