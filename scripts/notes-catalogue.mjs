// Notes de version des plugins dans le catalogue. Chaque plugin a son journal (plugins/<id>/CHANGELOG.md) ;
// la section de la version publiée devient les « Nouveautés » que la page Catalogue d'Établi affiche, et le
// texte de la Release « catalogue » sur GitHub liste tous les plugins avec leurs nouveautés.
//
//   node scripts/notes-catalogue.mjs paquets/catalogue.json --ecrire     met à jour les notes dans le fichier
//   node scripts/notes-catalogue.mjs paquets/catalogue.json --markdown   texte de la Release « catalogue »
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dateDeVersion, enTexte, extraireSection } from "./notes-version.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Notes d'une version d'un plugin en texte brut, et sa date ; `notes` vaut "" si le journal n'a rien pour cette version. */
export function notesDuPlugin(id, version, dossierPlugins = join(RACINE, "plugins")) {
  const fichier = join(dossierPlugins, id, "CHANGELOG.md");
  if (!existsSync(fichier)) return { notes: "", date: null };
  const journal = readFileSync(fichier, "utf8");
  const section = extraireSection(journal, version);
  return { notes: section ? enTexte(section) : "", date: dateDeVersion(journal, version) };
}

/** Met à jour `notes` et `notesDate` de chaque entrée ; renvoie le nombre d'entrées modifiées. */
export function actualiserNotes(catalogue, dossierPlugins) {
  let modifiees = 0;
  for (const entree of catalogue.plugins ?? []) {
    const { notes, date } = notesDuPlugin(entree.id, entree.version, dossierPlugins);
    if ((entree.notes ?? "") !== notes || (entree.notesDate ?? null) !== date) modifiees++;
    entree.notes = notes;
    entree.notesDate = date;
  }
  return modifiees;
}

const francais = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

/** Texte (Markdown) de la Release « catalogue » : un tableau des plugins puis les nouveautés de chacun. */
export function corpsDeLaRelease(catalogue, depot = "Bryan-Cordonnier/etabli") {
  const plugins = [...(catalogue.plugins ?? [])].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const lignes = [
    "Paquets signés des plugins officiels et `catalogue.json`, lus par Établi pour installer et mettre à jour les plugins.",
    "**Ne pas supprimer cette Release.** Les notes ci-dessous sont mises à jour automatiquement à chaque publication d'un plugin.",
    "",
    "| Plugin | Version | A besoin de | Fonctionne mieux avec |",
    "| --- | --- | --- | --- |",
  ];
  for (const p of plugins) {
    const liste = (objet) => Object.keys(objet ?? {}).join(", ") || "—";
    lignes.push(`| ${p.name} | ${p.version} | ${liste(p.dependencies)} | ${liste(p.optionalDependencies)} |`);
  }
  lignes.push("");
  for (const p of plugins) {
    lignes.push(`## ${p.name} ${p.version}${p.notesDate ? ` (${francais(p.notesDate)})` : ""}`, "");
    lignes.push(p.notes ? p.notes.trim() : "_Pas de notes pour cette version._", "");
    lignes.push(`[Journal complet](https://github.com/${depot}/blob/main/plugins/${p.id}/CHANGELOG.md)`, "");
  }
  return `${lignes.join("\n").trim()}\n`;
}

// ——— Ligne de commande ———
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [fichier, option] = process.argv.slice(2);
  if (!fichier || !["--ecrire", "--markdown"].includes(option ?? "")) {
    console.error("Usage : node scripts/notes-catalogue.mjs <catalogue.json> --ecrire | --markdown");
    process.exit(1);
  }
  const catalogue = JSON.parse(readFileSync(fichier, "utf8"));
  const modifiees = actualiserNotes(catalogue);
  if (option === "--ecrire") {
    writeFileSync(fichier, `${JSON.stringify(catalogue, null, 2)}\n`);
    console.log(`${modifiees} entrée(s) mise(s) à jour dans ${fichier}`);
  } else {
    process.stdout.write(corpsDeLaRelease(catalogue, process.env.GITHUB_REPOSITORY ?? undefined));
  }
}
