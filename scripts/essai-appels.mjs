// Essai des appels entre plugins dans un VRAI navigateur (docs/24 A.1.2, docs/19 n° 17 à 23) : l'interface web construite,
// les plugins de test de fixtures/appels-entre-plugins, Chromium piloté par Playwright.
//   node scripts/essai-appels.mjs              construit l'interface web si besoin, joue les essais
//   node scripts/essai-appels.mjs --sans-build réutilise apps/desktop/dist-web tel quel
//   node scripts/essai-appels.mjs --garder     laisse les serveurs ouverts à la fin (adresse affichée) pour regarder à la main
//
// Playwright n'est PAS une dépendance du dépôt (pas de lockfile à fusionner, ~100 Mo de navigateur). Le script le prend :
//   - PLAYWRIGHT_PATH : dossier du module `playwright` ou `@playwright/test` (par défaut : celui que Node trouve depuis le dépôt) ;
//   - ETABLI_CHROMIUM : exécutable de Chromium (par défaut : celui de Playwright, sinon /opt/pw-browsers/chromium-*/…/chrome).
//   Exemple : PLAYWRIGHT_PATH=~/gestion-budget-perso/web/node_modules/@playwright/test node scripts/essai-appels.mjs
//
// Montage : deux origines, comme avec un serveur Établi. La page d'accueil vient de l'origine A ; l'application construite et les
// plugins viennent de l'origine B (balise <base> ajoutée à la page, CORS ouvert), avec la même politique CSP que le cœur Rust
// (plugins.rs). Les cadres des plugins sont donc d'une autre origine que l'interface : `window.parent.document` doit être refusé.
// Aucune donnée n'est écrite hors du dossier temporaire. Code de retour : 0 si tous les essais passent, 1 sinon.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listerFichiers } from "./construire-web.mjs";

const racine = fileURLToPath(new URL("..", import.meta.url));
const sansBuild = process.argv.includes("--sans-build");
const garder = process.argv.includes("--garder");
const fixtures = join(racine, "fixtures", "appels-entre-plugins");
const distWeb = join(racine, "apps", "desktop", "dist-web");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

/** Plugins de test à construire : dossier → fichier HTML (relatif au plugin) à compiler. */
const PLUGINS = {
  "fournisseur-essai": "service/index.html",
  "appelant-essai": "essai/index.html",
  "appelant-lecture": "essai/index.html",
  "appelant-finances": "essai/index.html",
};

/** Vrais plugins du dépôt joués en plus des fixtures (leur dossier dist/, voir « npm run build:plugins »). */
const PLUGINS_REELS = ["finances"];

// ——— Compte rendu ———

const resultats = [];
function essai(nom, ok, detail = "") {
  resultats.push({ nom, ok });
  console.log(`${ok ? "  ✔" : "  ✘"} ${nom}${detail && !ok ? `\n      → ${detail}` : ""}`);
}
const etape = (texte) => console.log(`\n== ${texte}`);
const json = (v) => JSON.stringify(v);

// ——— Playwright et Chromium ———

function chargerPlaywright() {
  const exiger = createRequire(import.meta.url);
  const candidats = [process.env.PLAYWRIGHT_PATH, "playwright", "@playwright/test", "playwright-core"].filter(Boolean);
  for (const c of candidats) {
    try {
      const m = exiger(c);
      if (m.chromium) return m;
    } catch {
      /* suivant */
    }
  }
  console.error("Playwright est introuvable. Indiquez-le : PLAYWRIGHT_PATH=<dossier du module playwright ou @playwright/test>.");
  process.exit(2);
}

function trouverChromium() {
  if (process.env.ETABLI_CHROMIUM) return process.env.ETABLI_CHROMIUM;
  const dossier = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (!existsSync(dossier)) return undefined; // Playwright prendra son propre navigateur
  for (const nom of readdirSync(dossier).sort().reverse()) {
    if (!nom.startsWith("chromium-")) continue;
    for (const sous of ["chrome-linux/chrome", "chrome-linux64/chrome", "chrome-win/chrome.exe"]) {
      if (existsSync(join(dossier, nom, sous))) return join(dossier, nom, sous);
    }
  }
  return undefined;
}

// ——— Construction ———

