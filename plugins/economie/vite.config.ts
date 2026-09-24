/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Une page HTML par mini-app. Le dossier public/ (manifest.json) est copié tel quel dans dist/.
const app = (name: string) => fileURLToPath(new URL(`./apps/${name}/index.html`, import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [svelte()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome120",
    // three.js (aperçu 3D, ~560 ko) : chargé à part, seulement quand l'aperçu s'affiche.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        "debit-tubes": app("debit-tubes"),
        "calepinage-rect": app("calepinage-rect"),
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
