// Essai d'isolation de bout en bout (docs/19, §4) : un vrai serveur, de vrais plugins signés, un vrai navigateur.
//   node scripts/essais-isolation.mjs              construit tout, lance le serveur et joue les essais
//   node scripts/essais-isolation.mjs --sans-build réutilise le serveur, la version web et les plugins déjà construits
//   node scripts/essais-isolation.mjs --pause      laisse le serveur tourner après l'installation (pour explorer à la main)
//
// Ce que fait le script :
//   1. clé de signature temporaire, paquets signés des plugins `agenda` et `finances` ;
//   2. lancement du binaire `etabli-serveur` (origine dédiée aux plugins : http://<id>.localhost:4321) ;
//   3. création de l'administrateur et installation des deux plugins par l'API, comme le ferait un administrateur ;
//   4. essais dans Chromium (Playwright) : cadre isolé, CSP, stockage séparé, hôtes étrangers, messages hostiles.
// Code de retour : 0 si tous les essais passent, 1 sinon. Aucune donnée n'est écrite hors du dossier temporaire.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";

const racine = fileURLToPath(new URL("..", import.meta.url));
const sansBuild = process.argv.includes("--sans-build");
const pause = process.argv.includes("--pause");

const PORT_APP = 4320;
const PORT_PLUGINS = 4321;
const ORIGINE_APP = `http://127.0.0.1:${PORT_APP}`;
const MOT_DE_PASSE = "essai-isolation-2026";
const PLUGINS = ["agenda", "finances"];
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

// ——— Compte rendu ———

const resultats = [];
function essai(nom, ok, detail = "") {
  resultats.push({ nom, ok });
  console.log(`${ok ? "  ✔" : "  ✘"} ${nom}${detail && !ok ? `\n      → ${detail}` : ""}`);
}
const etape = (texte) => console.log(`\n== ${texte}`);

function lancer(commande, args, options = {}) {
  execFileSync(commande, args, { cwd: racine, stdio: "inherit", shell: process.platform === "win32", ...options });
}

// ——— Préparation ———

const tmp = mkdtempSync(join(tmpdir(), "etabli-isolation-"));
let serveur;
let navigateur;

async function nettoyer() {
  try {
    await navigateur?.close();
  } catch {
    /* déjà fermé */
  }
  serveur?.kill("SIGTERM");
  // Laisse le serveur libérer la base avant d'effacer son dossier.
  await new Promise((r) => setTimeout(r, 300));
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* sans importance : dossier temporaire */
  }
}

/** Clé de signature temporaire + un paquet signé par plugin. Renvoie la clé publique. */
function fabriquerPaquets() {
  etape("Clé de signature temporaire et paquets signés");
  const cle = join(tmp, "cle.key");
  execFileSync(npx, ["tauri", "signer", "generate", "--ci", "-p", "", "-w", cle], {
    cwd: join(racine, "apps", "desktop"),
    stdio: ["ignore", "ignore", "inherit"],
    shell: process.platform === "win32",
  });
  const publique = readFileSync(`${cle}.pub`, "utf8").trim();
  const env = { ...process.env, TAURI_SIGNING_PRIVATE_KEY: readFileSync(cle, "utf8").trim(), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "" };
  for (const id of PLUGINS) {
    lancer(process.execPath, [join("scripts", "paquet-plugin.mjs"), id, "--sortie", join(tmp, "paquets")], { env });
  }
  return publique;
}

function binaireServeur() {
  const dossier = process.env.CARGO_TARGET_DIR ?? join(racine, "target");
  return join(dossier, "debug", process.platform === "win32" ? "etabli-serveur.exe" : "etabli-serveur");
}

