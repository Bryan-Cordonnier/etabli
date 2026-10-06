// Notes de version : extrait d'un journal des changements (CHANGELOG.md, format « Keep a Changelog »
// en français) la section d'une version, pour les Releases GitHub, `latest.json` (notification de mise
// à jour dans l'application).
//
//   node scripts/notes-version.mjs CHANGELOG.md 0.3.0            notes en Markdown (Release GitHub)
//   node scripts/notes-version.mjs CHANGELOG.md 0.3.0 --texte    notes en texte brut (latest.json)
//   node scripts/notes-version.mjs CHANGELOG.md 0.3.0 --release  notes de la Release GitHub (date et lien)
//   node scripts/notes-version.mjs CHANGELOG.md --versions       versions publiées, une par ligne
//
// Le journal contient une section « ## [Non publié] » puis « ## [0.3.0] — 2026-09-30 », la plus récente
// en premier. Sous chaque version : des rubriques « ### Ajouté », « ### Modifié », « ### Corrigé »…
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Titre de section : « ## [0.3.0] — 2026-09-30 » ou « ## [Non publié] ». Renvoie { version, date }. */
const TITRE = /^##\s+\[([^\]]+)\](?:\s+[—–-]\s+(\d{4}-\d{2}-\d{2}))?\s*$/;

/** Versions du journal (sans « Non publié »), de la plus récente à la plus ancienne. */
export function versions(journal) {
  return journal
    .split(/\r?\n/)
    .map((ligne) => TITRE.exec(ligne))
    .filter((m) => m && /^\d+\.\d+\.\d+$/.test(m[1]))
    .map((m) => m[1]);
}

/**
 * Corps de la section d'une version (sans son titre), ou `null` si elle n'existe pas ou est vide.
 * `version` peut être « Non publié ».
 */
export function extraireSection(journal, version) {
  const lignes = journal.split(/\r?\n/);
  const debut = lignes.findIndex((ligne) => TITRE.exec(ligne)?.[1] === version);
  if (debut < 0) return null;
  let fin = lignes.findIndex((ligne, i) => i > debut && /^##\s/.test(ligne));
  if (fin < 0) fin = lignes.length;
  // Les liens de comparaison en bas du fichier (« [0.3.0]: https://… ») ne font pas partie de la section.
  const corps = lignes
    .slice(debut + 1, fin)
    .filter((ligne) => !/^\[[^\]]+\]:\s+\S+/.test(ligne))
    .join("\n")
    .trim();
  return corps === "" ? null : corps;
}

/** Date de publication écrite dans le titre de la version (« 2026-09-30 »), ou `null`. */
export function dateDeVersion(journal, version) {
  for (const ligne of journal.split(/\r?\n/)) {
    const m = TITRE.exec(ligne);
    if (m?.[1] === version) return m[2] ?? null;
  }
  return null;
}

/** Markdown → texte brut lisible dans une boîte simple : titres en majuscules, plus de `**` ni de liens. */
export function enTexte(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((ligne) =>
      ligne
        .replace(/^###\s+(.*)$/, (_, titre) => `${titre.toUpperCase()}`)
        .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/^\*\s+/, "- "),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Notes complètes d'une Release GitHub : la section du journal, puis un lien vers le journal entier.
 * `depot` : « etable-project/etable ».
 */
export function notesDeRelease(journal, version, depot) {
  const section = extraireSection(journal, version);
  if (!section) return null;
  const date = dateDeVersion(journal, version);
  const entete = date ? `*Publiée le ${date.split("-").reverse().join("/")}.*\n\n` : "";
  return `${entete}${section}\n\n---\n[Journal complet des changements](https://github.com/${depot}/blob/main/CHANGELOG.md)`;
}

// ——— Ligne de commande ———
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [fichier, version, option] = process.argv.slice(2);
  if (!fichier) {
    console.error("Usage : node scripts/notes-version.mjs <CHANGELOG.md> <version> [--texte] | --versions");
    process.exit(1);
  }
  const journal = readFileSync(fichier, "utf8");
  if (version === "--versions") {
    console.log(versions(journal).join("\n"));
  } else {
    const section = extraireSection(journal, version ?? "");
    if (!section) {
      console.error(`Aucune note pour la version ${version} dans ${fichier} : ajoutez la section « ## [${version}] — AAAA-MM-JJ ».`);
      process.exit(1);
    }
    if (option === "--texte") console.log(enTexte(section));
    else if (option === "--release") console.log(notesDeRelease(journal, version, process.env.GITHUB_REPOSITORY ?? "etable-project/etable"));
    else console.log(section);
  }
}
