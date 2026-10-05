// Rotation des clés de signature (docs/20 §3.5, procédure dans docs/14) : prépare et signe la liste des clés de publication
// valides (cles.json + cles.json.minisig). La signature se fait avec la CLÉ RACINE, hors ligne (variables
// TAURI_SIGNING_PRIVATE_KEY et TAURI_SIGNING_PRIVATE_KEY_PASSWORD), jamais depuis la chaîne de publication.
//
//   node scripts/cles-rotation.mjs generer <nom>                    → <nom>.key et <nom>.key.pub (npx tauri signer generate)
//   node scripts/cles-rotation.mjs ajouter <cles.json> <id> <cle.pub> [--depuis AAAA-MM-JJ] [--jusqua AAAA-MM-JJ]
//   node scripts/cles-rotation.mjs finir <cles.json> <id> <AAAA-MM-JJ>   → l'ancienne clé s'arrête à cette date
//   node scripts/cles-rotation.mjs retirer <cles.json> <id>         → la clé n'est plus de confiance (compromission)
//   node scripts/cles-rotation.mjs signer <cles.json>               → augmente la séquence puis signe
//
// Chaque commande modifie le fichier ; `signer` est l'étape qui compte : elle seule donne un fichier que les clients acceptent.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ecrireEtSigner } from "./catalogue-signe.mjs";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FORMAT = 1;

/** Date « AAAA-MM-JJ » (minuit UTC) en secondes depuis 1970, ou une erreur claire. */
export function dateEnSecondes(texte) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texte ?? "")) throw new Error(`Date attendue au format AAAA-MM-JJ : « ${texte} »`);
  const ms = Date.parse(`${texte}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`Date invalide : « ${texte} »`);
  return Math.floor(ms / 1000);
}

/** Une clé publique minisign encodée comme dans tauri.conf.json : du base64 d'un texte « untrusted comment: … ». */
export function cleValide(cle) {
  if (typeof cle !== "string") return false;
  try {
    const texte = Buffer.from(cle.trim(), "base64").toString("utf8");
    return texte.startsWith("untrusted comment:") && texte.trim().split("\n").length === 2;
  } catch {
    return false;
  }
}

export function listeVide() {
  return { format: FORMAT, sequence: 0, cles: [] };
}

export function normaliser(liste) {
  const cles = Array.isArray(liste?.cles) ? liste.cles : [];
  const sequence = Number.isSafeInteger(liste?.sequence) && liste.sequence >= 0 ? liste.sequence : 0;
  return { format: FORMAT, sequence, cles: cles.map((c) => ({ id: c.id, cle: c.cle, depuis: c.depuis, jusqua: c.jusqua ?? null })) };
}

export function ajouterCle(liste, { id, cle, depuis, jusqua = null }) {
  const l = normaliser(liste);
  if (!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(id ?? "")) throw new Error(`Identifiant de clé invalide : « ${id} » (minuscules, chiffres, . _ -)`);
  if (!cleValide(cle)) throw new Error("Clé publique illisible : attendu le contenu d'un fichier .pub de `tauri signer generate`.");
  if (l.cles.some((c) => c.id === id)) throw new Error(`La clé « ${id} » existe déjà dans la liste.`);
  if (l.cles.some((c) => c.cle.trim() === cle.trim())) throw new Error("Cette clé publique figure déjà dans la liste.");
  if (jusqua !== null && jusqua <= depuis) throw new Error("La fin de validité doit suivre le début.");
  l.cles.push({ id, cle: cle.trim(), depuis, jusqua });
  return l;
}

export function finirCle(liste, id, jusqua) {
  const l = normaliser(liste);
  const c = l.cles.find((x) => x.id === id);
  if (!c) throw new Error(`Clé « ${id} » absente de la liste.`);
  if (jusqua <= c.depuis) throw new Error("La fin de validité doit suivre le début.");
  c.jusqua = jusqua;
  return l;
}

export function retirerCle(liste, id) {
  const l = normaliser(liste);
  if (!l.cles.some((c) => c.id === id)) throw new Error(`Clé « ${id} » absente de la liste.`);
  l.cles = l.cles.filter((c) => c.id !== id);
  return l;
}

/** Séquence suivante, après contrôle : au moins une clé valide à `maintenant` (sinon les clients refuseraient la liste). */
export function preparerListe(liste, maintenant) {
  const l = normaliser(liste);
  const valides = l.cles.filter((c) => c.depuis <= maintenant && (c.jusqua === null || maintenant < c.jusqua));
  if (valides.length === 0) throw new Error("Aucune clé de la liste n'est valide aujourd'hui : les clients refuseraient cette liste.");
  return { ...l, sequence: l.sequence + 1 };
}

function lire(fichier) {
  return existsSync(fichier) ? JSON.parse(readFileSync(fichier, "utf8")) : listeVide();
}

function ecrire(fichier, liste) {
  writeFileSync(fichier, `${JSON.stringify(liste, null, 2)}\n`);
}

function option(args, nom) {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : undefined;
}

function principal(argv) {
  const [commande, fichier, ...reste] = argv;
  const maintenant = Math.floor(Date.now() / 1000);
  switch (commande) {
    case "generer": {
      const chemin = resolve(fichier ?? "");
      if (!fichier) throw new Error("Usage : generer <nom>");
      execSync(`npx tauri signer generate -w "${chemin}.key"`, { cwd: join(racine, "apps", "desktop"), stdio: "inherit" });
      console.log(`Clé créée : ${chemin}.key (PRIVÉE, hors du dépôt) et ${chemin}.key.pub (publique).`);
      return;
    }
    case "ajouter": {
      const [id, pub] = reste;
      const depuis = option(reste, "--depuis") ? dateEnSecondes(option(reste, "--depuis")) : maintenant;
      const jusqua = option(reste, "--jusqua") ? dateEnSecondes(option(reste, "--jusqua")) : null;
      ecrire(fichier, ajouterCle(lire(fichier), { id, cle: readFileSync(pub, "utf8"), depuis, jusqua }));
      break;
    }
    case "finir":
      ecrire(fichier, finirCle(lire(fichier), reste[0], dateEnSecondes(reste[1])));
      break;
    case "retirer":
      ecrire(fichier, retirerCle(lire(fichier), reste[0]));
      break;
    case "signer": {
      const suivante = preparerListe(lire(fichier), maintenant);
      ecrireEtSigner(fichier, suivante);
      console.log(`Liste signée : ${fichier} (séquence ${suivante.sequence}, ${suivante.cles.length} clé(s)).`);
      return;
    }
    default:
      throw new Error("Usage : generer | ajouter | finir | retirer | signer (voir l'en-tête du script)");
  }
  console.log(`${fichier} modifié (pas encore signé : lancez « signer »).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    principal(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