/** Lance le serveur et attend qu'il écoute ; renvoie le code d'installation qu'il affiche au premier lancement. */
function lancerServeur(clePublique) {
  etape("Lancement du serveur");
  const donnees = join(tmp, "donnees");
  mkdirSync(donnees, { recursive: true });
  return new Promise((resolve, reject) => {
    serveur = spawn(binaireServeur(), [], {
      cwd: racine,
      env: {
        ...process.env,
        ETABLI_DONNEES: donnees,
        ETABLI_ECOUTE: `127.0.0.1:${PORT_APP}`,
        ETABLI_ECOUTE_PLUGINS: `127.0.0.1:${PORT_PLUGINS}`,
        ETABLI_URL_PLUGINS: `http://{id}.localhost:${PORT_PLUGINS}`,
        ETABLI_CLE_PUBLIQUE: clePublique,
        ETABLI_APPLICATION: join(racine, "apps", "desktop", "dist-web"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let sortie = "";
    let code = null;
    const fin = setTimeout(() => reject(new Error(`le serveur ne répond pas :\n${sortie}`)), 30_000);
    const lire = (morceau) => {
      sortie += morceau;
      code ??= /Code d'installation[^:]*:\s*(\S+)/.exec(sortie)?.[1] ?? null;
      if (code && sortie.includes("Origine des plugins") && sortie.includes(`http://127.0.0.1:${PORT_APP}`)) {
        clearTimeout(fin);
        resolve(code);
      }
    };
    serveur.stdout.on("data", (d) => lire(String(d)));
    serveur.stderr.on("data", (d) => lire(String(d)));
    serveur.on("exit", (c) => reject(new Error(`le serveur s'est arrêté (code ${c}) :\n${sortie}`)));
  });
}

// ——— API ———

async function api(chemin, { methode = "GET", jeton, json, octets } = {}) {
  const en_tetes = {};
  if (jeton) en_tetes.authorization = `Bearer ${jeton}`;
  if (json) en_tetes["content-type"] = "application/json";
  if (octets) en_tetes["content-type"] = "application/octet-stream";
  const reponse = await fetch(`${ORIGINE_APP}${chemin}`, { method: methode, headers: en_tetes, body: json ? JSON.stringify(json) : octets });
  const texte = await reponse.text();
  if (!reponse.ok) throw new Error(`${methode} ${chemin} → ${reponse.status} ${texte}`);
  return texte ? JSON.parse(texte) : null;
}

async function installerLesPlugins(code) {
  etape("Administrateur et installation des plugins par l'API");
  const { jeton } = await api("/api/installation", { methode: "POST", json: { code, nom: "essai", motDePasse: MOT_DE_PASSE } });
  for (const id of PLUGINS) {
    const paquet = readFileSync(join(tmp, "paquets", `${id}-${JSON.parse(readFileSync(join(racine, "plugins", id, "dist", "manifest.json"), "utf8")).version}.etabli-plugin`));
    await api("/api/admin/plugins", { methode: "POST", jeton, octets: paquet });
  }
  const liste = await api("/api/plugins", { jeton });
  const ids = liste.map((p) => p.manifest.id).sort();
  essai("les deux plugins signés sont installés par l'API", PLUGINS.every((id) => ids.includes(id)), `plugins vus : ${ids.join(", ")}`);
  return { jeton, liste };
}

// ——— Essais d'en-têtes (sans navigateur) ———

/** Requête HTTP avec un en-tête Host choisi (fetch l'interdit, et Node ne sait pas résoudre *.localhost). */
function requeteHote(hote, chemin) {
  return new Promise((resolve, reject) => {
    const requete = httpRequest({ host: "127.0.0.1", port: PORT_PLUGINS, path: chemin, headers: { host: hote } }, (reponse) => {
      const morceaux = [];
      reponse.on("data", (m) => morceaux.push(m));
      reponse.on("end", () => resolve({ statut: reponse.statusCode, en_tetes: reponse.headers, corps: Buffer.concat(morceaux).toString("utf8") }));
    });
    requete.on("error", reject);
    requete.end();
  });
}

async function essaisHotes() {
  etape("Origine des plugins : l'en-tête Host décide de tout");
  const bon = await requeteHote(`agenda.localhost:${PORT_PLUGINS}`, "/manifest.json");
  essai("un hôte de plugin sert les fichiers de CE plugin", bon.statut === 200 && JSON.parse(bon.corps).id === "agenda", `${bon.statut}`);
  const csp = String(bon.en_tetes["content-security-policy"] ?? "");
  essai(
    "les fichiers d'un plugin portent une CSP sans réseau",
    csp.includes("default-src 'none'") && csp.includes("connect-src 'none'") && csp.includes("form-action 'none'"),
    csp,
  );
  const croise = await requeteHote(`finances.localhost:${PORT_PLUGINS}`, "/apps/calendrier/index.html");
  essai("un plugin ne sert pas les fichiers d'un autre", croise.statut === 404, `${croise.statut}`);
  const etrangers = [
    "evil.com",
    `evil.com:${PORT_PLUGINS}`,
    "agenda.autre.test",
    `agenda.localhost.evil.com:${PORT_PLUGINS}`,
    `localhost:${PORT_PLUGINS}`,
    `127.0.0.1:${PORT_PLUGINS}`,
    `a.b.localhost:${PORT_PLUGINS}`,
    `AGE_NDA.localhost:${PORT_PLUGINS}`,
  ];
  for (const hote of etrangers) {
    const r = await requeteHote(hote, "/manifest.json");
    essai(`hôte étranger « ${hote} » → 404`, r.statut === 404, `${r.statut}`);
  }
  for (const chemin of ["/../../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd", "/apps/%2e%2e/%2e%2e/manifest.json", "/sw-plugins.js/../manifest.json"]) {
    const r = await requeteHote(`agenda.localhost:${PORT_PLUGINS}`, chemin);
    essai(`évasion de chemin « ${chemin} » refusée`, r.statut === 404 || r.statut === 400, `${r.statut}`);
  }
  const sw = await requeteHote("evil.com", "/sw-plugins.js");
  essai("le service worker n'est servi qu'aux hôtes de plugin", sw.statut === 404, `${sw.statut}`);
}

// ——— Essais dans le navigateur ———

/** Dans le cadre d'un plugin : garde le port privé reçu du moteur pour pouvoir lui parler comme un plugin hostile. */
const SCRIPT_PORT = `(() => {
  if (location.protocol !== 'http:' || location.port !== '${PORT_PLUGINS}') return;
  window.__violations = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__violations.push(e.effectiveDirective));
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'etabli:connect' && e.ports[0]) window.__portHote = e.ports[0];
  });
})();`;

async function ouvrirDansLApplication(page, ouvrir, hoteAttendu) {
  await ouvrir();
  const cadre = await attendre(() => page.frames().find((f) => estCadreApp(f, hoteAttendu)), 10_000);
  if (!cadre) throw new Error(`le cadre de ${hoteAttendu} ne s'est pas ouvert`);
  await attendre(() => cadre.evaluate(() => Boolean(window.__portHote)).catch(() => false), 10_000);
  return cadre;
}

/** Recharge l'application : elle rouvre ses onglets ; si le cadre de agenda n'en fait pas partie, on ouvre sa première mini-app. */
async function rouvrirAgenda(page) {
  await page.reload();
  await page.locator('button[data-plugin="agenda"]').waitFor({ timeout: 15_000 });
  const dejaOuvert = await attendre(() => page.frames().some((f) => estCadreApp(f, "agenda.localhost")), 4000);
  if (!dejaOuvert) {
    await page.locator('button[data-plugin="agenda"]').click();
    await page.locator("button.open").first().click();
  }
}

/** Cadre d'une mini-app (/apps/…) sur l'hôte d'un plugin : pas la page discrète qui enregistre le service worker. */
function estCadreApp(cadre, hote) {
  try {
    const adresse = new URL(cadre.url());
    return adresse.hostname === hote && adresse.pathname.startsWith("/apps/");
  } catch {
    return false;
  }
}

async function attendre(fonction, delai) {
  const fin = Date.now() + delai;
  while (Date.now() < fin) {
    const v = await fonction();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

/** Résultat d'une tentative faite DANS le cadre : « refusé: <nom> » si elle a échoué, « réussi » sinon. */
const TENTATIVES = {
  "lire le document de l'application (parent.document)": () => {
    try {
      return typeof window.parent.document.title === "string" ? "réussi" : "refusé";
    } catch (e) {
      return `refusé: ${e.name}`;
    }
  },
  "lire le stockage de l'application (parent.localStorage)": () => {
    try {
      return window.parent.localStorage.length >= 0 ? "réussi" : "refusé";
    } catch (e) {
      return `refusé: ${e.name}`;
    }
  },
  "lire le document du sommet (top.document)": () => {
    try {
      return typeof window.top.document.body === "object" ? "réussi" : "refusé";
    } catch (e) {
      return `refusé: ${e.name}`;
    }
  },
};

async function essaisDansLApplication(navigateurPlaywright) {
  const contexte = await navigateurPlaywright.newContext({ viewport: { width: 1200, height: 900 } });
  await contexte.addInitScript(SCRIPT_PORT);
  // Toute requête vers autre chose que le serveur d'essai est comptée puis coupée : la CSP doit l'empêcher avant.
  const sorties = [];
  await contexte.route("**/*", (route) => {
    const adresse = new URL(route.request().url());
    const permis = (adresse.hostname === "127.0.0.1" && adresse.port === String(PORT_APP)) || (adresse.hostname.endsWith(".localhost") && adresse.port === String(PORT_PLUGINS)) || adresse.protocol === "data:" || adresse.protocol === "blob:";
    if (permis) return route.continue();
    sorties.push(adresse.href);
    return route.abort();
  });
  const page = await contexte.newPage();
  const erreursPage = [];
  const refus = [];
  page.on("pageerror", (e) => erreursPage.push(String(e)));
  page.on("console", (m) => {
    if (m.text().includes("message refusé de")) refus.push(m.text());
  });
  const popups = [];
  contexte.on("page", (p) => p !== page && popups.push(p.url()));

  etape("Connexion à l'application web servie par le serveur");
  await page.goto(`${ORIGINE_APP}/`);
  await page.locator("input[type=text]").fill("essai");
  await page.locator("input[type=password]").fill(MOT_DE_PASSE);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.locator('button[data-plugin="finances"]').waitFor({ timeout: 15_000 });
  const jetonApp = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  essai("l'application garde bien une session dans son propre stockage (cible à protéger)", jetonApp.length > 10, jetonApp);

  etape("Plugin « agenda » dans son cadre");
  const agenda = await ouvrirDansLApplication(page, () => page.locator("button.open").first().click(), "agenda.localhost");
  essai("le cadre vit sur l'origine propre du plugin (agenda.localhost)", new URL(agenda.url()).origin === `http://agenda.localhost:${PORT_PLUGINS}`, agenda.url());
  const sandbox = await page.locator('iframe[src*="/apps/"]').first().getAttribute("sandbox");
  essai(
    "l'attribut sandbox du cadre n'ouvre ni fenêtre, ni navigation du sommet, ni formulaire",
    Boolean(sandbox) && sandbox.includes("allow-scripts") && !/allow-(popups|top-navigation|forms|modals|downloads|pointer-lock)/.test(sandbox),
    String(sandbox),
  );

  // 1. Pas d'accès à l'application.
  for (const [nom, fonction] of Object.entries(TENTATIVES)) {
    const r = await agenda.evaluate(fonction);
    essai(`le plugin ne peut pas ${nom} : SecurityError`, r === "refusé: SecurityError", r);
  }
  const stockageVu = await agenda.evaluate(() => ({ local: localStorage.length, cookie: document.cookie, origine: location.origin }));
  essai("le stockage vu par le plugin est vide (rien de la session de l'application)", stockageVu.local === 0 && stockageVu.cookie === "", JSON.stringify(stockageVu));

  // 3. Réseau, images, WebSocket, formulaire, navigation, fenêtres.
  const reseau = await agenda.evaluate(async (appOrigine) => {
    const sortie = {};
    const tenter = async (nom, fonction) => {
      try {
        await fonction();
        sortie[nom] = "réussi";
      } catch (e) {
        sortie[nom] = "refusé";
      }
    };
    await tenter("fetch externe", () => fetch("http://example.com/essai", { mode: "no-cors" }));
    await tenter("fetch de l'API de l'application", () => fetch(`${appOrigine}/api/etat`));
    await tenter("fetch de son propre serveur", () => fetch("/manifest.json"));
    await tenter("WebSocket", () =>
      new Promise((resolve, reject) => {
        try {
          const ws = new WebSocket("ws://example.com/essai");
          ws.onopen = () => resolve(ws.close());
          ws.onerror = () => reject(new Error("ws"));
          setTimeout(() => reject(new Error("délai")), 3000);
        } catch (e) {
          reject(e);
        }
      }),
    );
    await tenter("XMLHttpRequest", () =>
      new Promise((resolve, reject) => {
        const x = new XMLHttpRequest();
        x.open("GET", "http://example.com/essai");
        x.onload = resolve;
        x.onerror = () => reject(new Error("x"));
        x.send();
      }),
    );
    for (const [nom, url] of [["image externe", "http://example.com/essai.png"], ["image de l'application", `${appOrigine}/icone-256.png`]]) {
      await tenter(nom, () =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = () => reject(new Error("img"));
          img.src = url;
          setTimeout(() => reject(new Error("délai")), 3000);
        }),
      );
    }
    // Formulaire : form-action 'none' doit empêcher l'envoi (la page ne doit pas changer).
    const avant = location.href;
    const f = document.createElement("form");
    f.action = "http://example.com/essai";
    f.method = "post";
    document.body.appendChild(f);
    try {
      f.submit();
    } catch {
      /* refusé tout de suite */
    }
    await new Promise((r) => setTimeout(r, 500));
    sortie["formulaire"] = location.href === avant ? "refusé" : "réussi";
    // Navigation du cadre vers un site extérieur, et du sommet.
    try {
      window.top.location.href = "http://example.com/essai";
      sortie["navigation du sommet"] = "tentée";
    } catch {
      sortie["navigation du sommet"] = "refusé";
    }
    // Fenêtre.
    let fenetre = null;
    try {
      fenetre = window.open("http://example.com/essai", "_blank");
    } catch {
      /* refusé */
    }
    sortie["window.open"] = fenetre ? "réussi" : "refusé";
    return sortie;
  }, ORIGINE_APP);
  for (const nom of ["fetch externe", "fetch de l'API de l'application", "fetch de son propre serveur", "WebSocket", "XMLHttpRequest", "image externe", "image de l'application", "formulaire", "window.open"]) {
    essai(`bloqué pour le plugin : ${nom}`, reseau[nom] === "refusé", String(reseau[nom]));
  }
  await new Promise((r) => setTimeout(r, 800));
  const violations = await agenda.evaluate(() => window.__violations).catch(() => []);
  essai("la CSP du plugin a signalé les violations (connect-src, img-src)", ["connect-src", "img-src"].every((d) => violations.includes(d)), violations.join(", "));
  essai("le sommet n'a pas été redirigé par le plugin", new URL(page.url()).origin === ORIGINE_APP, page.url());
  essai("aucun nouvel onglet ou fenêtre n'a été ouvert", popups.length === 0, popups.join(", "));
  // Navigation du cadre lui-même vers l'extérieur : la CSP de l'application (frame-src) doit la refuser.
  await agenda.evaluate(() => {
    location.href = "http://example.com/essai";
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  essai("le cadre ne peut pas naviguer vers un site extérieur", page.frames().every((f) => { try { return new URL(f.url()).hostname !== "example.com"; } catch { return true; } }), page.frames().map((f) => f.url()).join(", "));
  essai("aucune requête n'est partie vers l'extérieur", sorties.length === 0, sorties.join(", "));

  // 2. Un plugin ne voit pas le stockage d'un autre. (Le cadre de agenda peut avoir été rechargé par l'essai précédent.)
  etape("Stockage séparé entre « agenda » et « finances »");
  const agendaAgain = await ouvrirDansLApplication(
    page,
    () => rouvrirAgenda(page),
    "agenda.localhost",
  );
  await agendaAgain.evaluate(() => {
    localStorage.setItem("secret-agenda", "valeur-agenda");
    document.cookie = "secret-agenda=1; path=/; Secure; SameSite=Strict";
    return caches.open("secret-agenda");
  });
  const finances = await ouvrirDansLApplication(
    page,
    async () => {
      await page.locator('button[data-plugin="finances"]').click();
      await page.locator("button.open").first().click();
    },
    "finances.localhost",
  );
  const vuDeFinances = await finances.evaluate(async () => ({
    local: localStorage.getItem("secret-agenda"),
    cookie: document.cookie,
    caches: await caches.keys(),
  }));
  essai("le localStorage de « agenda » est invisible depuis « finances »", vuDeFinances.local === null, JSON.stringify(vuDeFinances));
  essai("le cookie de « agenda » est invisible depuis « finances »", !vuDeFinances.cookie.includes("secret-agenda"), vuDeFinances.cookie);
  essai("le cache de « agenda » est invisible depuis « finances »", !vuDeFinances.caches.includes("secret-agenda"), vuDeFinances.caches.join(", "));
  const financesPrivee = await finances.evaluate(() => {
    localStorage.setItem("secret-finances", "valeur-finances");
    return location.origin;
  });
  const frameAgenda = page.frames().find((f) => estCadreApp(f, "agenda.localhost"));
  const retourAgenda = frameAgenda ? await frameAgenda.evaluate(() => ({ local: localStorage.getItem("secret-agenda"), autre: localStorage.getItem("secret-finances") })) : null;
  essai(
    "et réciproquement : « finances » n'écrit pas dans le stockage de « agenda »",
    !retourAgenda || retourAgenda.autre === null,
    `${financesPrivee} ${JSON.stringify(retourAgenda)}`,
  );

  // 5. Messages hostiles vers le garde de l'hôte.
  etape("Messages hostiles vers le garde de l'hôte");
  const cadre = await ouvrirDansLApplication(
    page,
    () => rouvrirAgenda(page),
    "agenda.localhost",
  );
  const HOSTILES = [
    ["valeur nulle", "nul"],
    ["texte au lieu d'un objet", "texte"],
    ["tableau", "tableau"],
    ["objet sans type", "sans-type"],
    ["type inconnu", "inconnu"],
    ["type __proto__", "proto"],
    ["type hérité de Object (constructor)", "constructor"],
    ["type hérité de Object (toString)", "tostring"],
    ["données en référence circulaire", "circulaire"],
    ["données de plus de 4 Mo", "enorme"],
    ["enregistrer un .exe sans permission", "exe"],
    ["imprimer sans permission", "imprimer"],
    ["envoyer à une autre mini-app sans permission", "envoyer"],
    ["ouvrir des réglages sans permission", "reglages"],
    ["publier un service non déclaré", "service"],
    ["hauteur non numérique", "hauteur-nan"],
    ["titre de 100 000 caractères", "titre-long"],
    ["copie dépassant 1 Mo", "copie-enorme"],
  ];
  for (const [nom, genre] of HOSTILES) {
    const avant = refus.length;
    await cadre.evaluate((g) => {
      const circ = {};
      circ.moi = circ;
      const messages = {
        nul: null,
        texte: "saveFile",
        tableau: [{ type: "ready" }],
        "sans-type": { data: 1 },
        inconnu: { type: "formatC:" },
        proto: JSON.parse('{"type":"__proto__","__proto__":{"type":"ready"}}'),
        constructor: { type: "constructor" },
        tostring: { type: "toString" },
        circulaire: { type: "pluginData", data: circ },
        enorme: { type: "update", data: "x".repeat(5 * 1024 * 1024) },
        exe: { type: "saveFile", file: { name: "virus.exe", extension: "exe", content: "MZ", description: "x" } },
        imprimer: { type: "print", fiche: {} },
        envoyer: { type: "send", kind: "tube", data: {} },
        reglages: { type: "openSettings", plugin: "fournisseurs" },
        service: { type: "provide", name: "fournisseurs", data: [] },
        "hauteur-nan": { type: "height", value: "haute" },
        "titre-long": { type: "title", title: "T".repeat(100_000) },
        "copie-enorme": { type: "copy", text: "c".repeat(2 * 1024 * 1024) },
      };
      window.__portHote.postMessage(messages[g]);
    }, genre);
    const vu = await attendre(() => refus.length > avant, 4000);
    essai(`message hostile refusé par le garde : ${nom}`, Boolean(vu), "aucun refus journalisé");
  }
  // Le moteur est toujours vivant et traite les messages permis : la hauteur est ramenée dans ses bornes.
  const avantValide = refus.length;
  await cadre.evaluate(() => window.__portHote.postMessage({ type: "height", value: 9_999_999 }));
  const hauteurBornee = await attendre(async () => (await page.locator('iframe[src*="/apps/"]').first().evaluate((f) => f.getBoundingClientRect().height)) === 20000, 4000);
  essai("le moteur survit aux messages hostiles et borne les hauteurs démesurées (20 000 px)", Boolean(hauteurBornee) && refus.length === avantValide);
  await cadre.evaluate(() => window.__portHote.postMessage({ type: "height", value: 480 }));
  // Messages sur window.parent (hors du port privé) : sans effet.
  await cadre.evaluate(() => window.parent.postMessage({ type: "saveFile", file: { name: "a.exe", extension: "exe", content: "", description: "" } }, "*"));
  await new Promise((r) => setTimeout(r, 500));
  essai("l'application n'a connu aucune erreur JavaScript pendant les essais", erreursPage.length === 0, erreursPage.join(" | "));
  await contexte.close();
}

async function essaisNavigateur() {
  const { chromium } = await import("@playwright/test");
  const local = "/opt/pw-browsers/chromium";
  const executablePath = process.env.ETABLI_CHROMIUM || (existsSync(local) ? local : undefined);
  navigateur = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  await essaisDansLApplication(navigateur);
}

// ——— Déroulement ———

async function principal() {
  if (!sansBuild) {
    etape("Construction (serveur, version web, plugins)");
    lancer("cargo", ["build", "-p", "etabli-serveur"]);
    lancer(npm, ["run", "build:web"]);
  } else if (!existsSync(join(racine, "apps", "desktop", "dist-web", "index.html"))) {
    throw new Error("--sans-build : apps/desktop/dist-web est absent.");
  }
  const clePublique = fabriquerPaquets();
  const code = await lancerServeur(clePublique);
  const contexte = await installerLesPlugins(code);
  if (pause) {
    console.log(`\nServeur prêt : ${ORIGINE_APP} (utilisateur « essai », mot de passe « ${MOT_DE_PASSE} »). Ctrl+C pour arrêter.`);
    await new Promise(() => {});
  }
  await essaisHotes();
  await essaisNavigateur();
}

let code = 0;
try {
  await principal();
} catch (erreur) {
  console.error(`\nErreur : ${erreur?.message ?? erreur}`);
  if (process.env.ETABLI_DEBUG) console.error(erreur?.stack);
  code = 1;
}
await nettoyer();
const rates = resultats.filter((r) => !r.ok);
console.log(`\n${resultats.length - rates.length}/${resultats.length} essais réussis.`);
if (rates.length) {
  console.error(`Échecs : ${rates.map((r) => r.nom).join(" ; ")}`);
  code = 1;
}
process.exit(code);
