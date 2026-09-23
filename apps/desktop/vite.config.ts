import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Configuration recommandée par Tauri : port fixe, pas d'effacement de la console,
// et le dossier Rust exclu de la surveillance des fichiers.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [svelte()],
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
