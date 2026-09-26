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
    rollupOptions: {
      input: {
        masse: app("masse"),
        taraudage: app("taraudage"),
        rotation: app("rotation"),
        serrage: app("serrage"),
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
