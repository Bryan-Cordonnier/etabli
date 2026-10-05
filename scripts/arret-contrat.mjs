// Arrêt programmé d'un contrat d'API de plugin (docs/19 §4, docs/20) : inscrit dans catalogue.json la date d'avertissement et la
// date de refus d'une version majeure du contrat (1 pour « ^1 »). Le catalogue étant signé, les dates se changent sans nouvelle
// version d'Établi. Ne signe pas : lancer ensuite `node scripts/catalogue-signe.mjs <catalogue.json>`.
//
//   node scripts/arret-contrat.mjs <catalogue.json> --majeure 1 --avertir AAAA-MM-JJ --refuser AAAA-MM-JJ [--message "…"]
//   node scripts/arret-contrat.mjs <catalogue.json> --majeure 1 --annuler
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifierContrats } from "./catalogue-signe.mjs";
import { dateEnSecondes } from "./cles-rotation.mjs";

/** Nouvelle liste d'arrêts : celui de la majeure est remplacé (ou retiré avec `annuler`), les autres sont gardés. */
export function definirArret(contrats, { majeure, avertir, refuser, message, annuler }) {
  const autres = verifierContrats(contrats).filter((c) => c.majeure !== majeure);
  if (annuler) return autres;
  if (avertir === undefined && refuser === undefined) throw new Error("Indiquez --avertir et/ou --refuser (ou --annuler).");
  const arret = { majeure };
  if (avertir !== undefined) arret.avertir_des = avertir;
  if (refuser !== undefined) arret.refuser_des = refuser;
  if (message) arret.message = message;
  return verifierContrats([...autres, arret].sort((a, b) => a.majeure - b.majeure));
}

function option(args, nom) {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : undefined;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [fichier, ...args] = process.argv.slice(2);
    if (!fichier || !existsSync(fichier)) throw new Error("Usage : node scripts/arret-contrat.mjs <catalogue.json> --majeure N --avertir AAAA-MM-JJ --refuser AAAA-MM-JJ");
    const majeure = Number(option(args, "--majeure"));
    if (!Number.isSafeInteger(majeure) || majeure < 1) throw new Error("--majeure N (entier ≥ 1) est obligatoire.");
    const catalogue = JSON.parse(readFileSync(fichier, "utf8"));
    catalogue.contrats = definirArret(catalogue.contrats, {
      majeure,
      avertir: option(args, "--avertir") ? dateEnSecondes(option(args, "--avertir")) : undefined,
      refuser: option(args, "--refuser") ? dateEnSecondes(option(args, "--refuser")) : undefined,
      message: option(args, "--message"),
      annuler: args.includes("--annuler"),
    });
    writeFileSync(fichier, `${JSON.stringify(catalogue, null, 2)}\n`);
    console.log(`${fichier} modifié (pas encore signé : lancez « node scripts/catalogue-signe.mjs ${fichier} »).`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
