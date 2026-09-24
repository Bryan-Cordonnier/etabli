# 07 — Créer un plugin ou une mini-app

Le plus simple : **copier le plugin `plugins/tolerie`** (petit, récent, complet) et l'adapter.

## 1. Structure d'un plugin

```
plugins/<id>/
  package.json          "name": "@etabli/plugin-<id>", scripts build / check / test
  tsconfig.json         copie de tolerie (resolveJsonModule si tables JSON)
  svelte.config.js      vitePreprocess
  vite.config.ts        une entrée par mini-app : input: { <app>: app("<app>") }
  public/manifest.json  copié tel quel dans dist/ (ne jamais mettre de manifest.json à la racine)
  apps/<app>/index.html page de la mini-app (<div id="app">, script ./main.ts)
  apps/<app>/main.ts    import "@etabli/sdk/base.css"; mount(Composant, { target: … })
  apps/<app>/<App>.svelte
  src/<calcul>.ts       calculs purs, sans interface (testables)
  src/<calcul>.test.ts  tests Vitest
  src/data/*.json       tables de référence (avec leur source)
```

Puis `npm install` à la racine (lie le nouveau workspace), `npm run build -w @etabli/plugin-<id>`.
Le moteur trouve le plugin tout seul au prochain lancement (`plugins/<id>/dist/manifest.json`).

## 2. Manifeste

```json
{
  "id": "tolerie",
  "name": "Tôlerie",
  "version": "1.0.0",
  "apiVersion": "^1",
  "author": "Établi",
  "description": "Pliage : développés, vé et effort de presse",
  "color": "#ea7a1a",
  "emoji": "🔨",
  "icon": "hammer",
  "permissions": [],
  "miniApps": [
    {
      "id": "developpe",
      "name": "Développé de pliage",
      "description": "Longueur du flan, lignes de pli",
      "icon": "bend",
      "emoji": "📃",
      "dataVersion": 1,
      "plannedFor": "v1",
      "entry": "apps/developpe/index.html",
      "accepts": []
    }
  ]
}
```

- `id` (plugin et mini-app) : minuscules, chiffres, tirets. **Ne jamais changer l'id d'une mini-app
  qui a des calculs enregistrés** (ils y sont rattachés).
- `icon` : un nom de `apps/desktop/src/lib/icons.ts` ; sinon ajoutez l'icône Lucide dans ce fichier
  (import + entrée dans `ICONS`). Une icône inconnue devient « puzzle ».
- `entry` absent : la mini-app s'affiche « à venir » (placeholder).
- `dataVersion` : à incrémenter quand le format des données change (et prévoir `migrate`).
- `accepts` : types de données que la mini-app sait recevoir (voir
  [09-bibliotheques-fiches-envoi.md](09-bibliotheques-fiches-envoi.md)).
- Ordre dans la colonne : pour un plugin officiel, ajoutez son id à `OFFICIAL_ORDER` dans
  `apps/desktop/src/lib/plugins/registry.ts`.

## 3. Modèle de mini-app

```svelte
<script lang="ts">
  // <Nom> (cahier des charges des plugins, section X) : ce que fait la mini-app, en une phrase.
  import { Card, Field, MiniAppDocument, Result, evaluate, format } from "@etabli/ui";
  import { calcule, type Resultat } from "../../src/calcul";

  interface Data {
    a: string; // texte saisi, calculs acceptés
    b: string;
  }

  const num = (text: string) => (text.trim() === "" ? NaN : evaluate(text));

  function solve(d: Data): Resultat | string {
    if (d.a.trim() === "") return "Renseignez a.";           // une phrase qui dit quoi faire
    return calcule(num(d.a), num(d.b));                       // renvoie un message si impossible
  }

  const doc = new MiniAppDocument<Data>({ a: "", b: "" }, (d) => {
    const r = solve(d);
    return typeof r === "string" ? "" : `x = ${format(r.x)} mm`; // résumé des anciens calculs
  });

  const result = $derived(solve(doc.data));
  const r = $derived(typeof result === "string" ? null : result);
</script>

<div class="split">
  <Card title="Entrées">
    <Field label="Côté a" unit="mm" bind:value={doc.data.a} />
    <Field label="Côté b" unit="mm" bind:value={doc.data.b} placeholder={r ? format(r.b) : ""} />
  </Card>
  <Card title="Résultats">
    {#if r}
      <Result label="x" value={r.x} unit="mm" big oncopy={doc.copy} />
    {:else}
      <p class="empty">{result}</p>
    {/if}
  </Card>
</div>

<style>
  .split { display: grid; grid-template-columns: 340px 1fr; gap: 16px; align-items: start; }
  @media (max-width: 720px) { .split { grid-template-columns: 1fr; } }
  .empty { margin: 0; padding: 24px 0; text-align: center; font-size: 12.5px; color: var(--faint); }
</style>
```

Pour un calcul long (optimisation), calculer dans un `$effect` avec un délai (250 ms) sur un
instantané JSON de `doc.data`, comme `plugins/economie/apps/debit-tubes/DebitTubes.svelte`.

## 4. Calculs et tests

- Les formules vont dans `src/*.ts`, **sans Svelte** : fonctions pures qui renvoient un résultat ou
  un message d'erreur en français (`Resultat | string`).
- Chaque formule a **au moins trois cas vérifiés à la main** (ou tirés d'un abaque) et les cas
  limites (valeur nulle, impossible). Reprendre les cas de test du cahier des charges des plugins.
- `npm test -w @etabli/plugin-<id>`.

## 5. Liste de contrôle avant commit

- [ ] Entrées à gauche, résultats à droite ; une colonne sous 720 px (l'aperçu rapide fait 1000 × 680).
- [ ] Jamais de résultat faux affiché : une phrase qui dit quoi corriger.
- [ ] Valeurs calculées en filigrane (`placeholder`) dans les champs vides.
- [ ] Un clic sur un résultat le copie (`Result`), tableaux copiables vers Excel si utile.
- [ ] Schéma à l'échelle quand la géométrie s'y prête (SVG, couleurs du thème `var(--…)`).
- [ ] Résumé court pour les anciens calculs.
- [ ] Tout en français ; unités : mm, degrés, kg, N, MPa (tonnes en complément pour les presses).
- [ ] Couleurs par variables CSS, arrondis `var(--r-sm)` / `var(--r-md)`.
- [ ] Aucun accès réseau ni disque, aucune dépendance lourde sans chargement à la demande.
- [ ] `npm run check`, `npm test`, `npm run build:plugins` sans erreur.

## Plugins tiers

Un utilisateur peut déposer un plugin compilé (manifeste + fichiers) dans `<config>/plugins/<id>/`.
Il est chargé comme les officiels, sans le badge « officiel ». Le catalogue en ligne n'existe pas encore.
