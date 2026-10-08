// Crée un plugin prêt à compiler, avec une page d'exemple, ses tests et son journal des changements :
//
//   node scripts/nouveau-plugin.mjs soudage "Soudage"
//   node scripts/nouveau-plugin.mjs soudage "Soudage" --couleur "#d9480f" --icone flame
//   node scripts/nouveau-plugin.mjs soudage "Soudage" --reglages     (ajoute une page de réglages)
//
// Ensuite : « npm install » (lie le nouveau plugin), « npm run dev », « npm run valider -- soudage ».
// Le guide est docs/07-creer-un-plugin.md.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { iconesConnues } from "./valider-plugin.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const ID = /^[a-z][a-z0-9-]{1,40}$/;
const RESERVES = new Set(["moteur", "sdk", "ui", "plugins", "test", "essai", "exemple"]);

const pascal = (texte) =>
  texte
    .split("-")
    .map((mot) => mot.charAt(0).toUpperCase() + mot.slice(1))
    .join("");

/** Les fichiers du plugin : chemin relatif → contenu. */
export function fichiersDuPlugin({ id, nom, couleur, icone, reglages, date }) {
  const composant = pascal(id);
  const files = {};

  files["package.json"] = `${JSON.stringify(
    {
      name: `@etabli/plugin-${id}`,
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: { build: "vite build", check: "svelte-check --tsconfig ./tsconfig.json", test: "vitest run" },
      dependencies: { "@etabli/sdk": "*", "@etabli/ui": "^0.1.0" },
      devDependencies: {
        "@sveltejs/vite-plugin-svelte": "^7.3.1",
        "@tsconfig/svelte": "^5.0.8",
        "@types/node": "^26.6.3",
        svelte: "^5.57.1",
        "svelte-check": "^4.7.6",
        typescript: "^7.0.2",
        vite: "^8.3.1",
        vitest: "^5.0.2",
      },
    },
    null,
    2,
  )}\n`;

  files["tsconfig.json"] = `${JSON.stringify(
    {
      extends: "@tsconfig/svelte/tsconfig.json",
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        noUncheckedIndexedAccess: true,
        isolatedModules: true,
        verbatimModuleSyntax: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        types: ["vite/client", "node"],
      },
      include: ["apps/**/*.ts", "apps/**/*.svelte", ...(reglages ? ["reglages/**/*.ts", "reglages/**/*.svelte"] : []), "src/**/*.ts", "src/**/*.svelte", "vite.config.ts"],
    },
    null,
    2,
  )}\n`;

  files["svelte.config.js"] = `import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
};
`;

  files["vite.config.ts"] = `/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Une page HTML par app${reglages ? " (et une pour la page de réglages)" : ""}. Le dossier public/ (manifest.json) est copié tel quel dans dist/.
const page = (chemin: string) => fileURLToPath(new URL(\`./\${chemin}/index.html\`, import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [svelte()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome120",
    rollupOptions: {
      input: {
        exemple: page("apps/exemple"),${reglages ? '\n        reglages: page("reglages"),' : ""}
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
`;

  const manifeste = {
    id,
    name: nom,
    version: "0.1.0",
    apiVersion: "^3",
    author: "Votre nom",
    description: "Une phrase qui dit ce que fait le plugin (elle s'affiche dans la page des plugins).",
    color: couleur,
    icon: icone,
    permissions: ["presse-papiers"],
    ...(reglages ? { settings: [{ id: "reglages", title: nom, entry: "reglages/index.html" }] } : {}),
    // Une app est une page HTML isolée ; une page est ce que la colonne de gauche liste et qu'un onglet affiche.
    apps: [{ id: "exemple", name: "Exemple : rectangle", entry: "apps/exemple/index.html", accepts: [] }],
    pages: [{ id: "exemple", title: "Exemple : rectangle", icon: icone, layout: { type: "app", app: "exemple" } }],
    // Les paramètres déclarés ont leur onglet dans Paramètres : aucun écran de réglages à écrire.
    parameters: [{ id: "decimales", label: "Décimales affichées", type: "number", default: 0, min: 0, max: 3, step: 1, group: "Affichage", hint: "pour l'aire" }],
  };  files["public/manifest.json"] = `${JSON.stringify(manifeste, null, 2)}\n`;

  files["CHANGELOG.md"] = `# ${nom} : journal des changements

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).
Chaque version a sa section ; elle sert de notes de version du plugin.

## [Non publié]

## [0.1.0] — ${date}

Première version.

### Ajouté

- Une page d'exemple (aire et périmètre d'un rectangle), à remplacer par les vôtres.
`;

  files["README.md"] = `# ${nom}

Plugin pour [Établi](https://github.com/etable-project/etable). Décrivez ici ce qu'il calcule et d'où viennent
les formules (normes, catalogues, ouvrages) : c'est ce que les relecteurs regarderont en premier.

\`\`\`bash
npm run dev                       # lance Établi avec ce plugin
npm test -w @etabli/plugin-${id}       # tests des calculs
npm run valider -- ${id}          # vérifie le manifeste et le contenu
\`\`\`

Guide : [docs/07-creer-un-plugin.md](../../docs/07-creer-un-plugin.md).
`;

  files["src/exemple.ts"] = `// Les calculs sont des fonctions pures, sans interface : faciles à tester. Elles renvoient un résultat,
// ou une phrase en français qui dit quoi corriger : jamais un résultat faux.

export interface Rectangle {
  aire: number;
  perimetre: number;
}

/** Aire et périmètre d'un rectangle de côtés a et b (mm). */
export function rectangle(a: number, b: number): Rectangle | string {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "Saisissez les deux côtés.";
  if (a <= 0 || b <= 0) return "Les côtés doivent être plus grands que zéro.";
  return { aire: a * b, perimetre: 2 * (a + b) };
}
`;

  files["src/exemple.test.ts"] = `import { describe, expect, it } from "vitest";
import { rectangle } from "./exemple";

// Chaque formule a au moins trois cas vérifiés à la main, plus les cas limites.
describe("rectangle", () => {
  it("calcule l'aire et le périmètre", () => {
    expect(rectangle(100, 50)).toEqual({ aire: 5000, perimetre: 300 });
    expect(rectangle(2.5, 4)).toEqual({ aire: 10, perimetre: 13 });
    expect(rectangle(1, 1)).toEqual({ aire: 1, perimetre: 4 });
  });

  it("dit quoi corriger plutôt que de donner un résultat faux", () => {
    expect(rectangle(0, 50)).toBe("Les côtés doivent être plus grands que zéro.");
    expect(rectangle(-3, 50)).toBe("Les côtés doivent être plus grands que zéro.");
    expect(rectangle(Number.NaN, 50)).toBe("Saisissez les deux côtés.");
  });
});
`;

  files["apps/exemple/index.html"] = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Exemple : rectangle</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
`;

  files["apps/exemple/main.ts"] = `import "@etabli/sdk/base.css";
import { mount } from "svelte";
import Exemple from "./Exemple.svelte";

mount(Exemple, { target: document.getElementById("app")! });
`;

  files["apps/exemple/Exemple.svelte"] = `<script lang="ts">
  // Exemple : aire et périmètre d'un rectangle. Remplacez les champs et le calcul (src/exemple.ts).
  // PluginSettings enregistre la saisie dans les données du plugin ; PluginParameters lit le paramètre « decimales »
  // déclaré dans le manifeste (réglé par l'utilisateur dans Paramètres).
  import { Card, Field, PluginParameters, PluginSettings, Result, evaluate } from "@etabli/ui";
  import { rectangle } from "../../src/exemple";

  const saisie = new PluginSettings({ a: "", b: "" }); // texte saisi : les calculs (« 1200 - 2*15 ») sont acceptés par Field
  const params = new PluginParameters({ decimales: 0 });

  const nombre = (texte: string) => (texte.trim() === "" ? Number.NaN : evaluate(texte));
  const resultat = $derived(rectangle(nombre(saisie.data.a), nombre(saisie.data.b)));
  const r = $derived(typeof resultat === "string" ? null : resultat);
</script>

<header class="entete"><h1>Exemple : rectangle</h1></header>
<div class="split">
  <Card title="Entrées">
    <Field label="Côté a" unit="mm" bind:value={saisie.data.a} />
    <Field label="Côté b" unit="mm" bind:value={saisie.data.b} />
  </Card>
  <Card title="Résultats">
    {#if r}
      <Result label="Aire" value={r.aire} unit="mm²" decimals={Number(params.values.decimales)} big />
      <Result label="Périmètre" value={r.perimetre} unit="mm" />
    {:else}
      <p class="empty">{resultat}</p>
    {/if}
  </Card>
</div>

<style>
  .entete h1 {
    margin: 0 0 14px;
    font-size: 22px;
  }
  .split {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 720px) {
    .split {
      grid-template-columns: 1fr;
    }
  }
  .empty {
    margin: 0;
    padding: 24px 0;
    text-align: center;
    font-size: 12.5px;
    color: var(--faint);
  }
</style>
`;
  if (reglages) {
    files["reglages/index.html"] = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${nom}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
`;
    files["reglages/main.ts"] = `import "@etabli/sdk/base.css";
import { mount } from "svelte";
import Reglages from "./Reglages.svelte";

mount(Reglages, { target: document.getElementById("app")! });
`;
    files["reglages/Reglages.svelte"] = `<script lang="ts">
  // Page de réglages du plugin : elle apparaît dans Paramètres → Plugins tant que le plugin est installé.
  // PluginSettings enregistre les réglages automatiquement. Pour PUBLIER des données aux autres plugins,
  // déclarez « provides » dans le manifeste et passez le nom du service en troisième argument
  // (voir plugins/finances et docs/07-creer-un-plugin.md#dépendances-et-services).
  import { Field, PluginSettings } from "@etabli/ui";

  const reglages = new PluginSettings({ nom: "" });
</script>

<p class="intro">Réglages du plugin ${nom}. Ils sont partagés par toutes ses pages.</p>
<Field label="Un réglage d'exemple" numeric={false} bind:value={reglages.data.nom} />

<style>
  .intro {
    margin: 0 0 12px;
    color: var(--muted);
    font-size: 13px;
  }
</style>
`;
  }

  return files;
}