const tmp = mkdtempSync(join(tmpdir(), "etabli-essai-appels-"));
const serveurs = [];
let navigateur;

async function nettoyer() {
  try {
    await navigateur?.close();
  } catch {
    /* déjà fermé */
  }
  for (const s of serveurs) s.close();
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* dossier temporaire */
  }
}

/** Compile chaque plugin de test avec Vite (le vrai SDK, comme un auteur de plugin) dans <tmp>/plugins/<id>. */
async function construireFixtures() {
  etape("Construction des plugins de test");
  const { build } = await import("vite");
  const index = [];
  for (const [id, page] of Object.entries(PLUGINS)) {
    const sortie = join(tmp, "plugins", id);
    await build({
      root: join(fixtures, id),
      configFile: false,
      logLevel: "warn",
      base: "./",
      build: { outDir: sortie, emptyOutDir: true, target: "chrome120", rollupOptions: { input: join(fixtures, id, page) } },
    });
    const manifeste = JSON.parse(readFileSync(join(fixtures, id, "manifest.json"), "utf-8"));
    writeFileSync(join(sortie, "manifest.json"), json(manifeste));
    index.push({ manifest: manifeste, official: true });
    console.log(`  ${id} : ${listerFichiers(sortie).length} fichiers`);
  }
  for (const id of PLUGINS_REELS) {
    const dist = join(racine, "plugins", id, "dist");
    if (!existsSync(join(dist, "manifest.json"))) throw new Error(`plugins/${id}/dist est absent : lancez « npm run build:plugins ».`);
    cpSync(dist, join(tmp, "plugins", id), { recursive: true });
    index.push({ manifest: JSON.parse(readFileSync(join(dist, "manifest.json"), "utf-8")), official: true });
    console.log(`  ${id} (plugin du dépôt) : ${listerFichiers(join(dist)).length} fichiers`);
  }
  writeFileSync(join(tmp, "plugins", "index.json"), json(index));
  return index;
}

/** Même politique que PLUGIN_CSP de apps/desktop/src-tauri/src/plugins.rs, pour l'origine d'essai. */
const csp = (origine) =>
  `default-src 'none'; script-src 'self' ${origine} 'wasm-unsafe-eval'; style-src 'self' ${origine} 'unsafe-inline'; ` +
  `img-src 'self' ${origine} data: blob:; font-src 'self' ${origine} data:; worker-src 'self' ${origine} blob:; ` +
  `connect-src 'none'; base-uri 'none'; form-action 'none'`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webmanifest": "application/manifest+json",
};

/** Sert des fichiers listés au démarrage (l'adresse n'est jamais un chemin disque). `fichiers` : adresse → chemin. */
function servir(fichiers, entetes) {
  return new Promise((resolve) => {
    const serveur = createServer((req, res) => {
      let adresse = "/";
      try {
        adresse = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
      } catch {
        /* adresse invalide : 404 */
      }
      const f = fichiers.get(adresse);
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (!f) {
        res.statusCode = 404;
        res.end("Introuvable");
        return;
      }
      res.setHeader("Content-Type", MIME[extname(f)] ?? "application/octet-stream");
      for (const [k, v] of Object.entries(entetes(adresse))) res.setHeader(k, v);
      res.end(readFileSync(f));
    });
    serveur.listen(0, "127.0.0.1", () => resolve({ serveur, port: serveur.address().port }));
    serveurs.push(serveur);
  });
}

/** Monte les deux origines et renvoie leurs adresses. */
async function monter() {
  etape("Deux origines locales");
  const copie = join(tmp, "app");
  cpSync(distWeb, copie, { recursive: true });
  cpSync(join(tmp, "plugins"), join(copie, "plugins"), { recursive: true });
  rmSync(join(copie, "sw.js"), { force: true }); // pas de service worker : on veut voir chaque requête
  const fichiersB = new Map(listerFichiers(copie).map((f) => [`/${f}`, join(copie, f)]));
  // Origine B : l'application construite et les plugins. La CSP des plugins n'est envoyée que sur leurs fichiers.
  let origineB = "";
  const b = await servir(fichiersB, (adresse) =>
    adresse.startsWith("/plugins/") && adresse !== "/plugins/index.json" ? { "Content-Security-Policy": csp(origineB) } : {},
  );
  origineB = `http://127.0.0.1:${b.port}`;
  // Origine A : seulement la page d'accueil, dont toutes les adresses relatives pointent vers B (<base>).
  const page = readFileSync(join(copie, "index.html"), "utf-8").replace("<head>", `<head><base href="${origineB}/">`);
  const pageA = join(tmp, "accueil.html");
  writeFileSync(pageA, page);
  const a = await servir(new Map([["/", pageA]]), () => ({}));
  const origineA = `http://localhost:${a.port}`;
  console.log(`  interface ${origineA}   plugins ${origineB}`);
  return { origineA, origineB };
}

