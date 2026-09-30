// Vérifie les liens relatifs de la documentation : fichiers, images et ancres (« fichier.md#titre »).
// Les adresses http(s) ne sont pas suivies (pas de réseau). Lancé par la CI : un lien cassé fait échouer la vérification.
//
//   node scripts/verifier-liens.mjs            tous les fichiers .md du dépôt
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORES = new Set(["node_modules", "target", "dist", ".git", "paquets", ".claude"]);

/** Identifiant d'ancre d'un titre, comme GitHub : minuscules, espaces en tirets, ponctuation retirée, accents gardés. */
export function ancre(titre) {
  return titre
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

/** Ancres d'un document Markdown (les titres en doublon reçoivent -1, -2…). */
export function ancres(markdown) {
  const vues = new Map();
  const liste = new Set();
  let code = false;
  for (const ligne of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(ligne)) code = !code;
    if (code) continue;
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(ligne);
    if (!m) continue;
    const base = ancre(m[1]);
    const n = vues.get(base) ?? 0;
    vues.set(base, n + 1);
    liste.add(n === 0 ? base : `${base}-${n}`);
  }
  return liste;
}

/** Liens relatifs d'un texte : [texte](cible), ![image](cible) et src= / href= en HTML. Hors blocs de code. */
export function liens(markdown) {
  const trouves = [];
  let code = false;
  markdown.split(/\r?\n/).forEach((ligne, i) => {
    if (/^\s*```/.test(ligne)) code = !code;
    if (code) return;
    const sansCodeEnLigne = ligne.replace(/`[^`]*`/g, "");
    for (const m of sansCodeEnLigne.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) trouves.push({ cible: m[1], ligne: i + 1 });
    for (const m of sansCodeEnLigne.matchAll(/\b(?:src|href)="([^"]+)"/g)) trouves.push({ cible: m[1], ligne: i + 1 });
  });
  return trouves.filter(({ cible }) => !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(cible));
}

function* documents(dossier) {
  for (const nom of readdirSync(dossier).sort()) {
    if (IGNORES.has(nom)) continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) yield* documents(chemin);
    else if (nom.endsWith(".md")) yield chemin;
  }
}

/** Problèmes de liens dans `racine` : liste de phrases « fichier:ligne : … ». */
export function verifier(racine = RACINE) {
  const problemes = [];
  const cache = new Map();
  const ancresDe = (fichier) => {
    if (!cache.has(fichier)) cache.set(fichier, ancres(readFileSync(fichier, "utf8")));
    return cache.get(fichier);
  };
  for (const fichier of documents(racine)) {
    const texte = readFileSync(fichier, "utf8");
    for (const { cible, ligne } of liens(texte)) {
      const [chemin, ancreCible] = cible.split("#");
      const decode = decodeURIComponent(chemin);
      const absolu = decode === "" ? fichier : decode.startsWith("/") ? join(racine, decode) : resolve(dirname(fichier), decode);
      const nom = `${relative(racine, fichier).split("\\").join("/")}:${ligne}`;
      if (!existsSync(absolu)) {
        problemes.push(`${nom} : « ${cible} » : fichier introuvable.`);
        continue;
      }
      if (ancreCible && absolu.endsWith(".md") && !ancresDe(absolu).has(decodeURIComponent(ancreCible).toLowerCase())) {
        problemes.push(`${nom} : « ${cible} » : cette ancre n'existe pas dans ${relative(racine, absolu).split("\\").join("/")}.`);
      }
    }
  }
  return problemes;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problemes = verifier();
  if (problemes.length) {
    console.error(`${problemes.length} lien(s) cassé(s) :\n${problemes.map((p) => `  ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log("Tous les liens relatifs de la documentation sont valides.");
}