/** Crée le plugin dans `racineDesPlugins` ; renvoie la liste des fichiers écrits. */
export function creerPlugin(options, racineDesPlugins = join(RACINE, "plugins")) {
  const { id } = options;
  if (!ID.test(id)) throw new Error("L'identifiant doit commencer par une lettre et ne contenir que des minuscules, des chiffres et des tirets (2 à 41 caractères).");
  if (RESERVES.has(id)) throw new Error(`L'identifiant « ${id} » est réservé : choisissez-en un autre.`);
  if (!/^#[0-9a-fA-F]{6}$/.test(options.couleur)) throw new Error("La couleur doit avoir la forme « #d9480f ».");
  const dossier = join(racineDesPlugins, id);
  if (existsSync(dossier)) throw new Error(`Le dossier ${dossier} existe déjà.`);
  const files = fichiersDuPlugin(options);
  for (const [chemin, contenu] of Object.entries(files)) {
    const fichier = join(dossier, chemin);
    mkdirSync(dirname(fichier), { recursive: true });
    writeFileSync(fichier, contenu, "utf8");
  }
  return { dossier, fichiers: Object.keys(files) };
}

// ——— Ligne de commande ———
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const option = (nom) => {
    const i = args.indexOf(nom);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const positionnels = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.match(/^--(couleur|icone|dossier)$/));
  const [id, nom] = positionnels;
  if (!id || !nom) {
    console.error('Usage : npm run nouveau-plugin -- <identifiant> "<Nom affiché>" [--couleur "#d9480f"] [--icone puzzle] [--reglages]');
    process.exit(1);
  }
  const icone = option("--icone") ?? "puzzle";
  if (!iconesConnues().has(icone)) {
    console.error(`Icône « ${icone} » inconnue. Choisissez parmi : ${[...iconesConnues()].join(", ")}.`);
    process.exit(1);
  }
  try {
    const dossierPlugins = option("--dossier") ? resolve(option("--dossier")) : join(RACINE, "plugins");
    const { dossier, fichiers } = creerPlugin(
      {
        id,
        nom,
        couleur: option("--couleur") ?? "#4f46e5",
        icone,
        reglages: args.includes("--reglages"),
        date: new Date().toISOString().slice(0, 10),
      },
      dossierPlugins,
    );
    console.log(`Plugin créé : ${dossier} (${fichiers.length} fichiers)\n`);
    console.log("Ensuite :");
    console.log("  1. npm install                       (lie le nouveau plugin au dépôt)");
    console.log("  2. npm run dev                       (lance Établi avec votre plugin)");
    console.log(`  3. npm run valider -- ${id}          (vérifie le manifeste et le contenu)`);
    console.log(`  4. Éditez plugins/${id}/public/manifest.json (auteur, description) et remplacez la page d'exemple.`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
