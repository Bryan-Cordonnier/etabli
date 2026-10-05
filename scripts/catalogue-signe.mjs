// Catalogue signé (docs/20) : prépare catalogue.json au format 2 (numéro de séquence, date de fin, révocations) et le signe
// avec la clé des mises à jour. L'application refuse un catalogue dont la signature, la date ou la séquence ne vont pas.
//
//   node scripts/catalogue-signe.mjs paquets/catalogue.json      → réécrit le fichier et crée catalogue.json.minisig
//
// Appelée à chaque modification du catalogue (publication d'un plugin, nouveautés remises à jour, renouvellement mensuel) :
// toute modification du fichier exige une nouvelle signature, donc une nouvelle séquence.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Durée de validité d'un catalogue : 30 jours (renouvelé chaque mois et à chaque publication). */
export const VALIDITE_SECONDES = 30 * 24 * 3600;
export const FORMAT = 2;

/**
 * Catalogue prêt à signer : format 2, séquence augmentée de 1, nouvelle date de fin, liste de révocations (gardée si elle
 * existe). Les entrées des plugins ne sont pas touchées. `maintenant` en secondes depuis 1970.
 */
export function preparerCatalogue(catalogue, maintenant) {
  const sequence = Number.isSafeInteger(catalogue?.sequence) && catalogue.sequence >= 0 ? catalogue.sequence : 0;
  const revocations = Array.isArray(catalogue?.revocations) ? catalogue.revocations : [];
  const plugins = Array.isArray(catalogue?.plugins) ? catalogue.plugins : [];
  return {
    format: FORMAT,
    sequence: sequence + 1,
    expire: Math.floor(maintenant) + VALIDITE_SECONDES,
    plugins,
    revocations,
    // Arrêts programmés de contrats d'API (docs/19 §4) : gardés tels quels à chaque renouvellement, sinon le mois suivant les effacerait.
    contrats: verifierContrats(catalogue?.contrats),
  };
}

/** Contrôle la liste des arrêts de contrat (échoue franchement : une faute de frappe ne doit pas passer en silence). */
export function verifierContrats(contrats) {
  if (contrats === undefined || contrats === null) return [];
  if (!Array.isArray(contrats)) throw new Error("« contrats » doit être une liste.");
  const vus = new Set();
  for (const c of contrats) {
    if (!Number.isSafeInteger(c?.majeure) || c.majeure < 1) throw new Error("Arrêt de contrat : « majeure » doit être un entier ≥ 1.");
    if (vus.has(c.majeure)) throw new Error(`Arrêt de contrat en double pour la majeure ${c.majeure}.`);
    vus.add(c.majeure);
    for (const champ of ["avertir_des", "refuser_des"]) {
      if (c[champ] !== undefined && c[champ] !== null && (!Number.isSafeInteger(c[champ]) || c[champ] < 0)) {
        throw new Error(`Arrêt de contrat : « ${champ} » doit être une date en secondes depuis 1970.`);
      }
    }
    if (c.message !== undefined && typeof c.message !== "string") throw new Error("Arrêt de contrat : « message » doit être un texte.");
    if (Number.isSafeInteger(c.avertir_des) && Number.isSafeInteger(c.refuser_des) && c.avertir_des > c.refuser_des) {
      throw new Error("Arrêt de contrat : l'avertissement doit précéder le refus.");
    }
  }
  return contrats;
}

/** Écrit le catalogue (une seule fois : la signature porte sur ces octets exacts) puis le signe. */
export function ecrireEtSigner(fichier, catalogue, signerFichier = signerAvecTauri) {
  writeFileSync(fichier, `${JSON.stringify(catalogue, null, 2)}\n`);
  signerFichier(fichier);
  return `${fichier}.minisig`;
}

/** Signature minisign du fichier avec la clé des mises à jour (variables TAURI_SIGNING_PRIVATE_KEY et _PASSWORD). */
export function signerAvecTauri(fichier) {
  const chemin = resolve(fichier);
  execSync(`npx tauri signer sign "${chemin}"`, { cwd: join(racine, "apps", "desktop"), stdio: ["ignore", "ignore", "inherit"] });
  rmSync(`${chemin}.minisig`, { force: true });
  renameSync(`${chemin}.sig`, `${chemin}.minisig`);
}

/** Relit un catalogue existant (ancien format compris), le prépare et le signe. Renvoie la séquence écrite. */
export function renouveler(fichier, maintenant = Date.now() / 1000, signerFichier = signerAvecTauri) {
  const actuel = existsSync(fichier) ? JSON.parse(readFileSync(fichier, "utf8")) : {};
  const suivant = preparerCatalogue(actuel, maintenant);
  ecrireEtSigner(fichier, suivant, signerFichier);
  return suivant.sequence;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fichier = process.argv[2];
  if (!fichier) {
    console.error("Usage : node scripts/catalogue-signe.mjs <catalogue.json>");
    process.exit(1);
  }
  const sequence = renouveler(fichier);
  console.log(`Catalogue signé : ${fichier} (séquence ${sequence}, valable ${VALIDITE_SECONDES / 86400} jours)`);
}
