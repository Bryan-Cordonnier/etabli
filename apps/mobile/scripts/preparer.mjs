// Prépare le projet Android : `cap sync`, puis remet le dossier `plugins/` de la version web. Capacitor supprime
// `public/plugins/` (il le réserve aux plugins Cordova), alors que c'est là qu'Établi range ses propres plugins.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(racine, "..", "desktop", "dist-web");
if (!existsSync(join(source, "plugins", "index.json"))) {
  console.error("Version web absente : lancez d'abord `npm run build:web` à la racine du dépôt.");
  process.exit(1);
}
const sync = spawnSync("npx", ["cap", "sync", "android"], { cwd: racine, stdio: "inherit", shell: process.platform === "win32" });
if (sync.status !== 0) process.exit(sync.status ?? 1);

const cible = join(racine, "android", "app", "src", "main", "assets", "public", "plugins");
rmSync(cible, { recursive: true, force: true });
cpSync(join(source, "plugins"), cible, { recursive: true });
console.log("Plugins d'Établi copiés dans le projet Android.");

// APK de SONDE (jamais distribué) : remplace l'application par la page de tools/sonde-pont-android, qui vérifie qu'un cadre
// de mini-app n'atteint ni le pont natif ni l'application (docs/19, §4). Demandé par ETABLI_SONDE_PONT=1.
if (process.env.ETABLI_SONDE_PONT === "1") {
  const sonde = join(racine, "..", "..", "tools", "sonde-pont-android");
  const publicDir = join(racine, "android", "app", "src", "main", "assets", "public");
  cpSync(join(sonde, "hote.html"), join(publicDir, "index.html"));
  mkdirSync(join(cible, "sonde-pont"), { recursive: true });
  cpSync(join(sonde, "sonde.html"), join(cible, "sonde-pont", "index.html"));
  cpSync(join(sonde, "ok.js"), join(cible, "sonde-pont", "ok.js"));
  console.warn("ATTENTION : APK de SONDE du pont natif. Ne pas distribuer ; l'application d'Établi est remplacée.");
}
