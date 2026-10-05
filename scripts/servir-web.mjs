// Sert apps/desktop/dist-web en local pour l'essayer (npm run preview:web), comme le ferait un hébergement statique.
// Seuls les fichiers présents au démarrage sont servis : l'adresse demandée sert de clé dans cette liste,
// elle n'est jamais utilisée pour construire un chemin sur le disque.
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listerFichiers } from "./construire-web.mjs";

const racine = join(fileURLToPath(new URL("..", import.meta.url)), "apps", "desktop", "dist-web");
const port = Number(process.env.PORT ?? 4180);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wasm": "application/wasm",
};

if (!existsSync(join(racine, "index.html"))) {
  console.error("apps/desktop/dist-web est absent : lancez d'abord « npm run build:web ».");
  process.exit(1);
}

/** Adresse (« /assets/a.js ») → chemin du fichier, pour tous les fichiers de la version construite. */
const fichiers = new Map(listerFichiers(racine).map((f) => [`/${f}`, join(racine, f)]));

createServer((req, res) => {
  let adresse;
  try {
    adresse = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
  } catch {
    res.statusCode = 400;
    res.end("Adresse invalide");
    return;
  }
  const fichier = fichiers.get(adresse === "/" ? "/index.html" : adresse);
  if (!fichier) {
    res.statusCode = 404;
    res.end("Introuvable");
    return;
  }
  // Comme GitHub Pages ou le fichier _headers : les cadres de mini-apps (origine opaque) lisent les fichiers de plugins.
  if (adresse.startsWith("/plugins/")) res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", MIME[extname(fichier)] ?? "application/octet-stream");
  res.end(readFileSync(fichier));
}).listen(port, () => console.log(`Version web sur http://localhost:${port}`));
