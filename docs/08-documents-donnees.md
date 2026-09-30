# 08 — Documents et données enregistrées

## Emplacements

| Contenu | Production | Développement (`ETABLI_DATA_DIR`) |
| --- | --- | --- |
| Calculs `.etabli` | `Documents\Etabli\<pluginId>\` | `%ETABLI_DATA_DIR%\documents\<pluginId>\` |
| Corbeille | `Documents\Etabli\.corbeille\` | idem sous `documents` |
| `settings.json` | `%APPDATA%\Etabli\` | `%ETABLI_DATA_DIR%\config\` |
| Réglages de plugin, services publiés par les plugins | `%APPDATA%\Etabli\donnees\` | `%ETABLI_DATA_DIR%\config\donnees\` |
| Plugins de l'utilisateur | `%APPDATA%\Etabli\plugins\` | `%ETABLI_DATA_DIR%\config\plugins\` |

Dans l'aperçu navigateur (sans Rust), tout est dans `localStorage` : `etabli.preview-documents`,
`etabli.preview-data.<nom>`, `etabli.settings`, `etabli.session`.

## Fichier `.etabli`

Nom : `<titre en slug>-<8 premiers caractères de l'id>.etabli` (renommé quand le titre change).
Contenu (JSON, `documents.rs`) :

```json
{
  "format": 1,
  "id": "3f2a9c1e…",            // 32 caractères hexadécimaux
  "pluginId": "economie",
  "appId": "debit-tubes",
  "dataVersion": 2,
  "title": "Châssis remorque v2",
  "summary": "3 barres · 94 % utilisé",
  "created": 1790000000000,     // ms depuis 1970
  "modified": 1790000000000,
  "appVersion": "0.1.0",
  "data": { … }                 // propre à la mini-app : les textes des champs
}
```

Écriture atomique (fichier `.tmp` puis renommage). Supprimer = déplacer dans `.corbeille`.

## Cycle de vie d'un calcul (`lib/documents.svelte.ts`)

- Un **nouveau calcul n'est pas enregistré** tant que l'utilisateur n'a rien modifié : pas de fichiers vides.
- Chaque `update` de la mini-app relance un minuteur d'**1 s** ; les écritures passent l'une après
  l'autre (un nouveau calcul n'est jamais créé deux fois).
- Au premier enregistrement, l'onglet reçoit l'`id` (`tabs.setDocId`) sans recréer l'écran.
- Dupliquer : copie avec « (copie) » dans le titre. En quittant l'écran : enregistrement immédiat.

## Évolution du format des données d'une mini-app

1. Incrémenter `dataVersion` dans le manifeste (informatif, enregistré dans le fichier).
2. Passer une fonction `migrate(saved)` à `MiniAppDocument` : elle reçoit l'ancien objet et renvoie
   le nouveau format. Les champs absents prennent la valeur par défaut.
   Exemples : `DebitTubes.svelte` (profilé en texte → type et dimensions, pièces sans angles) et
   `Calepinage.svelte` (ancien calepinage de rectangles → cisaille).
3. Ne jamais casser la lecture d'un ancien calcul : les élèves se passent leurs fichiers.

## `settings.json`

Deux clés : `settings` (réglages de `lib/state/settings.svelte.ts`) et `session` (vues des onglets
ouverts et onglet actif, restaurés au démarrage). Rust en lit `closeToTray` et `quickShortcut` au
démarrage. Enregistrement différé de 300 ms.

## `donnees/*.json`

| Fichier | Contenu | Absent → |
| --- | --- | --- |
| `plugin.<id>.json` | réglages d'un plugin (`PluginSettings`) | valeurs par défaut du plugin |
| `service.<plugin>.<nom>.json` | données qu'un plugin publie pour les autres (`fournisseurs`, `machines`) | rien publié : les plugins qui les lisent n'ont ni fournisseur ni machine |
| `fournisseurs.json`, `machines.json` | **anciens** fichiers de la 0.2 : lus une seule fois pour être repris dans les plugins Fournisseurs et Machines, jamais effacés | ignorés |

Écrits 400 ms après la dernière modification ; tant qu'une écriture est en attente, la relecture
du disque est ignorée (sinon elle écraserait la saisie). Voir `lib/dataFiles.ts`, `lib/state/pluginData.svelte.ts` et `lib/state/services.svelte.ts`.

## Pas encore fait

- **Projets** (cahier des charges des plugins, section 3.1) : un dossier par projet, un sous-dossier
  par plugin, calculs déplacés dans le projet, ouverture d'un projet partagé, double-clic sur un
  `.etabli` dans l'Explorateur. Rien n'est codé.
