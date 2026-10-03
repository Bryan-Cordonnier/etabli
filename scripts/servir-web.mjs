// Sert apps/desktop/dist-web en local pour l'essayer (npm run preview:web), comme le ferait un hébergement statique.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

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

createServer((req, res) => {
  const chemin = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
  let fichier = normalize(join(racine, chemin === "/" ? "index.html" : chemin));
  if (!fichier.startsWith(racine + sep) && fichier !== racine) fichier = join(racine, "index.html");
  if (!existsSync(fichier) || !statSync(fichier).isFile()) {
    res.statusCode = 404;
    res.end("Introuvable");
    return;
  }
  res.setHeader("Content-Type", MIME[extname(fichier)] ?? "application/octet-stream");
  res.end(readFileSync(fichier));
}).listen(port, () => console.log(`Version web sur http://localhost:${port}`));
