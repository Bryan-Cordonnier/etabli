import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Script } from "node:vm";
import { avecCsp, CSP_PLUGIN_WEB, ENTETES_WEB, listerFichiers, serviceWorker } from "./construire-web.mjs";

test("listerFichiers : chemins relatifs avec des « / », sous-dossiers compris", () => {
  const dossier = mkdtempSync(join(tmpdir(), "web-"));
  mkdirSync(join(dossier, "assets"));
  mkdirSync(join(dossier, "plugins", "maths"), { recursive: true });
  writeFileSync(join(dossier, "index.html"), "x");
  writeFileSync(join(dossier, "assets", "a.js"), "x");
  writeFileSync(join(dossier, "plugins", "maths", "manifest.json"), "{}");
  assert.deepEqual(listerFichiers(dossier).sort(), ["assets/a.js", "index.html", "plugins/maths/manifest.json"]);
});

test("serviceWorker : code valide, version et fichiers dans le cache", () => {
  const code = serviceWorker("abc123", ["index.html", "assets/a.js", "plugins/index.json"]);
  assert.doesNotThrow(() => new Script(code));
  assert.match(code, /etabli-abc123/);
  assert.match(code, /"\.\/",\s*"index\.html",\s*"assets\/a\.js",\s*"plugins\/index\.json"/);
  // Jamais de prise de contrôle forcée : une nouvelle version attend la fermeture des onglets.
  assert.doesNotMatch(code, /skipWaiting\(|clients\.claim\(/);
});

test("serviceWorker : seules les requêtes GET de la même origine passent par le cache", () => {
  const code = serviceWorker("v", ["index.html"]);
  assert.match(code, /requete\.method !== "GET"/);
  assert.match(code, /origin !== self\.location\.origin/);
});

test("serviceWorker : plugins d'un serveur réseau d'abord, API jamais interceptée", () => {
  const code = serviceWorker("v", ["index.html"]);
  assert.match(code, /pathname\.includes\("\/plugins\/"\)/);
  assert.match(code, /pathname\.includes\("\/api\/"\)\) return;/);
  assert.doesNotThrow(() => new Script(code));
});

test("avecCsp : la politique sans réseau est la première balise du <head>, avant tout script", () => {
  const html = '<!doctype html><html><head>\n<meta charset="UTF-8" />\n<script type="module" src="a.js"></script></head><body></body></html>';
  const sortie = avecCsp(html);
  assert.ok(sortie.indexOf("Content-Security-Policy") < sortie.indexOf("<script"));
  assert.ok(sortie.indexOf("Content-Security-Policy") < sortie.indexOf("<meta charset"));
  assert.match(CSP_PLUGIN_WEB, /default-src 'none'/);
  assert.match(CSP_PLUGIN_WEB, /connect-src 'none'/);
  assert.match(CSP_PLUGIN_WEB, /form-action 'none'/);
  assert.doesNotMatch(CSP_PLUGIN_WEB, /'unsafe-eval'|https?:/);
  assert.throws(() => avecCsp("<body>sans head</body>"), /sans <head>/);
});

test("ENTETES_WEB : CORS ouvert sous plugins/ seulement", () => {
  assert.match(ENTETES_WEB, /^\/plugins\/\*\n  Access-Control-Allow-Origin: \*\n$/);
});
