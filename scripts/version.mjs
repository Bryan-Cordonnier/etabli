// Change la version de l'application partout où elle est écrite, avant de publier une version :
//   npm run version:app -- 0.2.0
// (tauri.conf.json, Cargo.toml, Cargo.lock, apps/desktop/package.json). La mise à jour automatique
// compare cette version à celle de la dernière version publiée : elle doit toujours augmenter.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2] ?? "";
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage : npm run version:app -- 1.2.3");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauri = join(root, "apps", "desktop", "src-tauri");
const edits = [
  [join(tauri, "tauri.conf.json"), /("version":\s*")[^"]+(")/],
  [join(root, "apps", "desktop", "package.json"), /("version":\s*")[^"]+(")/],
  [join(tauri, "Cargo.toml"), /(\[package\][^[]*?\nversion = ")[^"]+(")/],
  [join(tauri, "Cargo.lock"), /(\nname = "etabli"\nversion = ")[^"]+(")/],
];

for (const [file, pattern] of edits) {
  const text = readFileSync(file, "utf8");
  if (!pattern.test(text)) {
    console.error(`Version introuvable dans ${file}`);
    process.exit(1);
  }
  writeFileSync(file, text.replace(pattern, `$1${version}$2`));
}
console.log(`Version ${version} écrite. Ensuite : commit, puis étiquette v${version} (voir docs/14-publier-une-version.md).`);
