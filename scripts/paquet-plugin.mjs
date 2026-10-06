// Fabrique le paquet signé d'un plugin (docs/14) :
//   node scripts/paquet-plugin.mjs agenda
//     → paquets/agenda-1.0.0.etabli-plugin, à installer depuis un fichier dans Établi
//   node scripts/paquet-plugin.mjs --dossier chemin/vers/dist --sortie dossier   (paquet d'essai)
//
// Un paquet `.etabli-plugin` est un zip qui contient :
//   plugin.zip         les fichiers du plugin compilé (son dossier dist, manifest.json à la racine)
//   plugin.zip.minisig la signature de plugin.zip, faite par `tauri signer sign` avec la clé des
//                      mises à jour (variables TAURI_SIGNING_PRIVATE_KEY et _PASSWORD)
// Établi refuse d'installer un paquet dont la signature ne correspond pas à sa clé publique.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const id = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const dist = option("--dossier") ? resolve(option("--dossier")) : id ? join(root, "plugins", id, "dist") : "";
const sortie = resolve(option("--sortie") ?? join(root, "paquets"));
if (!dist || !existsSync(join(dist, "manifest.json"))) {
  console.error("Usage : node scripts/paquet-plugin.mjs <id>  (après npm run build -w plugins/<id>)");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
if (id && manifest.id !== id) {
  console.error(`Le manifeste de plugins/${id} a l'identifiant « ${manifest.id} ».`);
  process.exit(1);
}

// Fichiers du plugin, chemins en « / », date fixe : le même dist donne le même zip.
const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files[relative(dist, path).split("\\").join("/")] = readFileSync(path);
  }
};
walk(dist);
const mtime = new Date("2026-01-01T00:00:00Z");
const inner = zipSync(files, { level: 9, mtime });

mkdirSync(sortie, { recursive: true });
const base = `${manifest.id}-${manifest.version}`;
const tmp = join(sortie, `${base}.plugin.zip`);
writeFileSync(tmp, inner);
execSync(`npx tauri signer sign "${tmp}"`, { cwd: join(root, "apps", "desktop"), stdio: ["ignore", "ignore", "inherit"] });
const signature = readFileSync(`${tmp}.sig`, "utf8").trim();
rmSync(tmp);
rmSync(`${tmp}.sig`);

const paquet = zipSync(
  { "plugin.zip": [inner, { level: 0 }], "plugin.zip.minisig": strToU8(signature) },
  { level: 0, mtime },
);
const fichier = `${base}.etabli-plugin`;
writeFileSync(join(sortie, fichier), paquet);
console.log(`Paquet : ${join(sortie, fichier)} (${Math.round(paquet.length / 1024)} Ko, ${Object.keys(files).length} fichiers)`);

