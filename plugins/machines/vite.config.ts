/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Ce plugin n'a pas de mini-app : une seule page, celle de ses réglages (Paramètres → Plugins).
// Le dossier public/ (manifest.json) est copié tel quel dans dist/.
export default defineConfig({
  base: "./",
  plugins: [svelte()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome120",
    rollupOptions: {
      input: {
        reglages: fileURLToPath(new URL("./reglages/index.html", import.meta.url)),
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
