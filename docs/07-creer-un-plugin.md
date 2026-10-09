# 07 — Créer un plugin (pages, apps, paramètres)

## Démarrage rapide

```bash
npm install
npm run nouveau-plugin -- soudage "Soudage"     # options : --couleur "#d9480f" --icone flame --reglages
npm run dev                                      # lance Établi avec votre plugin
npm run valider -- soudage                       # manifeste, journal, contenu
```

`nouveau-plugin` crée `plugins/soudage/` : manifeste (une app, une page, un paramètre), une page d'exemple (aire et périmètre d'un rectangle), son calcul
et ses tests, un `CHANGELOG.md`, et si vous le demandez une page de réglages. Le résultat compile, passe `npm run check` et
`npm run valider` : modifiez-le pas à pas. Avant de proposer le plugin : [CONTRIBUTING.md](../CONTRIBUTING.md#écrire-un-plugin).
Pour un exemple complet, lisez un plugin de `plugins/` (par exemple `plugins/finances`) ou le modèle créé par `nouveau-plugin`.

## 1. Structure d'un plugin

```
plugins/<id>/
  package.json          "name": "@etabli/plugin-<id>", scripts build / check / test
  tsconfig.json         copie de tolerie (resolveJsonModule si tables JSON)
  svelte.config.js      vitePreprocess
  vite.config.ts        une entrée par app : input: { <app>: app("<app>") }
  public/manifest.json  copié tel quel dans dist/ (ne jamais mettre de manifest.json à la racine)
  apps/<app>/index.html page de l'app (<div id="app">, script ./main.ts)
  apps/<app>/main.ts    import "@etabli/sdk/base.css"; mount(Composant, { target: … })
  apps/<app>/<App>.svelte
  src/<calcul>.ts       calculs purs, sans interface (testables)
  src/<calcul>.test.ts  tests Vitest
  src/data/*.json       tables de référence (avec leur source)
  CHANGELOG.md          une section par version (devient les « Nouveautés » du catalogue)
```

Puis `npm install` à la racine (lie le nouveau workspace), `npm run build -w @etabli/plugin-<id>`.
Le moteur trouve le plugin tout seul au prochain lancement (`plugins/<id>/dist/manifest.json`).

## 2. Manifeste (contrat 3)

```json
{
  "id": "courses",
  "name": "Courses",
  "version": "1.0.0",
  "apiVersion": "^3",
  "author": "Votre nom",
  "description": "Un budget par semaine, les tickets et la liste de courses",
  "color": "#c9661a",
  "icon": "store",
  "permissions": ["presse-papiers"],
  "apps": [
    { "id": "tableau", "name": "Tableau de bord", "entry": "apps/tableau/index.html", "accepts": [] },
    { "id": "liste", "name": "Liste de courses", "entry": "apps/liste/index.html", "accepts": [] }
  ],
  "pages": [
    { "id": "courses", "title": "Courses", "icon": "store", "layout": { "type": "app", "app": "tableau" } },
    { "id": "liste", "title": "Liste de courses", "icon": "file", "layout": { "type": "app", "app": "liste" } }
  ],
  "parameters": [
    { "id": "budget", "label": "Budget par semaine", "type": "number", "default": 70, "unit": "€", "min": 0, "step": 5, "group": "Budget" },
    { "id": "jour", "label": "Jour des courses", "type": "select", "default": "6", "options": [{ "value": "6", "label": "samedi" }, { "value": "0", "label": "dimanche" }], "group": "Budget" }
  ]
}
```

- **`apps`** : les pages HTML isolées du plugin (`entry`, chemin relatif au plugin). **`pages`** : ce que la colonne de gauche liste
  et qu'un onglet affiche : un titre, une icône, et `layout: { "type": "app", "app": "<id d'une app>" }` (la seule disposition
  pour l'instant). **Il n'y a pas de mode de compatibilité** : un plugin sans `pages` (ni `apps`) est refusé par `npm run valider`
  et par le moteur, qui l'affiche dans la page *Plugins* avec sa raison. Un plugin qui n'offre qu'un service déclare `"pages": []` et `"apps": []`.
  Le nom du plugin n'apparaît pas dans la colonne : seules les pages y sont, que l'utilisateur déplace à son gré.
- `id` (plugin, app, page) : minuscules, chiffres, tirets. L'identifiant d'une page sert aux favoris et à l'ordre de la colonne :
  ne le changez pas une fois le plugin distribué.
- `icon` : un nom de `apps/desktop/src/lib/icons.ts` ; sinon ajoutez l'icône Lucide dans ce fichier (import + entrée dans `ICONS`).
  Une icône inconnue devient « puzzle ». Il n'y a pas d'émoji : un plugin n'a qu'un nom d'icône et une couleur à fournir.
- `apiVersion` : `"^3"`. Le moteur contrôle **strictement** ce que fait le plugin.
- `permissions` : ce que le plugin a besoin de faire (`fichiers`, `presse-papiers`, `envoi`, `reglages`, `notifications`).
  L'utilisateur les voit avant d'installer. Déclarez le strict nécessaire ; `npm run valider` refuse l'usage d'une
  fonction sans sa permission. Détail et justification : [19](19-modele-de-menace-plugins.md).
- `accepts` : types de données que l'app sait recevoir (voir [09-bibliotheques-fiches-envoi.md](09-bibliotheques-fiches-envoi.md)).
- **`parameters`** (facultatif) : réglages que **l'utilisateur** fait dans Paramètres, dans un onglet que **le moteur** construit
  et nomme comme le plugin : aucun écran de réglages à écrire. Types : `number` (`default`, `unit`, `min`, `max`, `step`), `text`,
  `boolean`, `time` (« 08:30 »), `select` (`options: [{ value, label }]`). Chacun a un `id` (une lettre minuscule puis lettres
  et chiffres), un `label`, et facultativement `group` (titre de groupe) et `hint` (phrase d'aide). Le plugin les lit avec
  `new PluginParameters({ budget: 70, jour: "6" })` du kit (`params.values.budget`, réactif) ou `etabli.parameters.values` ; il ne les
  modifie pas. Une valeur hors bornes ou du mauvais type est refusée, la valeur par défaut s'applique.
- `dependencies` / `optionalDependencies` (facultatifs) : plugins dont le vôtre a besoin, ou dont il
  profite s'ils sont là, avec la plage de versions acceptée (`"fournisseurs": "^1"`). Voir
  « Dépendances et services » plus bas.
- `provides` (facultatif) : données que le plugin publie pour les autres (`"fournisseurs": "1"`).
- `functions` + `serviceEntry` (facultatifs) : fonctions que le plugin offre aux autres, et la page sans interface qui y répond.
  `services` + `permissions: ["appelle:<service>:<accès>"]` : côté appelant. Voir « Appeler la fonction d'un autre plugin »
  plus bas.
- `settings` (facultatif) : pages de réglages **HTML** que le plugin ajoute à Paramètres → Plugins, quand `parameters` ne suffit
  pas (un tableau de machines, par exemple). L'identifiant `parametres` est réservé.
- Distribution : le plugin n'est pas dans l'installateur du moteur ; il s'installe depuis un fichier `.etapl` signé, ou une
  distribution l'embarque (voir [27](27-building-a-distribution.md)). En développement, les plugins du dépôt sont chargés directement (« intégrés »).

## 3. Modèle de page

Une page affiche une app sur toute la zone et **dessine elle-même son en-tête** (le moteur ne met ni titre, ni « Nouveau », ni liste
d'anciens calculs autour). Les données du plugin vivent dans `PluginSettings` (partagées par toutes ses pages, enregistrées par le
moteur) et dans les services ; il n'y a plus de « calcul » enregistré par le moteur.

```svelte
<script lang="ts">
  // <Nom> : ce que fait la page, en une phrase.
  import { Card, Field, PluginParameters, PluginSettings, Result, evaluate, format } from "@etabli/ui";
  import { calcule, type Resultat } from "../../src/calcul";

  const saisie = new PluginSettings({ a: "", b: "" });        // enregistré par le moteur à chaque changement
  const params = new PluginParameters({ decimales: 0 });      // réglé dans Paramètres, onglet du plugin

  const num = (text: string) => (text.trim() === "" ? NaN : evaluate(text));

  function solve(d: { a: string; b: string }): Resultat | string {
    if (d.a.trim() === "") return "Renseignez a.";           // une phrase qui dit quoi faire
    return calcule(num(d.a), num(d.b));                       // renvoie un message si impossible
  }

  const result = $derived(solve(saisie.data));
  const r = $derived(typeof result === "string" ? null : result);
</script>

<h1>Mon calcul</h1>
<div class="split">
  <Card title="Entrées">
    <Field label="Côté a" unit="mm" bind:value={saisie.data.a} />
    <Field label="Côté b" unit="mm" bind:value={saisie.data.b} placeholder={r ? format(r.b) : ""} />
  </Card>
  <Card title="Résultats">
    {#if r}
      <Result label="x" value={r.x} unit="mm" decimals={Number(params.values.decimales)} big />
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

Pour un calcul long (optimisation), calculer dans un `$effect` avec un délai (250 ms) sur un instantané JSON des données.
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
- [ ] Tout en français ; unités : mm, degrés, kg, N, MPa (tonnes en complément pour les presses).
- [ ] Couleurs par variables CSS, arrondis `var(--r-sm)` / `var(--r-md)`.
- [ ] Aucun accès réseau ni disque, aucune dépendance lourde sans chargement à la demande.
- [ ] `npm run check`, `npm test`, `npm run build:plugins` et `npm run valider -- <id>` sans erreur.
- [ ] `CHANGELOG.md` du plugin : une section datée pour la version du manifeste, écrite pour l'utilisateur.

## Dépendances et services

Chaque plugin reste indépendant (son dossier, sa version, ses données, installé et désinstallé seul).
Deux plugins ne se parlent **jamais** directement : le moteur fait circuler les données.

**Page de réglages.** Déclarez `settings` dans le manifeste et écrivez la page comme une mini-app
(HTML + Svelte, dossier `reglages/`, une entrée de plus dans `vite.config.ts`). Le moteur l'affiche dans
Paramètres → Plugins, sous le nom donné, dans le même cadre isolé. La page reçoit son adresse avec une
intention éventuelle (`location.hash`, ex. `#add=scie`, jamais rejouée au retour sur la page). Modèle :
`plugins/machines`.

**Publier des données.** Déclarez `provides: { "nom": "1" }` (version du contrat) et publiez avec
`new PluginSettings(defauts, clean, "nom")` du kit : les réglages sont enregistrés **et** publiés. Le
contrat (forme des données) doit être documenté ; il ne change pas sans changer de version majeure.
Contrats officiels : `fournisseurs@1`, `machines@1` (docs/09).

**Lire les données d'un autre plugin.** Déclarez la dépendance, puis `etabli.services.get("nom")`
(lecture seule, `null` si absent).
- `dependencies` : sans ce plugin, le vôtre ne marche pas. Le moteur affiche « Il faut installer X »
  avec un bouton à la place de vos mini-apps ; installer votre plugin installe aussi X (après confirmation).
- `optionalDependencies` : votre plugin marche sans, en mieux avec. Le catalogue propose de les installer
  avec, case cochée par défaut ; ne mettez ici que ce qui est vraiment facultatif et **testez sans**.
- Plages de versions (`@etabli/sdk/deps`, `satisfies`) : `^1` (toute version 1.x), `^1.2`, `~1.2`, `1.x`,
  `>=1.2 <2`, `*`. Une version 2.0 d'un fournisseur n'active pas les plugins qui exigent `^1`.
- Désinstaller ou désactiver un plugin dont d'autres ont besoin demande confirmation et les entraîne.
  Les données sont **gardées**. Pas de cycle entre plugins.
**Appeler la fonction d'un autre plugin.** Quand lire un instantané ne suffit pas (ajouter une écriture chez `finances`, un rappel
dans `agenda`), le plugin appelle une **fonction de service** : `await etabli.services.call("finances", "ecritures.ajouter", args)`
rend `{ ok: true, valeur }` ou `{ ok: false, code, message }`, jamais d'exception. Il faut, côté appelant, la permission
`appelle:<service>:<lecture|ecriture>`, la plage de contrat `services` et la dépendance ; côté fournisseur, `functions`, `serviceEntry`
et `etabli.services.handle(...)`. **Écrivez toujours le mode dégradé** : fournisseur absent (`service_absent`), trop ancien
(`contrat_incompatible`), lent (`delai_depasse`) ; rejouez les écritures avec la même `cle`. Détail, codes d'erreur, garanties :
[06](06-protocole-sdk.md#appeler-la-fonction-dun-autre-plugin-docs24-a12) ; menaces : [19](19-modele-de-menace-plugins.md).
Exemple complet : `fixtures/appels-entre-plugins/` (deux plugins de test, non distribués).

## Plugins tiers

Un utilisateur peut déposer un plugin compilé (manifeste + fichiers) dans `<config>/plugins/<id>/`.
Il est chargé comme les officiels, sans le badge « officiel ». Le catalogue officiel est décrit dans [14](14-publier-une-version.md).
