// Écrit latest.json, le fichier que les Établi installés lisent pour savoir s'il existe une nouvelle
// version (plugins.updater.endpoints de tauri.conf.json). Lancé par .github/workflows/publier.yml,
// APRÈS la signature Windows (SignPath) : la signature de mise à jour (.sig) doit porter sur le MSI
// final, sinon Tauri refuse le fichier téléchargé.
//   node scripts/latest-json.mjs v0.2.0 chemin/Etabli_0.2.0_x64_fr-FR.msi notes.txt > latest.json
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const [tag, msi, notesFile] = process.argv.slice(2);
if (!tag || !msi || !notesFile) {
  console.error("Usage : node scripts/latest-json.mjs <étiquette> <fichier .msi> <notes.txt>");
  process.exit(1);
}

const url = `https://github.com/Bryan-Cordonnier/etabli/releases/download/${tag}/${encodeURIComponent(basename(msi))}`;
const signature = readFileSync(`${msi}.sig`, "utf8").trim();
const platform = { signature, url };

const latest = {
  version: tag.replace(/^v/, ""),
  notes: readFileSync(notesFile, "utf8").trim(),
  pub_date: new Date().toISOString(),
  // Le paramétrage « -msi » est choisi en priorité par un Établi installé par MSI ; la clé générale
  // sert aux autres (dont la 0.1.0, installée avec NSIS).
  platforms: { "windows-x86_64-msi": platform, "windows-x86_64": platform },
};
process.stdout.write(`${JSON.stringify(latest, null, 2)}\n`);
