// Version web de l'hôte : une seule page (pas d'aperçu rapide), chemins relatifs pour pouvoir être
// hébergée dans un sous-dossier, manifeste PWA. Les plugins et le service worker sont ajoutés par
// scripts/construire-web.mjs (npm run build:web à la racine).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

/** Lien vers le manifeste PWA et couleur de la barre : seulement dans la version web, pas dans Tauri. */
function pwa(): Plugin {
  return {
    name: "etabli-pwa",
    transformIndexHtml: () => [
      { tag: "link", attrs: { rel: "manifest", href: "manifest.webmanifest" }, injectTo: "head" },
      { tag: "link", attrs: { rel: "icon", href: "icone-256.png" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "theme-color", content: "#2b63d9" }, injectTo: "head" },
      // iPhone (« Sur l'écran d'accueil ») : plein écran, icône et nom de l'application.
      { tag: "link", attrs: { rel: "apple-touch-icon", href: "icone-512.png" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "Établi" }, injectTo: "head" },
    ],
  };
}

// Configuration de la distribution (nom, thèmes, logo…) : le fichier désigné par ETABLE_DISTRIBUTION, comme pour l'application (vite.config.ts).
const DISTRIBUTION: unknown = process.env.ETABLE_DISTRIBUTION && existsSync(process.env.ETABLE_DISTRIBUTION) ? JSON.parse(readFileSync(process.env.ETABLE_DISTRIBUTION, "utf-8").replace(/^\uFEFF/, "")) : null;

export default defineConfig({
  base: "./",
  define: { __DISTRIBUTION__: JSON.stringify(DISTRIBUTION) },
  plugins: [svelte(), pwa()],
  resolve: {
    alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
  },
  publicDir: fileURLToPath(new URL("./public-web", import.meta.url)),
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: { main: fileURLToPath(new URL("./index.html", import.meta.url)) } },
  },
});
