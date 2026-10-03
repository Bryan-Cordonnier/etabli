// Termine la version web : copie les plugins compilés dans apps/desktop/dist-web/plugins/, écrit la liste
// plugins/index.json et le service worker qui rend l'application utilisable hors ligne.
// Utilisation : npm run build:web (à la racine), qui compile d'abord les plugins et l'interface.
import { createHash } from "node:crypto";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const racine = fileURLToPath(new URL("..", import.meta.url));
const sortie = join(racine, "apps", "desktop", "dist-web");
const dossierPlugins = join(racine, "plugins");

/** Tous les fichiers d'un dossier, en chemins relatifs avec des « / ». */
export function listerFichiers(dossier, base = dossier) {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    return entree.isDirectory() ? listerFichiers(chemin, base) : [relative(base, chemin).split(sep).join("/")];
  });
}

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
  if (requete.method !== "GET" || new URL(requete.url).origin !== self.location.origin) return;
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
