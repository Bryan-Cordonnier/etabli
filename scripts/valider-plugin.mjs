// Vérifie un plugin avant de le proposer (docs/07 et CONTRIBUTING.md) : manifeste, arborescence, journal
// des changements, tests, et contenu (appels sortants, fichiers étranges, adresses externes).
//
//   node scripts/valider-plugin.mjs agenda           un plugin du dossier plugins/
//   node scripts/valider-plugin.mjs --tous          tous les plugins (après npm run build:plugins)
//   node scripts/valider-plugin.mjs agenda --sans-dist   sans regarder le plugin compilé
//
// Le vrai rempart reste le cadre isolé et sa politique de sécurité (aucun réseau, aucun disque) : ces
// vérifications servent à repérer tôt les erreurs et les choses suspectes, elles n'y suppléent pas.
// Code de sortie 1 s'il y a au moins une erreur ; les avertissements ne bloquent pas.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { extraireSection } from "./notes-version.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const COULEUR = /^#[0-9a-fA-F]{6}$/;
/** Chaque condition d'une plage de versions : « ^1 », « ~1.2 », « >=1.2 », « 1.x », « * », « 1.2.3 ». */
const CONDITION = /^(\*|x|[\^~]?\d+(\.\d+){0,2}|\d+(\.\d+)?\.[x*]|(>=|<=|>|<|=)\s*\d+(\.\d+){0,2})$/;

/** Extensions autorisées dans le plugin compilé. */
const EXTENSIONS_DIST = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff2", ".woff", ".wasm", ".txt", ".map", ".md"]);
/** Une seule page de plugin ne doit pas peser le poids d'une application. */
const TAILLE_MAX_DIST = 15 * 1024 * 1024;

/**
 * Motifs qui n'ont rien à faire dans les sources d'un plugin. Chacun est une erreur : le cadre isolé les
 * bloquerait de toute façon, autant l'écrire clairement plutôt que de livrer du code qui ne marchera pas.
 */
