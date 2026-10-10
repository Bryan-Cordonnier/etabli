// Applique au projet Android généré par `tauri android init` les deux correctifs du moteur (docs/26) :
//  1. le pont natif n'est ouvert qu'à l'origine de l'application, jamais aux cadres des plugins (MainActivity.kt) ;
//  2. les permissions d'alarme exacte, que le plugin de notifications ne déclare pas.
// Échoue si quoi que ce soit manque : mieux vaut ne pas produire d'APK que d'en produire un au pont ouvert.
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ici = dirname(fileURLToPath(import.meta.url));
const projet = join(ici, "..", "gen", "android");
const principal = join(projet, "app", "src", "main");
const echec = (message) => {
  console.error(`appliquer-correctifs : ${message}`);
  process.exit(1);
};
if (!existsSync(principal)) echec(`projet Android introuvable (${principal}) : lancez d'abord « tauri android init ».`);

// 1. MainActivity.kt : on garde le paquet que Tauri a tiré de l'identifiant de l'application.
const trouver = (dossier) => {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      const trouve = trouver(chemin);
      if (trouve) return trouve;
    } else if (nom === "MainActivity.kt") return chemin;
  }
  return null;
};
const cible = trouver(join(principal, "java"));
if (!cible) echec("MainActivity.kt introuvable dans le projet généré.");
const paquet = /^package\s+([\w.]+)/m.exec(readFileSync(cible, "utf8"))?.[1];
if (!paquet) echec("paquet de MainActivity.kt illisible.");
const source = readFileSync(join(ici, "MainActivity.kt"), "utf8").replace("__PACKAGE__", paquet);
writeFileSync(cible, source);

// 2. Permissions d'alarme exacte et d'installation des mises à jour (REQUEST_INSTALL_PACKAGES) (USE_EXACT_ALARM est accordée d'office hors Play Store ; SCHEDULE_EXACT_ALARM couvre Android 12 et 13).
const manifeste = join(principal, "AndroidManifest.xml");
let xml = readFileSync(manifeste, "utf8");
const internet = '<uses-permission android:name="android.permission.INTERNET" />';
if (!xml.includes(internet)) echec("ligne INTERNET introuvable dans le manifeste : le gabarit de Tauri a changé.");
for (const permission of ["SCHEDULE_EXACT_ALARM", "USE_EXACT_ALARM", "REQUEST_INSTALL_PACKAGES"]) {
  if (!xml.includes(`android.permission.${permission}`)) {
    xml = xml.replace(internet, `${internet}\n    <uses-permission android:name="android.permission.${permission}" />`);
  }
}
writeFileSync(manifeste, xml);
if ((xml.match(/EXACT_ALARM/g) ?? []).length < 2) echec("permissions d'alarme exacte non écrites.");

console.log(`Correctifs appliqués : ${cible.slice(projet.length + 1)} (paquet ${paquet}) et permissions d'alarme exacte.`);