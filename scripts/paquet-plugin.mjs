// Fabrique le paquet signé d'un plugin pour le catalogue (docs/13 et docs/14) :
//   node scripts/paquet-plugin.mjs maths
//     → paquets/maths-1.0.0.etabli-plugin, et paquets/catalogue.json mis à jour (s'il existe, il est
//       complété : c'est celui téléchargé depuis la Release « catalogue » par le workflow)
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
import { notesDuPlugin } from "./notes-catalogue.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE = "https://github.com/Bryan-Cordonnier/etabli/releases/download/catalogue";

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

// Catalogue : l'entrée de ce plugin, reprise de son manifeste (l'application l'affiche sans rien télécharger).
if (id) {
  const catalogueFile = join(sortie, "catalogue.json");
  const catalogue = existsSync(catalogueFile)
    ? JSON.parse(readFileSync(catalogueFile, "utf8"))
    : { format: 1, plugins: [] };
  const entry = {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description ?? "",
    version: manifest.version,
    author: manifest.author ?? "",
    color: manifest.color ?? "#6b7280",
    icon: manifest.icon ?? "puzzle",
    apiVersion: manifest.apiVersion ?? "^1",
    // Ce que le plugin demande à pouvoir faire (docs/19) : l'application l'affiche avant l'installation.
    permissions: manifest.permissions ?? [],
    // Dépendances entre plugins : le catalogue s'en sert pour installer ce qui manque (docs/13).
    dependencies: manifest.dependencies ?? {},
    optionalDependencies: manifest.optionalDependencies ?? {},
    provides: manifest.provides ?? {},
    settings: (manifest.settings ?? []).map((s) => ({ id: s.id, title: s.title ?? s.id })),
    miniApps: (manifest.miniApps ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description ?? "",
      icon: a.icon ?? "puzzle",
    })),
    // Nouveautés de cette version, tirées du CHANGELOG.md du plugin (texte brut, affiché dans la page Catalogue).
    ...(() => {
      const { notes, date } = notesDuPlugin(manifest.id, manifest.version, join(root, "plugins"));
      return { notes, notesDate: date };
    })(),
    size: paquet.length,
    url: `${RELEASE}/${encodeURIComponent(fichier)}`,
    published: new Date().toISOString(),
  };
  catalogue.plugins = [...catalogue.plugins.filter((p) => p.id !== entry.id), entry].sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(catalogueFile, `${JSON.stringify(catalogue, null, 2)}\n`);
  console.log(`Catalogue : ${catalogueFile} (${catalogue.plugins.length} plugin(s))`);
}
