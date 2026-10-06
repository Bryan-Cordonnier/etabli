/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Une page HTML par mini-app. Le dossier public/ (manifest.json) est copié tel quel dans dist/.
const page = (chemin: string) => fileURLToPath(new URL(`./${chemin}/index.html`, import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [svelte()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome120",
    rollupOptions: {
      input: {
        calendrier: page("apps/calendrier"),
        rappels: page("apps/rappels"),
        service: page("service"),
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
