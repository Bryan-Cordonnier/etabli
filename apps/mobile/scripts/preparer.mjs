// Prépare le projet Android : `cap sync`, puis remet le dossier `plugins/` de la version web. Capacitor supprime
// `public/plugins/` (il le réserve aux plugins Cordova), alors que c'est là qu'Établi range ses propres plugins.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
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