const INTERDITS = [
  [/\bfetch\s*\(/, "appel réseau : fetch()"],
  [/\bXMLHttpRequest\b/, "appel réseau : XMLHttpRequest"],
  [/\bWebSocket\b/, "connexion réseau : WebSocket"],
  [/\bEventSource\b/, "connexion réseau : EventSource"],
  [/\bsendBeacon\b/, "envoi réseau : navigator.sendBeacon"],
  [/\beval\s*\(/, "exécution de texte comme du code : eval()"],
  [/\bnew\s+Function\s*\(/, "exécution de texte comme du code : new Function()"],
  [/\bimport\s*\(\s*["'`]https?:/, "chargement de code distant : import(\"http…\")"],
  [/\bdocument\.cookie\b/, "cookies"],
  [/\bwindow\.(parent|top|opener)\b/, "accès à la fenêtre du moteur : window.parent, top ou opener"],
  [/\b(parent|top)\.postMessage\b/, "message direct au moteur : le SDK sert à cela"],
  [/\bMiniAppDocument\b|\bdocument\??\.(update|setTitle|setSummary)\s*\(/, "calcul enregistré par le moteur : les documents n'existent plus (contrat 3), utilisez PluginSettings ou etabli.settings"],
];

/**
 * Appels du SDK qui exigent une permission (docs/19). Sert à vérifier qu'un plugin de contrat ^2 déclare ce qu'il utilise ;
 * le moteur refuse de toute façon le message à l'exécution.
 */
const APPELS_PERMISSION = [
  [/\bclipboard\s*\??\.\s*copy\b|\boncopy\b|\bdoc\??\.copy\b/, "presse-papiers"],
  [/\bsaveFile\b/, "fichiers"],
  [/\bsendTo\b|\betabli\??\.send\s*\(/, "envoi"],
  [/\bopenSettings\b/, "reglages"],
  [/\breminders\s*\??\.\s*(set|clear|state)\b/, "notifications"],
];

/** Permissions connues : celles de apps/desktop/src/lib/plugins/permissions.ts (une seule source). */
export function permissionsConnues(racine = RACINE) {
  const source = readFileSync(join(racine, "apps", "desktop", "src", "lib", "plugins", "permissions.ts"), "utf8");
  const bloc = /export const PERMISSIONS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(source)?.[1] ?? "";
  return new Set([...bloc.matchAll(/\{\s*id:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]));
}

/** Permission d'appel entre plugins ; même forme que `permissionAppel` dans permissions.ts (docs/19 §6, docs/24 A.1.2). */
const PERMISSION_APPEL = /^appelle:([a-z0-9][a-z0-9-]{0,63}):(lecture|ecriture)$/;
/** Nom de fonction de service ; même forme que `NOM_FONCTION` dans garde.ts. */
const NOM_FONCTION = /^[a-z][A-Za-z0-9]{0,31}(\.[a-z][A-Za-z0-9]{0,31}){0,3}$/;
const MAX_FONCTIONS = 100;

/** Adresses qui apparaissent légitimement (espaces de noms XML, documentation de Svelte, licences). */
const ADRESSES_TOLEREES = [
  /^https?:\/\/(www\.)?w3\.org\//,
  /^https?:\/\/svelte\.dev\//,
  /^https?:\/\/github\.com\/sveltejs\//,
  /^https?:\/\/(www\.)?apache\.org\/licenses\//,
  /^https?:\/\/opensource\.org\//,
  /^https?:\/\/(www\.)?ietf\.org\//,
  /^https?:\/\/schema\.org\//,
  /^https?:\/\/plugins\.localhost\//,
];

function* fichiers(dossier, ignorer = new Set()) {
  if (!existsSync(dossier)) return;
  for (const nom of readdirSync(dossier).sort()) {
    if (ignorer.has(nom)) continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) yield* fichiers(chemin, ignorer);
    else yield chemin;
  }
}

/** Noms d'icônes acceptés : les clés de ICONS dans apps/desktop/src/lib/icons.ts. */
export function iconesConnues(racine = RACINE) {
  const source = readFileSync(join(racine, "apps", "desktop", "src", "lib", "icons.ts"), "utf8");
  const bloc = /export const ICONS = \{([\s\S]*?)\n\};/.exec(source)?.[1] ?? "";
  const noms = new Set([...bloc.matchAll(/^\s+"?([a-z0-9-]+)"?\s*:/gm)].map((m) => m[1]));
  // Les icônes propres à la distribution (distribution.json, désigné par ETABLE_DISTRIBUTION) sont acceptées aussi.
  const distribution = process.env.ETABLE_DISTRIBUTION;
  if (distribution && existsSync(distribution)) {
    try {
      const icones = JSON.parse(readFileSync(distribution, "utf8").replace(/^﻿/, "")).icons;
      for (const nom of Object.keys(icones && typeof icones === "object" ? icones : {})) noms.add(nom);
    } catch {
      // un distribution.json illisible est signalé ailleurs ; ici, on garde la liste d'Établi
    }
  }
  return noms;
}

function plageValide(plage) {
  if (typeof plage !== "string" || plage.trim() === "") return false;
  return plage.trim().split(/\s+/).every((condition) => CONDITION.test(condition));
}

/** Retire les commentaires : on ne juge pas une phrase qui explique pourquoi on n'utilise pas fetch(). */
function sansCommentaires(texte, extension) {
  let sortie = texte;
  if ([".ts", ".js", ".mjs", ".svelte", ".css"].includes(extension)) sortie = sortie.replace(/\/\*[\s\S]*?\*\//g, " ");
  if ([".ts", ".js", ".mjs", ".svelte"].includes(extension)) sortie = sortie.replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  if ([".html", ".svelte"].includes(extension)) sortie = sortie.replace(/<!--[\s\S]*?-->/g, " ");
  return sortie;
}

/**
 * Valide un plugin. `dossier` : plugins/<id>. Renvoie { erreurs, avertissements } (listes de phrases).
 * Options : `dist` (défaut vrai) regarde aussi le plugin compilé ; `racine` du dépôt.
 */
export function validerPlugin(dossier, { dist = true, racine = RACINE } = {}) {
  const erreurs = [];
  const avertissements = [];
  const id = basename(dossier);
  const erreur = (texte) => erreurs.push(texte);
  const avertir = (texte) => avertissements.push(texte);

  // ——— Manifeste ———
  const fichierManifeste = join(dossier, "public", "manifest.json");
  if (!existsSync(fichierManifeste)) {
    erreur("public/manifest.json est absent (le manifeste se met dans public/, jamais à la racine du plugin).");
    return { erreurs, avertissements };
  }
  if (existsSync(join(dossier, "manifest.json"))) erreur("manifest.json à la racine du plugin : il doit être seulement dans public/.");

  let m;
  try {
    m = JSON.parse(readFileSync(fichierManifeste, "utf8"));
  } catch (err) {
    erreur(`public/manifest.json n'est pas un JSON valide : ${err.message}`);
    return { erreurs, avertissements };
  }

  if (typeof m.id !== "string" || !ID.test(m.id)) erreur("« id » absent ou invalide (minuscules, chiffres et tirets).");
  else if (m.id !== id) erreur(`« id » vaut « ${m.id} » mais le dossier s'appelle « ${id} » : les deux doivent être identiques.`);
  if (typeof m.name !== "string" || m.name.trim() === "") erreur("« name » (nom affiché) est absent.");
  if (typeof m.description !== "string" || m.description.trim() === "") erreur("« description » est absente : elle s'affiche dans la page des plugins.");
  else if (m.description.length > 300) avertir("« description » dépasse 300 caractères : une ou deux phrases suffisent.");
  if (typeof m.version !== "string" || !SEMVER.test(m.version)) erreur("« version » doit avoir la forme 1.2.3.");
  if (typeof m.apiVersion !== "string" || !plageValide(m.apiVersion)) erreur("« apiVersion » est absente ou illisible (par exemple « ^1 »).");
  if (typeof m.author !== "string" || m.author.trim() === "") avertir("« author » est absent : indiquez qui est l'auteur.");
  if (typeof m.color !== "string" || !COULEUR.test(m.color)) erreur("« color » doit être une couleur du type « #7c5cfa ».");
  const icones = iconesConnues(racine);
  if (typeof m.icon !== "string" || !icones.has(m.icon)) {
    erreur(`« icon » (${JSON.stringify(m.icon)}) n'est pas dans la liste de apps/desktop/src/lib/icons.ts.`);
  }
  if (m.emoji !== undefined) avertir("« emoji » n'existe plus : une icône et une couleur suffisent, retirez ce champ.");
  const connues = permissionsConnues(racine);
  const strict = typeof m.apiVersion === "string" && /\d+/.test(m.apiVersion) && Number(/\d+/.exec(m.apiVersion)[0]) >= 2;
  const declarees = new Set();
  if (!Array.isArray(m.permissions)) erreur("« permissions » doit être une liste (vide : `[]`).");
  else {
    for (const permission of m.permissions) {
      if (typeof permission === "string" && PERMISSION_APPEL.test(permission)) {
        if (declarees.has(permission)) erreur(`« permissions » : « ${permission} » est écrite deux fois.`);
        else declarees.add(permission);
      } else if (typeof permission !== "string" || !connues.has(permission)) {
        erreur(`« permissions » : « ${String(permission)} » n'existe pas (permissions connues : ${[...connues].join(", ")}, et appelle:<service>:<lecture|ecriture>).`);
      } else if (declarees.has(permission)) erreur(`« permissions » : « ${permission} » est écrite deux fois.`);
      else declarees.add(permission);
    }
  }
  const majeureApi = typeof m.apiVersion === "string" && /\d+/.test(m.apiVersion) ? Number(/\d+/.exec(m.apiVersion)[0]) : 0;
  if (majeureApi < 3) erreur("« apiVersion » doit demander le contrat « ^3 » : un plugin déclare ses pages (docs/28), il n'y a pas de mode de compatibilité.");

  // Apps (pages HTML isolées) et pages (ce que la colonne de gauche liste)
  if (m.miniApps !== undefined) erreur("« miniApps » n'existe plus (contrat 3) : déclarez « apps » (les pages HTML) et « pages » (ce que la colonne liste).");
  const apps = Array.isArray(m.apps) ? m.apps : null;
  if (!apps) erreur("« apps » doit être une liste (vide `[]` pour un plugin sans interface).");
  const pages = [];
  const idsApps = new Set();
  for (const app of apps ?? []) {
    const nom = app?.id ?? "?";
    if (typeof app?.id !== "string" || !ID.test(app.id)) erreur(`app « ${nom} » : « id » absent ou invalide.`);
    else if (idsApps.has(app.id)) erreur(`app « ${nom} » : identifiant utilisé deux fois.`);
    else idsApps.add(app.id);
    if (typeof app?.entry !== "string" || app.entry.startsWith("/") || app.entry.includes("..") || app.entry.includes("\\")) erreur(`app « ${nom} » : « entry » absent ou invalide (chemin relatif au plugin, sans « .. »).`);
    else pages.push(["app " + nom, app.entry]);
    if (app?.dataVersion !== undefined || app?.plannedFor !== undefined || app?.description !== undefined || app?.icon !== undefined) {
      avertir(`app « ${nom} » : « dataVersion », « plannedFor », « description » et « icon » n'existent plus dans une app (l'icône et le titre sont ceux de la page).`);
    }
  }
  const listePages = Array.isArray(m.pages) ? m.pages : null;
  if (!listePages) erreur("« pages » doit être une liste (vide `[]` pour un plugin qui n'offre qu'un service).");
  const idsPages = new Set();
  for (const page of listePages ?? []) {
    const nom = page?.id ?? "?";
    if (typeof page?.id !== "string" || !ID.test(page.id)) erreur(`page « ${nom} » : « id » absent ou invalide.`);
    else if (idsPages.has(page.id)) erreur(`page « ${nom} » : identifiant utilisé deux fois.`);
    else idsPages.add(page.id);
    if (typeof page?.title !== "string" || page.title.trim() === "") erreur(`page « ${nom} » : « title » absent.`);
    if (typeof page?.icon !== "string" || !icones.has(page.icon)) erreur(`page « ${nom} » : « icon » absente ou hors liste (apps/desktop/src/lib/icons.ts).`);
    if (page?.category !== undefined && (typeof page.category !== "string" || page.category.length > 40)) erreur(`page « ${nom} » : « category » doit être un texte de 40 caractères au plus (« Argent »).`);
    const disposition = page?.layout;
    if (disposition?.type !== "app") erreur(`page « ${nom} » : « layout » doit valoir { "type": "app", "app": "<id d'une app>" } (la seule disposition pour l'instant).`);
    else if (typeof disposition.app !== "string" || !idsApps.has(disposition.app)) erreur(`page « ${nom} » : « layout.app » (${JSON.stringify(disposition.app)}) n'est pas une app déclarée dans « apps ».`);
  }

  // Widgets déclarés : de petites apps que l'accueil affiche dans sa grille
  if (m.widgets !== undefined) {
    if (!Array.isArray(m.widgets)) erreur("« widgets » doit être une liste.");
    else {
      const vus = new Set();
      for (const w of m.widgets) {
        const nom = w?.id ?? "?";
        if (typeof w?.id !== "string" || !ID.test(w.id)) erreur(`widget « ${nom} » : « id » absent ou invalide.`);
        else if (vus.has(w.id)) erreur(`widget « ${nom} » : identifiant utilisé deux fois.`);
        else vus.add(w.id);
        if (typeof w?.title !== "string" || w.title.trim() === "") erreur(`widget « ${nom} » : « title » absent.`);
        if (typeof w?.icon !== "string" || !icones.has(w.icon)) erreur(`widget « ${nom} » : « icon » absente ou hors liste (apps/desktop/src/lib/icons.ts).`);
        if (typeof w?.app !== "string" || !idsApps.has(w.app)) erreur(`widget « ${nom} » : « app » (${JSON.stringify(w?.app)}) n'est pas une app déclarée dans « apps ».`);
        const tailles = Array.isArray(w?.sizes) ? w.sizes : [];
        if (tailles.length === 0 || tailles.some((t) => typeof t !== "string" || !/^[1-4]x[1-4]$/.test(t))) erreur(`widget « ${nom} » : « sizes » doit lister des tailles « LxH » de 1 à 4 (« 2x1 »).`);
        else if (w.default !== undefined && !tailles.includes(w.default)) erreur(`widget « ${nom} » : « default » doit être l'une des « sizes ».`);
      }
    }
  }

  // Paramètres déclarés : le moteur en fait un onglet dans Paramètres
  const TYPES_PARAMETRE = ["number", "text", "boolean", "time", "select"];
  if (m.parameters !== undefined) {
    if (!Array.isArray(m.parameters)) erreur("« parameters » doit être une liste de paramètres.");
    else {
      const vus = new Set();
      if (m.parameters.length > 60) erreur("« parameters » : 60 paramètres au plus.");
      for (const p of m.parameters) {
        const nom = p?.id ?? "?";
        if (typeof p?.id !== "string" || !/^[a-z][A-Za-z0-9]{0,31}$/.test(p.id)) erreur(`parameters : « ${nom} » : « id » absent ou invalide (une lettre minuscule puis lettres et chiffres, 32 caractères au plus).`);
        else if (vus.has(p.id)) erreur(`parameters : « ${nom} » est déclaré deux fois.`);
        else vus.add(p.id);
        if (typeof p?.label !== "string" || p.label.trim() === "") erreur(`parameters : « ${nom} » n'a pas de « label ».`);
        if (!TYPES_PARAMETRE.includes(p?.type)) erreur(`parameters : « ${nom} » : « type » doit être ${TYPES_PARAMETRE.join(", ")}.`);
        else if (p.type === "number") {
          if (typeof p.default !== "number" || !Number.isFinite(p.default)) erreur(`parameters : « ${nom} » : « default » doit être un nombre.`);
          else if ((typeof p.min === "number" && p.default < p.min) || (typeof p.max === "number" && p.default > p.max)) erreur(`parameters : « ${nom} » : « default » sort des bornes « min » et « max ».`);
        } else if (p.type === "boolean" && typeof p.default !== "boolean") erreur(`parameters : « ${nom} » : « default » doit être vrai ou faux.`);
        else if (p.type === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.default ?? "")) erreur(`parameters : « ${nom} » : « default » doit être une heure « 08:30 ».`);
        else if (p.type === "text" && typeof p.default !== "string") erreur(`parameters : « ${nom} » : « default » doit être un texte.`);
        else if (p.type === "select") {
          const valeurs = Array.isArray(p.options) ? p.options.map((o) => o?.value) : [];
          if (valeurs.length === 0 || valeurs.some((v) => typeof v !== "string" || v === "")) erreur(`parameters : « ${nom} » : « options » doit être une liste non vide de { "value", "label" }.`);
          else if (!valeurs.includes(p.default)) erreur(`parameters : « ${nom} » : « default » n'est pas l'une des options.`);
        }
      }
    }
  }
  // Dépendances, services, réglages
  for (const champ of ["dependencies", "optionalDependencies"]) {
    const valeur = m[champ];
    if (valeur === undefined) continue;
    if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
      erreur(`« ${champ} » doit être un objet « identifiant du plugin : plage de versions ».`);
      continue;
    }
    for (const [cle, plage] of Object.entries(valeur)) {
      if (!ID.test(cle)) erreur(`${champ} : « ${cle} » n'est pas un identifiant de plugin valide.`);
      if (cle === m.id) erreur(`${champ} : un plugin ne peut pas dépendre de lui-même.`);
      if (!plageValide(plage)) erreur(`${champ} : la plage « ${plage} » de « ${cle} » est illisible (par exemple « ^1 »).`);
    }
  }
  for (const cle of Object.keys(m.dependencies ?? {})) {
    if (m.optionalDependencies && cle in m.optionalDependencies) erreur(`« ${cle} » est à la fois dans dependencies et optionalDependencies.`);
  }
  if (m.provides !== undefined) {
    if (typeof m.provides !== "object" || m.provides === null || Array.isArray(m.provides)) erreur("« provides » doit être un objet « nom du service : version du contrat ».");
    else {
      for (const [nom, version] of Object.entries(m.provides)) {
        if (!ID.test(nom)) erreur(`provides : « ${nom} » n'est pas un nom de service valide.`);
        if (`service.${m.id}.${nom}`.length > 64) erreur(`provides : le nom « ${nom} » est trop long (le fichier de données porte le nom du plugin et du service, 64 caractères au plus).`);
        if (typeof version !== "string" || !/^\d+$/.test(version)) erreur(`provides : la version du contrat « ${nom} » doit être un entier écrit entre guillemets (« 1 »).`);
      }
    }
  }
  // Appels entre plugins (docs/24, A.1.2) : plage de contrat côté appelant, fonctions et point d'entrée côté fournisseur
  const appels = [...declarees].map((p) => PERMISSION_APPEL.exec(p)).filter(Boolean);
  if (m.services !== undefined) {
    if (typeof m.services !== "object" || m.services === null || Array.isArray(m.services)) erreur("« services » doit être un objet « nom du service : plage de version du contrat » (par exemple « finances »: « ^1 »).");
    else {
      for (const [nom, plage] of Object.entries(m.services)) {
        if (!ID.test(nom)) erreur(`services : « ${nom} » n'est pas un nom de service valide.`);
        if (!plageValide(plage)) erreur(`services : la plage « ${plage} » de « ${nom} » est illisible (par exemple « ^1 »).`);
      }
    }
  }
  const dependances = new Set([...Object.keys(m.dependencies ?? {}), ...Object.keys(m.optionalDependencies ?? {})]);
  for (const [, service] of appels) {
    if (!strict) erreur(`« permissions » : « appelle:${service}:… » n'a d'effet que pour un plugin de contrat ^2 (« apiVersion »).`);
    if (typeof m.services?.[service] !== "string") erreur(`« services » doit donner la plage de contrat de « ${service} » (par exemple « ${service} »: « ^1 »), exigée par la permission d'appel.`);
  }
  if (appels.length > 0 && dependances.size === 0) {
    erreur("une permission « appelle:… » demande de déclarer le plugin fournisseur dans « dependencies » ou « optionalDependencies » : sinon le moteur refuse l'appel.");
  }
  let nbFonctions = 0;
  if (m.functions !== undefined) {
    if (typeof m.functions !== "object" || m.functions === null || Array.isArray(m.functions)) erreur("« functions » doit être un objet « nom du service : { fonction : { acces } } ».");
    else {
      for (const [service, fonctions] of Object.entries(m.functions)) {
        if (typeof m.provides !== "object" || m.provides === null || !Object.hasOwn(m.provides, service)) erreur(`functions : le service « ${service} » doit d'abord figurer dans « provides ».`);
        if (typeof fonctions !== "object" || fonctions === null || Array.isArray(fonctions)) {
          erreur(`functions : « ${service} » doit être un objet « nom de fonction : { "acces": "lecture" | "ecriture" } ».`);
          continue;
        }
        for (const [nom, definition] of Object.entries(fonctions)) {
          nbFonctions++;
          if (!NOM_FONCTION.test(nom)) erreur(`functions : « ${nom} » n'est pas un nom de fonction valide (lettres et chiffres, séparés par des points : « ecritures.ajouter »).`);
          if (!["lecture", "ecriture"].includes(definition?.acces)) erreur(`functions : « ${service}.${nom} » doit déclarer "acces" : "lecture" ou "ecriture".`);
        }
      }
      if (nbFonctions > MAX_FONCTIONS) erreur(`functions : ${nbFonctions} fonctions déclarées, ${MAX_FONCTIONS} au plus.`);
    }
  }
  if (m.serviceEntry !== undefined) {
    if (typeof m.serviceEntry !== "string" || m.serviceEntry.startsWith("/") || m.serviceEntry.includes("..") || m.serviceEntry.includes("\\")) erreur("« serviceEntry » invalide (chemin relatif au plugin, sans « .. », par exemple « service/index.html »).");
    else {
      pages.push(["page de service", m.serviceEntry]);
      if (nbFonctions === 0) avertir("« serviceEntry » est déclaré mais « functions » est vide : la page ne recevra jamais d'appel.");
    }
  } else if (nbFonctions > 0) erreur("« functions » demande un « serviceEntry » : la page sans interface qui répond aux appels (par exemple « service/index.html »).");

  if (m.settings !== undefined) {
    if (!Array.isArray(m.settings)) erreur("« settings » doit être une liste de pages de réglages.");
    else {
      const vus = new Set();
      for (const page of m.settings) {
        if (page?.id === "parametres") erreur("settings : « parametres » est réservé (c'est le nom de l'onglet que le moteur fait pour les paramètres déclarés).");
        else if (typeof page?.id !== "string" || !ID.test(page.id)) erreur("settings : une page a un « id » absent ou invalide.");
        else if (vus.has(page.id)) erreur(`settings : la page « ${page.id} » est déclarée deux fois.`);
        else vus.add(page.id);
        if (typeof page?.title !== "string" || page.title.trim() === "") erreur(`settings : la page « ${page?.id} » n'a pas de « title ».`);
        if (typeof page?.entry !== "string" || page.entry.startsWith("/") || page.entry.includes("..")) erreur(`settings : la page « ${page?.id} » a un « entry » invalide.`);
        else pages.push(["page de réglages " + page.id, page.entry]);
      }
    }
  }

  // ——— package.json et versions ———
  const fichierPackage = join(dossier, "package.json");
  if (!existsSync(fichierPackage)) erreur("package.json est absent.");
  else {
    try {
      const p = JSON.parse(readFileSync(fichierPackage, "utf8"));
      if (p.name !== `@etabli/plugin-${id}`) erreur(`package.json : « name » doit valoir « @etabli/plugin-${id} » (il vaut « ${p.name} »).`);
      if (p.version !== m.version) erreur(`package.json (${p.version}) et le manifeste (${m.version}) n'ont pas la même version.`);
      if (!p.scripts?.build) erreur("package.json : il manque le script « build ».");
    } catch (err) {
      erreur(`package.json illisible : ${err.message}`);
    }
  }

  // ——— Journal des changements ———
  const fichierJournal = join(dossier, "CHANGELOG.md");
  if (!existsSync(fichierJournal)) erreur("CHANGELOG.md est absent : chaque plugin garde le journal de ses versions (voir CONTRIBUTING.md).");
  else if (typeof m.version === "string" && !extraireSection(readFileSync(fichierJournal, "utf8"), m.version)) {
    erreur(`CHANGELOG.md n'a pas de section « ## [${m.version}] — AAAA-MM-JJ » avec du contenu.`);
  }

  // ——— Tests ———
  const tests = [...fichiers(join(dossier, "src"))].filter((f) => /\.test\.[cm]?[jt]s$/.test(f));
  if (tests.length === 0 && (apps?.length ?? 0) > 0) avertir("aucun test (src/*.test.ts) : chaque formule doit avoir au moins trois cas vérifiés.");

  // ——— Sources : appels interdits ———
  for (const sousDossier of ["apps", "src", "reglages", "service"]) {
    for (const f of fichiers(join(dossier, sousDossier), new Set(["node_modules", "dist"]))) {
      const extension = extname(f);
      if (![".ts", ".js", ".mjs", ".svelte", ".html"].includes(extension) || /\.test\.[cm]?[jt]s$/.test(f)) continue;
      const texte = sansCommentaires(readFileSync(f, "utf8"), extension);
      const chemin = relative(dossier, f).split("\\").join("/");
      for (const [motif, raison] of INTERDITS) {
        if (motif.test(texte)) erreur(`${chemin} : ${raison} (interdit : un plugin n'a pas accès au réseau ni au moteur autrement que par le SDK).`);
      }
      if (strict) {
        for (const [motif, permission] of APPELS_PERMISSION) {
          if (motif.test(texte) && !declarees.has(permission)) {
            erreur(`${chemin} : utilise une fonction qui exige la permission « ${permission} », absente de « permissions » du manifeste.`);
          }
        }
      }
      if (strict && /\bservices\??\.call\s*\(/.test(texte) && appels.length === 0) {
        erreur(`${chemin} : appelle la fonction d'un autre plugin (services.call) sans permission « appelle:<service>:<acces> » dans « permissions ».`);
      }
      if (/\bservices\??\.handle\s*\(/.test(texte) && (nbFonctions === 0 || typeof m.serviceEntry !== "string")) {
        erreur(`${chemin} : répond à des appels (services.handle) mais le manifeste ne déclare ni « functions » ni « serviceEntry ».`);
      }
      for (const adresse of texte.match(/https?:\/\/[^\s"'`)<>]+/g) ?? []) {
        if (!ADRESSES_TOLEREES.some((ok) => ok.test(adresse))) avertir(`${chemin} : adresse externe ${adresse} (elle ne sera pas chargée : pas de réseau).`);
      }
    }
  }

  // ——— Plugin compilé ———
  const sortie = join(dossier, "dist");
  if (dist) {
    if (!existsSync(join(sortie, "manifest.json"))) {
      avertir("dist/ absent : lancez « npm run build » pour vérifier aussi le plugin compilé.");
    } else {
      let total = 0;
      for (const f of fichiers(sortie)) {
        total += statSync(f).size;
        const extension = extname(f).toLowerCase();
        const chemin = relative(sortie, f).split("\\").join("/");
        if (!EXTENSIONS_DIST.has(extension)) erreur(`dist/${chemin} : type de fichier non autorisé (${extension || "sans extension"}).`);
        if (extension === ".html") {
          const html = sansCommentaires(readFileSync(f, "utf8"), ".html");
          if (/<(script|link|img|iframe|source)\b[^>]*\b(src|href)\s*=\s*["']?(https?:)?\/\//i.test(html)) {
            erreur(`dist/${chemin} : charge une ressource externe (<script src="http…">, <link href="//…">…) : tout doit être dans le plugin.`);
          }
        }
      }
      if (total > TAILLE_MAX_DIST) erreur(`le plugin compilé pèse ${(total / 1024 / 1024).toFixed(1)} Mo (limite ${TAILLE_MAX_DIST / 1024 / 1024} Mo).`);
      for (const [quoi, entree] of pages) {
        if (!existsSync(join(sortie, entree))) erreur(`${quoi} : la page « ${entree} » n'existe pas dans dist/ (vérifiez vite.config.ts).`);
      }
    }
  }

  return { erreurs, avertissements };
}

// ——— Ligne de commande ———
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const dist = !args.includes("--sans-dist");
  const dossierPlugins = join(RACINE, "plugins");
  const cibles = args.includes("--tous")
    ? readdirSync(dossierPlugins).filter((n) => existsSync(join(dossierPlugins, n, "package.json"))).sort()
    : args.filter((a) => !a.startsWith("--"));
  if (cibles.length === 0) {
    console.error("Usage : node scripts/valider-plugin.mjs <id> [--sans-dist]   ou   --tous");
    process.exit(1);
  }
  let echecs = 0;
  for (const cible of cibles) {
    const dossier = join(dossierPlugins, cible);
    if (!existsSync(dossier)) {
      console.error(`✖ ${cible} : dossier plugins/${cible} introuvable.`);
      echecs++;
      continue;
    }
    const { erreurs, avertissements } = validerPlugin(dossier, { dist });
    console.log(`${erreurs.length ? "✖" : "✔"} ${cible}${erreurs.length ? "" : " : rien à signaler"}${!erreurs.length && avertissements.length ? ` (${avertissements.length} avertissement${avertissements.length > 1 ? "s" : ""})` : ""}`);
    for (const e of erreurs) console.log(`    erreur : ${e}`);
    for (const a of avertissements) console.log(`    avertissement : ${a}`);
    if (erreurs.length) echecs++;
  }
  if (echecs) {
    console.error(`\n${echecs} plugin${echecs > 1 ? "s" : ""} à corriger.`);
    process.exit(1);
  }
}