// ——— Pilotage de l'interface ———

/** Ouvre la mini-app d'essai d'un plugin depuis l'accueil et rend son cadre, prêt à recevoir des appels. */
async function ouvrirAppelant(page, nomPlugin, idPlugin) {
  // La colonne de gauche liste les pages : la première page du plugin charge le cadre.
  await page.locator(`button[data-page^="${idPlugin}/"]`).first().click();
  const cadre = await attendreCadre(page, idPlugin);
  await cadre.waitForFunction(() => document.title === "prêt", null, { timeout: 15_000 });
  return cadre;
}

async function attendreCadre(page, idPlugin) {
  for (let i = 0; i < 150; i++) {
    const f = page.frames().find((fr) => fr.url().includes(`/plugins/${idPlugin}/`));
    if (f) return f;
    await page.waitForTimeout(100);
  }
  throw new Error(`cadre de ${idPlugin} introuvable`);
}

const appeler = (cadre, service, fn, args = null, timeoutMs) =>
  cadre.evaluate(([s, f, a, t]) => window.appeler(s, f, a, t), [service, fn, args, timeoutMs]);

const cadresDeService = (page) => page.locator('iframe[title^="Service "]').count();

async function jouer(playwright, origineA, indexComplet) {
  const lancement = { headless: true };
  const exe = trouverChromium();
  if (exe) lancement.executablePath = exe;
  navigateur = await playwright.chromium.launch(lancement);

  /** Un contexte neuf par scénario (stockage vierge) ; `index` = les plugins installés. */
  async function nouvellePage(index) {
    const contexte = await navigateur.newContext();
    const page = await contexte.newPage();
    const journal = [];
    page.on("console", (m) => journal.push(`${m.type()}: ${m.text()}`));
    page.on("response", (r) => r.status() >= 400 && journal.push(`http ${r.status()}: ${r.url()}`));
    page.on("pageerror", (e) => journal.push(`erreur page: ${e.message}`));
    // Les plugins « installés » : on filtre la liste servie, sans toucher aux fichiers.
    await page.route("**/plugins/index.json", (route) =>
      route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: json(index) }),
    );
    await page.goto(origineA);
    await page.waitForSelector(".card .open, nav[aria-label='Plugins']", { timeout: 20_000 });
    return { contexte, page, journal };
  }

  // ——— Scénario principal : les deux plugins installés ———
  etape("Appel complet : appelant → moteur → cadre invisible du fournisseur → réponse");
  const { page, journal, contexte } = await nouvellePage(indexComplet);
  let cadre;
  try {
    cadre = await ouvrirAppelant(page, "Appelant d'essai", "appelant-essai");
  } catch (e) {
    essai("ouverture de la mini-app d'essai", false, `${e.message}\n${journal.slice(-15).join("\n")}`);
    return;
  }
  essai("mini-app d'essai ouverte dans un cadre", true);

  const ajout = await appeler(cadre, "registre", "ecritures.ajouter", { cle: "paie-oct", montant: 125000 });
  essai("succès : écriture ajoutée", ajout.ok === true && ajout.valeur?.doublon === false, json(ajout));
  essai("le cadre de service est détruit après la réponse", (await cadresDeService(page)) === 0);

  const total = await appeler(cadre, "registre", "soldes.total");
  essai("rien en mémoire d'un appel à l'autre : le registre vient des réglages du plugin", total.ok && total.valeur?.total === 125000 && total.valeur?.nombre === 1, json(total));
  const doublon = await appeler(cadre, "registre", "ecritures.ajouter", { cle: "paie-oct", montant: 125000 });
  essai("idempotence : même clé, aucun doublon (cadre neuf, même résultat)", doublon.ok && doublon.valeur?.doublon === true, json(doublon));
  const total2 = await appeler(cadre, "registre", "soldes.total");
  essai("…et le total n'a pas bougé", total2.ok && total2.valeur?.total === 125000 && total2.valeur?.nombre === 1, json(total2));
  const qui = await appeler(cadre, "registre", "echo.appelant");
  essai("le fournisseur reçoit l'identité écrite par le moteur", qui.ok && qui.valeur === "appelant-essai", json(qui));

  etape("Erreurs typées");
  const invalide = await appeler(cadre, "registre", "ecritures.ajouter", { cle: "x", montant: "beaucoup" });
  essai("argument invalide : refus du fournisseur (argument_invalide)", !invalide.ok && invalide.code === "argument_invalide", json(invalide));
  const inconnue = await appeler(cadre, "registre", "ecritures.supprimer", { cle: "paie-oct" });
  essai("fonction non déclarée : introuvable", !inconnue.ok && inconnue.code === "introuvable", json(inconnue));
  const autreService = await appeler(cadre, "banque", "soldes.total");
  essai("service non permis : permission_refusee", !autreService.ok && autreService.code === "permission_refusee", json(autreService));
  const gros = await appeler(cadre, "registre", "ecritures.ajouter", { cle: "g", montant: 1, remplissage: "x".repeat(4_200_000) });
  essai("message de plus de 4 Mo : refusé avant d'atteindre le fournisseur", !gros.ok && gros.code === "argument_invalide", json(gros).slice(0, 200));

  if (process.env.ESSAI_DEBUG) console.log(journal.join("\n"));
  // ——— File d'attente et délais ———
  etape("File d'attente par fournisseur et délais");
  const t0 = Date.now();
  const trois = await Promise.all([1, 2, 3].map(() => appeler(cadre, "registre", "attendre.ms", { ms: 400 }, 8000)));
  const duree = Date.now() - t0;
  const tous = trois.every((r) => r.ok);
  const plages = trois.filter((r) => r.ok).map((r) => r.valeur).sort((a, b) => a.debut - b.debut);
  const sansChevauchement = plages.every((p, i) => i === 0 || p.debut >= plages[i - 1].fin - 5);
  essai("trois appels simultanés : tous répondent", tous, json(trois));
  essai("…sérialisés : jamais deux à la fois chez le fournisseur", tous && sansChevauchement && duree >= 1100, `durée ${duree} ms ${json(plages)}`);

  const [long, court] = await Promise.all([
    appeler(cadre, "registre", "attendre.ms", { ms: 1500 }, 8000),
    appeler(cadre, "registre", "soldes.total", null, 500),
  ]);
  essai("le délai compte l'attente en file : le 2e appel expire derrière le 1er", long.ok && !court.ok && court.code === "delai_depasse", json({ long, court }));
  // La file doit repartir ensuite.
  const suite = await appeler(cadre, "registre", "soldes.total", null, 4000);
  essai("la file repart après un délai expiré", suite.ok, json(suite));

  const t1 = Date.now();
  const muet = await appeler(cadre, "registre", "ne.repond.jamais", null, 600);
  essai("fournisseur muet : delai_depasse", !muet.ok && muet.code === "delai_depasse" && Date.now() - t1 < 3000, json(muet));
  await page.waitForTimeout(200);
  essai("…et son cadre est détruit", (await cadresDeService(page)) === 0);
  const apresMuet = await appeler(cadre, "registre", "soldes.total", null, 4000);
  essai("…la file n'est pas bloquée par le muet", apresMuet.ok, json(apresMuet));

  const rafale = await Promise.all(Array.from({ length: 12 }, () => appeler(cadre, "registre", "attendre.ms", { ms: 150 }, 10_000)));
  const occupes = rafale.filter((r) => !r.ok && r.code === "occupe").length;
  const reussis = rafale.filter((r) => r.ok).length;
  essai("plafond de 8 appels en attente par appelant : le surplus reçoit occupe", occupes === 4 && reussis === 8, `occupe ${occupes}, réussis ${reussis}`);
  await page.waitForTimeout(300);
  essai("…et plus aucun cadre de service ne reste ouvert", (await cadresDeService(page)) === 0);

  // ——— Isolation ———
  etape("Isolation du cadre de service (mêmes garanties que la mini-app)");
  const sondeApp = await cadre.evaluate(() => window.sonde());
  const sondeService = await appeler(cadre, "registre", "sonde.isolation");
  essai("sonde du cadre de service obtenue", sondeService.ok, json(sondeService));
  const s = sondeService.valeur ?? {};
  const origineService = new URL(s.origine ?? "http://invalide").origin;
  essai("origine du service ≠ origine de l'interface", origineService !== origineA && origineService === new URL(cadre.url()).origin, `${origineService} / ${origineA}`);
  essai("window.parent.document refusé", String(s.parent).startsWith("refuse:"), s.parent);
  essai("window.parent.localStorage refusé", String(s.parentStockage).startsWith("refuse:"), s.parentStockage);
  essai("fetch vers l'extérieur bloqué (CSP connect-src 'none')", String(s.fetchExterne).startsWith("refuse:"), s.fetchExterne);
  essai("window.open bloqué (sandbox sans allow-popups)", s.ouvertureFenetre === "bloquee", s.ouvertureFenetre);
  essai("une violation de CSP a bien été signalée dans le cadre", s.violationsCsp >= 1, String(s.violationsCsp));
  for (const cle of ["parent", "parentStockage", "fetchExterne", "ouvertureFenetre", "stockagePropre"]) {
    essai(`parité mini-app / service : « ${cle} » identique`, sondeApp[cle] === s[cle], `${sondeApp[cle]} / ${s[cle]}`);
  }

  // Le cadre en cours d'appel : mêmes attributs que celui de la mini-app, caché des lecteurs d'écran et hors écran.
  const miniAppSandbox = await page.locator('iframe[title]:not([title^="Service "])').first().getAttribute("sandbox");
  const attente = appeler(cadre, "registre", "attendre.ms", { ms: 1200 }, 8000);
  let ouvert = null;
  for (let i = 0; i < 20 && !ouvert; i++) {
    await page.waitForTimeout(50);
    const loc = page.locator('iframe[title="Service fournisseur-essai"]');
    if ((await loc.count()) > 0) {
      ouvert = {
        sandbox: await loc.first().getAttribute("sandbox"),
        aria: await loc.first().getAttribute("aria-hidden"),
        tab: await loc.first().getAttribute("tabindex"),
        boite: await loc.first().boundingBox(),
        opacite: await loc.first().evaluate((el) => getComputedStyle(el).opacity),
        src: await loc.first().evaluate((el) => el.src),
      };
    }
  }
  await attente;
  essai("le cadre de service existe pendant l'appel", ouvert !== null);
  if (ouvert) {
    essai("même attribut sandbox que la mini-app", ouvert.sandbox === miniAppSandbox, `${ouvert.sandbox} / ${miniAppSandbox}`);
    essai("jamais allow-top-navigation, allow-popups ni allow-modals", !/allow-(top-navigation|popups|modals|forms)/.test(ouvert.sandbox ?? ""), ouvert.sandbox ?? "");
    essai("caché aux lecteurs d'écran, hors tabulation, invisible", ouvert.aria === "true" && ouvert.tab === "-1" && ouvert.opacite === "0", json(ouvert));
    essai("hors de la fenêtre et d'un pixel", !ouvert.boite || ouvert.boite.width <= 1 && ouvert.boite.x < 0, json(ouvert.boite));
    essai("même origine d'adresse que les fichiers du plugin (pas celle de l'interface)", new URL(ouvert.src).origin === origineService, ouvert.src);
  }
  etape("Permission manquante");
  // Permission manquante : un appelant qui n'a que « lecture » ne peut pas écrire.
  const lecteur = await ouvrirAppelant(page, "Appelant en lecture seule", "appelant-lecture");
  const lecture = await appeler(lecteur, "registre", "soldes.total");
  essai("permission de lecture : la lecture passe", lecture.ok && lecture.valeur?.nombre === 1, json(lecture));
  const ecriture = await appeler(lecteur, "registre", "ecritures.ajouter", { cle: "intrus", montant: 1 });
  essai("permission manquante : l'écriture est refusée (permission_refusee)", !ecriture.ok && ecriture.code === "permission_refusee", json(ecriture));
  const cadre2 = await ouvrirAppelant(page, "Appelant d'essai", "appelant-essai");
  const apres = await appeler(cadre2, "registre", "soldes.total");
  essai("…et rien n'a été écrit", apres.ok && apres.valeur?.nombre === 1, json(apres));

  // Un plugin ne peut pas lire les données d'un autre : stockage séparé (le mode d'essai garde « allow-same-origin »).
  essai("aucune erreur JavaScript non attendue dans l'interface", !journal.some((l) => l.startsWith("erreur page")), journal.filter((l) => l.startsWith("erreur page")).join(" | "));
  await contexte.close();

  // ——— Le vrai plugin Finances ———
  etape("Plugin Finances : service finances@1 et tableau de bord");
  const f = await nouvellePage(indexComplet);
  try {
    const c = await ouvrirAppelant(f.page, "Appelant de Finances", "appelant-finances");
    const fin = (fn, args = null, t = 8000) => appeler(c, "finances", fn, args, t);
    const maintenant = Date.now();
    const vide = await fin("comptes.liste");
    essai("registre neuf : aucun compte, sans erreur", vide.ok && vide.valeur.length === 0, json(vide));
    const compte = await fin("comptes.creer", { nom: "Compte courant", type: "courant", soldeInitialCents: 125000, ouvertLe: "2026-01-01", cle: "essai-compte" });
    essai("création d'un compte", compte.ok && compte.valeur.id === "c1" && compte.valeur.rejoue === false, json(compte));
    const rejeu = await fin("comptes.creer", { nom: "Compte courant", type: "courant", soldeInitialCents: 125000, ouvertLe: "2026-01-01", cle: "essai-compte" });
    essai("rejeu de la même clé : même compte, aucun doublon", rejeu.ok && rejeu.valeur.id === "c1" && rejeu.valeur.rejoue === true, json(rejeu));
    const cat = await fin("categories.creer", { nom: "Courses", sens: "sortie", cle: "essai-cat" });
    essai("création d'une catégorie", cat.ok && cat.valeur.id === "k2", json(cat));
    const e1 = await fin("ecritures.ajouter", { compteId: "c1", montantCents: -4520, quand: maintenant, libelle: "Supermarché", categorieId: "k2", cle: "essai-e1" });
    const e2 = await fin("ecritures.ajouter", { compteId: "c1", montantCents: -1999, quand: maintenant - 1000, libelle: "Erreur de saisie", categorieId: "k2", cle: "essai-e2" });
    essai("écritures ajoutées", e1.ok && e2.ok, json([e1, e2]));
    const jourJ = new Date(maintenant).toISOString().slice(0, 10);
    const solde = await fin("soldes.aLaDate", { jour: jourJ });
    essai("solde = 1 250,00 − 45,20 − 19,99 = 1 184,81 €", solde.ok && solde.valeur.c1 === 118481, json(solde));
    const annul = await fin("ecritures.annuler", { id: "e4", motif: "double saisie", cle: "essai-an" });
    const solde2 = await fin("soldes.aLaDate", { jour: jourJ });
    essai("annulation par écriture inverse : le solde remonte de 19,99 €", annul.ok && solde2.ok && solde2.valeur.c1 === 120480, json({ annul, solde2 }));
    const total = await fin("totaux.parCategorie", { du: "2026-01-01", au: jourJ, sens: "sortie" });
    essai("total des dépenses par catégorie sans l'écriture annulée", total.ok && total.valeur.length === 1 && total.valeur[0].cents === -4520, json(total));
    const mauvais = await fin("ecritures.ajouter", { compteId: "c1", montantCents: 12.5, quand: maintenant, libelle: "x", cle: "essai-mauvais" });
    essai("montant non entier : argument_invalide", !mauvais.ok && mauvais.code === "argument_invalide", json(mauvais));
    const usurpe = await fin("ecritures.ajouter", { compteId: "c1", montantCents: -1, quand: maintenant, libelle: "x", cle: "essai-us", source: "banque" });
    essai("source imposée par le moteur : un champ « source » est refusé", !usurpe.ok && usurpe.code === "argument_invalide", json(usurpe));
    const liste = await fin("ecritures.liste", {});
    essai("liste des écritures (trois, dont l'annulation), sans clé interne", liste.ok && liste.valeur.ecritures.length === 3 && !json(liste).includes('"cle"'), json(liste).slice(0, 200));

    // Le tableau de bord, ouvert comme le ferait l'utilisateur.
    await f.page.getByRole("button", { name: /^Finances/ }).first().click();
    await f.page.getByRole("button", { name: "Nouveau", exact: true }).click();
    const tableau = await attendreCadre(f.page, "finances");
    await tableau.waitForFunction(() => document.body.innerText.includes("Solde total"), null, { timeout: 15_000 });
    const texte = await tableau.evaluate(() => document.body.innerText.replace(/[\u00a0\u202f]/g, " "));
    essai("tableau de bord : solde total affiché", texte.includes("1 204,80 €"), texte.slice(0, 300));
    essai("tableau de bord : compte, dernières écritures et annulation visibles", texte.includes("Compte courant") && texte.includes("Supermarché") && texte.includes("annulée"), texte.slice(0, 300));
    essai("tableau de bord : dépenses du mois par catégorie", texte.includes("Courses") && texte.includes("45,20 €"), texte.slice(0, 600));
    if (process.env.ESSAI_CAPTURE) {
      await f.page.setViewportSize({ width: 1280, height: 1500 });
      await f.page.waitForTimeout(800);
      await f.page.screenshot({ path: process.env.ESSAI_CAPTURE });
    }
  } catch (e) {
    essai("plugin Finances", false, `${e.message}\n${f.journal.slice(-10).join("\n")}`);
  }
  await f.contexte.close();

  // ——— Fournisseur absent ———
  etape("Fournisseur absent");
  const sansFournisseur = indexComplet.filter((p) => p.manifest.id !== "fournisseur-essai");
  const absent = await nouvellePage(sansFournisseur);
  try {
    const c = await ouvrirAppelant(absent.page, "Appelant d'essai", "appelant-essai");
    const r = await appeler(c, "registre", "soldes.total");
    essai("fournisseur non installé : service_absent, sans exception", !r.ok && r.code === "service_absent", json(r));
    essai("…aucun cadre de service ouvert", (await cadresDeService(absent.page)) === 0);
  } catch (e) {
    essai("fournisseur absent", false, `${e.message}\n${absent.journal.slice(-10).join("\n")}`);
  }
  await absent.contexte.close();

  etape("Contrat incompatible");
  const vieux = indexComplet.map((p) =>
    p.manifest.id === "fournisseur-essai" ? { ...p, manifest: { ...p.manifest, provides: { registre: "2" } } } : p,
  );
  const incompat = await nouvellePage(vieux);
  try {
    const c = await ouvrirAppelant(incompat.page, "Appelant d'essai", "appelant-essai");
    const r = await appeler(c, "registre", "soldes.total");
    essai("contrat 2 publié, appelant en ^1 : contrat_incompatible", !r.ok && r.code === "contrat_incompatible", json(r));
  } catch (e) {
    essai("contrat incompatible", false, `${e.message}\n${incompat.journal.slice(-10).join("\n")}`);
  }
  await incompat.contexte.close();
}

// ——— Programme ———

let code = 1;
try {
  const playwright = chargerPlaywright();
  if (!sansBuild || !existsSync(join(distWeb, "index.html"))) {
    etape("Construction de l'interface web");
    execFileSync(npm, ["run", "build:web"], { cwd: racine, stdio: "inherit", shell: process.platform === "win32" });
  }
  const index = await construireFixtures();
  const { origineA } = await monter();
  await jouer(playwright, origineA, index);
  const echecs = resultats.filter((r) => !r.ok).length;
  console.log(`\n${resultats.length - echecs}/${resultats.length} essais réussis.`);
  code = echecs === 0 ? 0 : 1;
  if (garder) {
    console.log(`Serveurs laissés ouverts : ${origineA} (Ctrl+C pour arrêter)`);
    await new Promise(() => {});
  }
} catch (e) {
  console.error(e);
} finally {
  if (!garder) await nettoyer();
}
process.exit(code);
