import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Configuration recommandée par Tauri : port fixe, pas d'effacement de la console,
// et le dossier Rust exclu de la surveillance des fichiers.
const host = process.env.TAURI_DEV_HOST;

const PLUGINS_DIR = fileURLToPath(new URL("../../plugins", import.meta.url));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wasm": "application/wasm",
};

/**
 * Aperçu dans un navigateur : sert les fichiers des plugins sous /__plugins/<id>/<chemin>,
 * comme le fait le cœur Rust dans l'application (voir src-tauri/src/plugins.rs).
 */
function servePlugins(): Plugin {
  return {
    name: "etabli-plugins-preview",
    configureServer(server) {
      server.middlewares.use("/__plugins", (req, res, next) => {
        const path = decodeURIComponent((req.url ?? "").split("?")[0] ?? "");
        const [, id = "", ...rest] = path.split("/");
        const root = [join(PLUGINS_DIR, id, "dist"), join(PLUGINS_DIR, id)].find((dir) =>
          existsSync(join(dir, "manifest.json")),
        );
        if (!/^[a-z0-9-]+$/.test(id) || !root) return next();
        const file = normalize(join(root, ...rest));
        if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        // Le cadre isolé a une origine opaque : ses scripts modules sont des requêtes CORS.
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), servePlugins()],
  resolve: {
    alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // WebView2 est basé sur Chromium : on cible un moteur récent.
    target: "chrome120",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
