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
| `lib/state/settings.svelte.ts` | réglages (`settings`) : thème, thèmes importés, animations, taille du texte, colonne (repliée, largeur), favoris, plugins désactivés, ordre des plugins, raccourci global de l'aperçu (`quickShortcut`), raccourcis de l'application par action (`shortcuts`, vide par défaut), zone de notification, auteur des fiches |
| `lib/state/tabs.svelte.ts` | onglets (`tabs`) : ouverture, navigation, historique par onglet, onglets fermés, persistance de la session |
| `lib/state/ui.svelte.ts` | palette ouverte, notification (toast 4 s), focus de la recherche |
| `lib/state/libraries.svelte.ts` | bibliothèques Fournisseurs et Machines, réglages des plugins (`libraries`) |
| `lib/documents.svelte.ts` | `DocumentSession` : un calcul ouvert (chargement, enregistrement différé, historique, duplication, corbeille) |
| `lib/plugins/registry.svelte.ts` | `PLUGINS` (liste **réactive**, rechargée après chaque installation), `loadPlugins`, validation des manifestes (avec `source`), `pluginUrl`, recherche de mini-apps, ordre officiel |
| `lib/state/catalogue.svelte.ts` | catalogue (`catalogue`) : entrées publiées, installation avec progression, désinstallation, installation depuis un fichier, `startup` (réinstallation des plugins de qui arrive d'une 0.1.x, puis mises à jour automatiques), `compareVersions` |
| `lib/state/updates.svelte.ts` | mises à jour de l'application (voir docs/14) |
| `lib/views.ts` | titre, icône et couleur d'une vue ; `normalize` (recherche sans accents) |
| `lib/shortcuts.ts` | raccourcis clavier de l'application : liste des actions (`ACTIONS`), `handleShortcut` (aussi appelé pour les touches renvoyées par les mini-apps), `frameShortcuts`, `shortcutHint` (infobulles), `actionUsing` (doublons) |
| `lib/themes.ts`, `lib/appearance.ts` | thèmes et application de l'apparence (thème, animations réduites, zoom) |
| `lib/icons.ts` | liste fermée des icônes Lucide utilisables par les manifestes |
| `lib/print/print.ts`, `lib/print/fiche.css` | impression des fiches d'atelier |
| `lib/machines.ts`, `lib/send.ts` | « + Ajouter une machine… » et envoi entre mini-apps (fenêtre principale) |
| `lib/components/*` | composants (voir plus bas) |
| `lib/pages/*` | `Home` (bienvenue et bouton du catalogue quand aucun plugin n'est installé), `PluginPage`, `MiniAppPage`, `SettingsPage`, `CataloguePage` |

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

Raccourcis (`lib/shortcuts.ts`) : **aucun n'est réglé par défaut**, sauf le raccourci global de
l'aperçu rapide (Ctrl+Maj+Espace). Chaque action de `ACTIONS` (palette, accueil, paramètres,
catalogue, page précédente, nouvel onglet, fermer, rouvrir, suivant, précédent, onglet 1 à 9,
replier la colonne) reçoit sa combinaison dans Paramètres → Raccourcis clavier (`ShortcutRecorder`,
`scope="app"`). Un raccourci s'écrit `Ctrl+Alt+Shift+<KeyboardEvent.code>` (touche physique : même
combinaison en AZERTY et QWERTY) ; Ctrl ou Alt est obligatoire, sauf pour F1–F24 ; un doublon est
refusé. Les mini-apps ne renvoient au moteur que les combinaisons réglées (`init.shortcuts`, puis
message `shortcuts` à chaque changement ; l'aperçu rapide n'en envoie aucune : `forward={false}`).
Le bouton de recherche de la barre d'onglets ouvre la palette sans raccourci. Bouton « précédent »
de la souris : page précédente.

## Pages

- **Accueil** : recherche de mini-apps (sans accents), favoris, calculs récents.
- **Page de plugin** : grille de ses mini-apps (tuiles `AppCard` avec étoile de favori), calculs récents du plugin. Un plugin à une seule mini-app l'ouvre directement depuis la colonne.
- **Mini-app** : fil d'Ariane, titre du calcul modifiable, Nouveau, Dupliquer, Corbeille, cadre de la mini-app, anciens calculs (`PastCalcs` : recherche, 5 par page).
- **Paramètres** : menu rangé en trois groupes, chaque page avec un titre et une phrase d'explication.
  *Application* : Général (fermeture de la fenêtre : rester en arrière-plan ou quitter ; démarrage de
  Windows ; nom des fiches ; dossier de travail), Apparence, Aperçu rapide, Raccourcis clavier.
  *Plugins* : Plugins installés, Fournisseurs et machines (provisoire, remplacé par les réglages
  ajoutés par les plugins). *Aide* : Mises à jour et à propos.

## Composants

`Sidebar` (colonne : plugins réordonnables par glisser, repliable avec animation, largeur 200–300 px
redimensionnable, bande Paramètres/Replier en bas), `TabBar` (onglets de **180 px fixes**, défilement
à la molette avec fondu aux bords, glisser pour réordonner, clic molette pour fermer, bouton « + »),
`WindowControls`, `CommandPalette`, `MiniAppFrame` (cadre isolé + protocole), `PastCalcs`,
`RecentDocs`, `AppCard`, `Tile` (icône sur la couleur du plugin, pas d'émoji), `SearchBox`, `ShortcutRecorder`,
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
