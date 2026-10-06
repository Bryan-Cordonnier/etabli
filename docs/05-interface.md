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
| `lib/api.ts` | commandes de fenêtre et de système (`system`), `inTauri`, et réexport du fond sous le nom `api` |
| `lib/fond/` | **fond** : couche de stockage et de plugins. `types.ts` (interface `Fond`, `Capacites`, types de documents et de plugins), `tauri.ts` (commandes Rust), `web.ts` (IndexedDB, plugins statiques), `index.ts` (choix au démarrage). L'interface teste `api.capacites.*` (catalogue, mise à jour, fenêtres natives, isolation, journal) plutôt que `inTauri`. Un fond « serveur » est prévu (docs/16) |
| `lib/components/MobileBar.svelte` | barre du haut en mode compact (< 760 px) : tiroir des plugins, retour, titre, recherche ; remplace `TabBar` (`ui.compact`, `suivreEcran()` dans `state/ui.svelte.ts`). La colonne (`Sidebar`) devient un tiroir (`ui.menuOpen`) sans glisser-déposer ni redimensionnement |
| `lib/storage.ts` | cache synchrone de `settings.json` ou, dans un navigateur, de la clé `etabli.store` (`load`, `save` différé de 300 ms, `reloadStorage`), toujours via le fond |
| `lib/state/settings.svelte.ts` | réglages (`settings`) : thème, thèmes importés, animations, taille du texte, colonne (repliée, largeur), favoris, plugins désactivés, ordre des plugins, raccourci global de l'aperçu (`quickShortcut`), raccourcis de l'application par action (`shortcuts`, vide par défaut), zone de notification |
| `lib/state/tabs.svelte.ts` | onglets (`tabs`) : ouverture, navigation, historique par onglet, onglets fermés, persistance de la session |
| `lib/state/ui.svelte.ts` | palette ouverte, notification (toast 4 s), focus de la recherche |
| `lib/state/pluginData.svelte.ts` | réglages de chaque plugin (`pluginData`), fichier `plugin.<id>.json` |
| `lib/state/services.svelte.ts` | services : données publiées par les plugins (`services`), `snapshotFor(plugin)` (ce qu'un plugin a le droit de lire) |
| `lib/state/lifecycle.svelte.ts` | installer, désinstaller, activer et désactiver un plugin avec ses dépendances (`lifecycle`), fenêtre `PluginDialog` |
| `lib/dataFiles.ts` | écritures différées des fichiers de données (400 ms), noms valides |
| `lib/documents.svelte.ts` | `DocumentSession` : un calcul ouvert (chargement, enregistrement différé, historique, duplication, corbeille) |
| `lib/plugins/registry.svelte.ts` | `PLUGINS` (liste **réactive**, rechargée après chaque installation), `loadPlugins`, validation des manifestes (avec `source`), `pluginUrl`, recherche de mini-apps, ordre officiel |
| `lib/state/installation.svelte.ts` | installation d'un plugin depuis un fichier (`installFile`) et désinstallation (`uninstall`) |
| `lib/state/updates.svelte.ts` | mises à jour de l'application (voir docs/14) |
| `lib/views.ts` | titre, icône et couleur d'une vue ; `normalize` (recherche sans accents) |
| `lib/shortcuts.ts` | raccourcis clavier de l'application : liste des actions (`ACTIONS`), `handleShortcut` (aussi appelé pour les touches renvoyées par les mini-apps), `frameShortcuts`, `shortcutHint` (infobulles), `actionUsing` (doublons) |
| `lib/themes.ts`, `lib/appearance.ts` | thèmes et application de l'apparence (thème, animations réduites, zoom) |
| `lib/icons.ts` | liste fermée des icônes Lucide utilisables par les manifestes |
| `lib/pluginSettings.ts`, `lib/send.ts` | ouvrir la page de réglages d'un plugin (« + Ajouter une machine… ») et envoi entre mini-apps (fenêtre principale) |
| `lib/components/*` | composants (voir plus bas) |
| `lib/pages/*` | `Home` (bienvenue et installation depuis un fichier quand aucun plugin n'est installé), `PluginPage`, `MiniAppPage`, `SettingsPage`, `PluginsPage` (plugins installés, activer, désinstaller, installer depuis un fichier) |

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
  *Plugins* : Plugins installés (activation avec dépendances), puis une page par réglage ajouté par
  un plugin (`plugin:<plugin>:<page>` : Fournisseurs, Machines…, affichée dans un `MiniAppFrame`).
  *Aide* : Mises à jour et à propos.

## Composants

`Sidebar` (colonne : plugins réordonnables par glisser, repliable avec animation, largeur 200–300 px
redimensionnable, bande Paramètres/Replier en bas), `TabBar` (onglets de **180 px fixes**, défilement
à la molette avec fondu aux bords, glisser pour réordonner, clic molette pour fermer, bouton « + »),
`WindowControls`, `CommandPalette`, `MiniAppFrame` (cadre isolé + protocole), `PastCalcs`,
`RecentDocs`, `AppCard`, `Tile` (icône sur la couleur du plugin, pas d'émoji), `SearchBox`, `ShortcutRecorder`,
`Switch`, `Toast`, `Logo`, `Icon`, `PluginDialog` (confirmations du cycle de vie), `PluginProblems`
(dépendances non satisfaites : « Il faut installer X » et le bouton qui règle le problème).

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

- Ouvert par le raccourci global (Rust émet `apercu:ouvert`) : relit réglages, plugins et services,
  affiche la grille des favoris (flèches, Entrée, 1–9), ouvre une mini-app **sur place**.
- Échap : retour à la grille, puis fermeture. Clic dans un autre logiciel : fermeture (perte de
  focus détectée par la page).
- Fermeture en fondu (150 ms) **avant** de cacher la fenêtre, pour qu'elle réapparaisse vide.
- Voile sombre simple (`rgba(10,14,20,0.42)`), sans flou ni zoom : décision de Bryan après essais.
- « Ouvrir dans l'Établi » : le calcul passe dans un onglet de la fenêtre principale.
