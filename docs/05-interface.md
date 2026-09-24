# 05 — Interface hôte (`apps/desktop/src`)

L'interface hôte est tout ce qui n'est pas dans une mini-app : colonne, onglets, pages, paramètres,
aperçu rapide. Svelte 5 (runes), sans SvelteKit ni routeur : la « page » affichée est l'état de
l'onglet actif.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `main.ts`, `App.svelte` | fenêtre principale : colonne + barre d'onglets + page de l'onglet actif, écoute des demandes de l'aperçu |
| `apercu.ts`, `Apercu.svelte` | aperçu rapide |
| `app.css` | variables de design (thème Clair par défaut, Sombre si Windows est sombre), classes communes (`.page`, `.box`, `.btn`, `.pill`, `.hint`…), animations |
| `lib/api.ts` | appels Rust (`api`, `system`) et remplacements pour le navigateur |
| `lib/storage.ts` | cache synchrone de `settings.json` (`load`, `save` différé de 300 ms, `reloadStorage`) |
| `lib/state/settings.svelte.ts` | réglages (`settings`) : thème, thèmes importés, style d'icônes, animations, taille du texte, colonne (repliée, largeur), favoris, plugins désactivés, ordre des plugins, raccourci, zone de notification, auteur des fiches |
| `lib/state/tabs.svelte.ts` | onglets (`tabs`) : ouverture, navigation, historique par onglet, onglets fermés, persistance de la session |
| `lib/state/ui.svelte.ts` | palette ouverte, notification (toast 4 s), focus de la recherche |
| `lib/state/libraries.svelte.ts` | bibliothèques Fournisseurs et Machines, réglages des plugins (`libraries`) |
| `lib/documents.svelte.ts` | `DocumentSession` : un calcul ouvert (chargement, enregistrement différé, historique, duplication, corbeille) |
| `lib/plugins/registry.ts` | `PLUGINS`, `loadPlugins`, validation des manifestes, `pluginUrl`, recherche de mini-apps, ordre officiel |
| `lib/views.ts` | titre, icône et couleur d'une vue ; `normalize` (recherche sans accents) |
| `lib/shortcuts.ts` | raccourcis clavier globaux (aussi transmis par les mini-apps) |
| `lib/themes.ts`, `lib/appearance.ts` | thèmes et application de l'apparence (thème, animations réduites, zoom) |
| `lib/icons.ts` | liste fermée des icônes Lucide utilisables par les manifestes |
| `lib/print/print.ts`, `lib/print/fiche.css` | impression des fiches d'atelier |
| `lib/machines.ts`, `lib/send.ts` | « + Ajouter une machine… » et envoi entre mini-apps (fenêtre principale) |
| `lib/components/*` | composants (voir plus bas) |
| `lib/pages/*` | `Home`, `PluginPage`, `MiniAppPage`, `SettingsPage` |

## Vues et navigation

`View` (`lib/types.ts`) : `home`, `plugin` (grille d'un plugin), `app` (mini-app, avec `docId`
facultatif et un `nonce` qui force la recréation de l'écran), `settings` (avec `section`).

Règles de `tabs.navigate` (cahier des charges, section 5.7) :
- une mini-app en cours n'est **jamais remplacée** : naviguer depuis elle ouvre un nouvel onglet ;
- un document déjà ouvert : on bascule sur son onglet ;
- un seul onglet Paramètres ;
- Ctrl+clic ou clic molette : nouvel onglet.

`App.svelte` recrée l'écran quand la clé de la vue change (fondu d'entrée), mais pas quand un
nouveau calcul reçoit son identifiant au premier enregistrement (`tabs.setDocId`).

Raccourcis (`lib/shortcuts.ts`) : Ctrl+K palette, Ctrl+T nouvel onglet, Ctrl+W fermer,
Ctrl+Maj+T rouvrir, Ctrl+Tab / Ctrl+Maj+Tab, Ctrl+1…9, Ctrl+B replier la colonne, Alt+← page
précédente, bouton « précédent » de la souris. Les mini-apps transmettent ces touches
(`isHostShortcut` dans le protocole).

## Pages

- **Accueil** : recherche de mini-apps (sans accents), favoris, calculs récents.
- **Page de plugin** : grille de ses mini-apps (tuiles `AppCard` avec étoile de favori), calculs récents du plugin. Un plugin à une seule mini-app l'ouvre directement depuis la colonne.
- **Mini-app** : fil d'Ariane, titre du calcul modifiable, Nouveau, Dupliquer, Corbeille, cadre de la mini-app, anciens calculs (`PastCalcs` : recherche, 5 par page).
- **Paramètres** : sections Général, Apparence, Bibliothèques, Plugins, Aperçu rapide, Raccourcis
  clavier, Mises à jour et à propos.

## Composants

`Sidebar` (colonne : plugins réordonnables par glisser, repliable avec animation, largeur 200–300 px
redimensionnable, bande Paramètres/Replier en bas), `TabBar` (onglets de **180 px fixes**, défilement
à la molette avec fondu aux bords, glisser pour réordonner, clic molette pour fermer, bouton « + »),
`WindowControls`, `CommandPalette`, `MiniAppFrame` (cadre isolé + protocole), `PastCalcs`,
`RecentDocs`, `AppCard`, `Tile` (icône colorée ou émoji), `SearchBox`, `ShortcutRecorder`,
`Switch`, `Toast`, `Logo`, `Icon`, `SuppliersEditor`, `MachinesEditor`.

## Thèmes et design

- Variables de couleur (`THEME_TOKENS` dans `lib/themes.ts`) : `page`, `surface`, `surface-2`,
  `field`, `border`, `text`, `muted`, `faint`, `accent`, `accent-soft`, `accent-text`, `scrim`, `ok`,
  `warn`, `err`, `shadow`. Thèmes intégrés : Clair, Sombre, Atelier, Papier, plus « Comme Windows ».
  Un thème importé est un JSON (nom, auteur, base claire ou sombre, couleurs) ; « Copier le thème
  actuel » donne un exemple.
- **Arrondis** : `--r-xs` 4 px (détails), `--r-sm` et `--r-md` 6 px (presque tout), `--r-lg` 8 px
  (éléments flottants). Mêmes valeurs dans `packages/sdk/src/base.css` pour les mini-apps.
- Les mini-apps reçoivent les couleurs du thème sous forme de variables CSS (même noms).
- `--titlebar` : 44 px ; la ligne du logo de la colonne vaut `--titlebar + 12px`.

## Aperçu rapide (`Apercu.svelte`)

- Ouvert par le raccourci global (Rust émet `apercu:ouvert`) : relit réglages et bibliothèques,
  affiche la grille des favoris (flèches, Entrée, 1–9), ouvre une mini-app **sur place**.
- Échap : retour à la grille, puis fermeture. Clic dans un autre logiciel : fermeture (perte de
  focus détectée par la page).
- Fermeture en fondu (150 ms) **avant** de cacher la fenêtre, pour qu'elle réapparaisse vide.
- Voile sombre simple (`rgba(10,14,20,0.42)`), sans flou ni zoom : décision de Bryan après essais.
- « Ouvrir dans l'Établi » : le calcul passe dans un onglet de la fenêtre principale.

## Impression des fiches

`lib/print/print.ts` : `printFiche(fiche, { author, date })` construit un document HTML (feuille
`fiche.css`, en-tête avec cartouche, pied de page numéroté par `@page`), le met dans un cadre caché
sans script et appelle `print()`. Voir [09-bibliotheques-fiches-envoi.md](09-bibliotheques-fiches-envoi.md).
