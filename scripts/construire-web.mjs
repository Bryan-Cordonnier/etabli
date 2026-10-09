// Termine la version web : copie les plugins compilés dans apps/desktop/dist-web/plugins/, écrit la liste
// plugins/index.json et le service worker qui rend l'application utilisable hors ligne.
// Utilisation : npm run build:web (à la racine), qui compile d'abord les plugins et l'interface.
import { createHash } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const racine = fileURLToPath(new URL("..", import.meta.url));
const sortie = join(racine, "apps", "desktop", "dist-web");
// Une distribution (Quotidien…) donne ses propres plugins compilés par ETABLE_PLUGINS_DIR, comme pour l'aperçu et l'application.
const dossierPlugins = process.env.ETABLE_PLUGINS_DIR || join(racine, "plugins");

/** Tous les fichiers d'un dossier, en chemins relatifs avec des « / ». */
export function listerFichiers(dossier, base = dossier) {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    return entree.isDirectory() ? listerFichiers(chemin, base) : [relative(base, chemin).split(sep).join("/")];
  });
}

/**
 * Politique de sécurité des pages de plugins de la version web : mêmes règles que le serveur (aucun réseau). Un hébergement
 * statique ne peut pas l'envoyer en en-tête de façon portable (GitHub Pages) : elle est posée par une balise <meta> dans chaque
 * page de mini-app. `sandbox` et `frame-ancestors` n'existent pas en <meta> : le cadre de l'application pose le sandbox.
 */
export const CSP_PLUGIN_WEB =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self' data:; worker-src 'self' blob:; connect-src 'none'; base-uri 'none'; form-action 'none'";

/** Insère la politique en tête du <head> d'une page de plugin (avant tout script) ; refuse une page sans <head>. */
export function avecCsp(html) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP_PLUGIN_WEB}" />`;
  if (!/<head(\s[^>]*)?>/i.test(html)) throw new Error("page de plugin sans <head> : politique de sécurité impossible");
  return html.replace(/<head(\s[^>]*)?>/i, (balise) => `${balise}\n    ${meta}`);
}

/**
 * Fichier _headers (Netlify, Cloudflare Pages) : les cadres de mini-apps ont une origine opaque, leurs scripts, styles et polices
 * sont des requêtes CORS. GitHub Pages envoie déjà l'en-tête.
 */
export const ENTETES_WEB = "/plugins/*\n  Access-Control-Allow-Origin: *\n";

/** Code du service worker : cache de tous les fichiers, réponse depuis le cache d'abord. */
export function serviceWorker(version, fichiers) {
  return `// Généré par scripts/construire-web.mjs : ne pas modifier à la main.
const CACHE = "etabli-${version}";
const FICHIERS = ${JSON.stringify(["./", ...fichiers], null, 2)};

self.addEventListener("install", (event) => {
  // Pas de skipWaiting : la nouvelle version prend la main quand tous les onglets ont été fermés,
  // pour ne jamais mélanger deux versions dans une même fenêtre.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FICHIERS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((noms) => Promise.all(noms.filter((n) => n.startsWith("etabli-") && n !== CACHE).map((n) => caches.delete(n)))),
  );
});

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  const adresse = new URL(requete.url);
  if (requete.method !== "GET" || adresse.origin !== self.location.origin) return;
  // Les plugins servis par un serveur Établi peuvent changer à tout moment (mise à jour par l'administrateur) :
  // réseau d'abord, copie gardée seulement pour le hors ligne. Jamais l'API : le cache des données est dans l'application.
  if (adresse.pathname.includes("/plugins/")) {
    event.respondWith(
      fetch(requete)
        .then((reponse) => {
          if (reponse.ok) {
            const copie = reponse.clone();
            caches.open(CACHE).then((cache) => cache.put(requete, copie));
          }
          return reponse;
        })
        .catch(() => caches.match(requete, { ignoreSearch: true }).then((trouve) => trouve ?? Response.error())),
    );
    return;
  }
  if (adresse.pathname.includes("/api/")) return;
  event.respondWith(
    caches.match(requete, { ignoreSearch: true }).then(
      (trouve) =>
        trouve ??
        fetch(requete).catch(() =>
          requete.mode === "navigate" ? caches.match("./index.html") : Response.error(),
        ),
    ),
  );
});
`;
}

export function construire() {
  if (!existsSync(join(sortie, "index.html"))) {
    throw new Error("apps/desktop/dist-web/index.html est absent : lancez « npm run build:web » à la racine.");
  }
  rmSync(join(sortie, "plugins"), { recursive: true, force: true });
  mkdirSync(join(sortie, "plugins"), { recursive: true });

  const index = [];
  for (const id of readdirSync(dossierPlugins).sort()) {
    const dist = join(dossierPlugins, id, "dist");
    if (!existsSync(join(dist, "manifest.json"))) continue;
    cpSync(dist, join(sortie, "plugins", id), { recursive: true });
    index.push({ manifest: JSON.parse(readFileSync(join(dist, "manifest.json"), "utf-8")), official: true });
  }
  for (const fichier of listerFichiers(join(sortie, "plugins")).filter((f) => f.endsWith(".html"))) {
    const chemin = join(sortie, "plugins", fichier);
    writeFileSync(chemin, avecCsp(readFileSync(chemin, "utf-8")));
  }
  writeFileSync(join(sortie, "_headers"), ENTETES_WEB);
  if (index.length === 0) throw new Error("Aucun plugin compilé : lancez « npm run build:plugins ».");
  writeFileSync(join(sortie, "plugins", "index.json"), JSON.stringify(index));

  rmSync(join(sortie, "sw.js"), { force: true });
  const fichiers = listerFichiers(sortie);
  const empreinte = createHash("sha256");
  for (const f of fichiers) empreinte.update(f).update(readFileSync(join(sortie, f)));
  const version = empreinte.digest("hex").slice(0, 12);
  writeFileSync(join(sortie, "sw.js"), serviceWorker(version, fichiers));

  const octets = fichiers.reduce((total, f) => total + statSync(join(sortie, f)).size, 0);
  console.log(`Version web prête : ${sortie}`);
  console.log(`  ${index.length} plugins, ${fichiers.length} fichiers, ${(octets / 1e6).toFixed(1)} Mo, version ${version}`);
  return { version, fichiers, plugins: index.map((p) => p.manifest.id) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) construire();
