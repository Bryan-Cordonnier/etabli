# Journal des changements

Tous les changements notables d'Établi (l'application) sont notés ici, version par version. Les plugins
ont chacun leur journal dans leur dossier (`plugins/<id>/CHANGELOG.md`).

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et les versions suivent
[SemVer](https://semver.org/lang/fr/). Chaque rubrique s'adresse à l'utilisateur ; une rubrique **Pour les
développeurs de plugins** décrit ce qui change pour eux. Le texte de chaque version devient les notes de la
Release GitHub et le message de mise à jour affiché dans l'application (voir
[docs/14](docs/14-publier-une-version.md)).

## [Non publié]

### Ajouté

- **Permissions des plugins** : un plugin déclare ce qu'il a besoin de faire (enregistrer des fichiers, imprimer, copier, envoyer
  à une autre mini-app, ouvrir des réglages). Le catalogue vous les montre avant l'installation, et à chaque mise à jour qui en
  demande de nouvelles. Les sept plugins officiels passent au nouveau contrat.
- **Contrôle de ce que font les mini-apps** : chaque message d'une mini-app est vérifié (forme, taille) avant d'être pris en
  compte ; une mini-app ne peut plus enregistrer qu'un fichier de données (CSV, DXF, JSON, texte, SVG…), jamais un programme.
  Les documents et réglages ont une taille maximale.

- **Appels entre plugins** (fondations) : un plugin peut appeler une fonction d'un autre plugin et recevoir la réponse (par exemple
  « ajouter un rappel » dans un futur Agenda). L'autorisation est montrée avant l'installation, une ligne par service (« Lire des
  données dans le service « agenda » du plugin Agenda », « Ajouter ou modifier des données… »). Si l'autre plugin n'est pas là,
  est désactivé ou n'est pas à la bonne version, l'appelant reçoit une réponse claire et continue en mode réduit. Aucun plugin
  officiel n'est changé ; rien ne se voit encore à l'écran.

### Modifié

- **Catalogue de plugins plus sûr** : l'application sait lire un catalogue signé (signature, date de fin, numéro de séquence qui ne
  recule jamais) et garde ses révocations ; elle refuse d'installer une version révoquée ou plus ancienne que celle installée
  (réinstaller la même version depuis un fichier reste permis). Le catalogue actuel, non signé, est encore accepté jusqu'à la
  publication du format signé. Détail : [docs/20](docs/20-spec-mises-a-jour-registre.md).
- **Serveur : une origine par plugin.** L'option `--url-plugins` prend désormais un modèle avec `{id}`
  (`https://{id}.plugins.maison.fr`) : chaque plugin a son propre nom d'hôte et ne peut ni lire l'application ni un autre
  plugin. Les mini-apps restent utilisables hors ligne. Voir [docs/17](docs/17-serveur.md).

### Pour les contributeurs

- **Appels entre plugins** (docs/24, A.1.2) : manifeste `functions` / `serviceEntry` (fournisseur) et `services` / permission
  `appelle:<service>:<lecture|ecriture>` (appelant) ; SDK `etabli.services.call(...)` et `etabli.services.handle(...)`, `ServiceError` ;
  messages `serviceCall`, `serviceReply`, `serviceInvoke`, `serviceReady`, `serviceResult` ; routeur pur `lib/plugins/appels.ts`
  (file par fournisseur, délais, plafonds, profondeur 1) ; cadre invisible `ServiceFrame` ; garde étendu (cadre de service restreint) ;
  `npm run valider` contrôle les nouveaux champs. Le versionnage d'un appel porte sur la **version du contrat** (`provides`), non
  sur celle du plugin. Deux plugins de test dans `fixtures/appels-entre-plugins/` (non distribués) et un test d'appel complet.
  Voir [docs/06](docs/06-protocole-sdk.md) et [docs/19](docs/19-modele-de-menace-plugins.md).
- **Essai des appels entre plugins dans un vrai navigateur** : `node scripts/essai-appels.mjs` monte l'interface web et les plugins de test dans
  Chromium (Playwright, non ajouté aux dépendances : voir l'en-tête du script) et joue 45 essais (succès, argument invalide, permission
  manquante, fournisseur absent, contrat incompatible, file d'attente, plafond, délai, isolation du cadre de service). Il a trouvé un défaut,
  corrigé : les arguments d'un appel (objets) n'arrivaient jamais au fournisseur (proxys Svelte non copiables par `postMessage`) ; seuls
  les appels sans argument passaient. Non essayé dans WebView2 ni sur Android.
- **Outils communs `money` et `civil` dans `@etabli/ui`** (docs/24, M10) : argent en centimes entiers (arrondi explicite, pourcentages en points de base, répartition sans
  perte, formatage et lecture à la française) ; jours civils, jours ouvrés et fériés français, ajout de mois avec fin de mois, conversion UTC ↔ Europe/Paris
  aux changements d'heure, durées en minutes. Utilisables aussi depuis une page sans interface (`@etabli/ui/money`, `@etabli/ui/civil`). Voir `packages/ui/README.md`.
- **Plugin Finances (version préliminaire, hors catalogue)** : tableau de bord de l'argent réel (soldes, courbe, dépenses du mois, dernières écritures, saisie rapide),
  registre qui ne s'efface jamais (une erreur s'annule par une écriture inverse) et service `finances` que d'autres plugins pourront appeler. Montants en centimes, limite de
  3,5 Mo gérée par un message clair. Nouvelle icône « wallet » et graphiques `LineChart` / `DonutChart` dans `@etabli/ui`. Voir `plugins/finances/CHANGELOG.md`.
- Le catalogue des plugins est signé à chaque modification (`scripts/catalogue-signe.mjs`) et renouvelé chaque mois par le workflow
  « Catalogue (renouvellement) » ; les entrées portent l'empreinte `sha256` du paquet. Voir [docs/14](docs/14-publier-une-version.md).
- `etabli-noyau` : vérification d'un catalogue signé (séquence, expiration, révocation, refus des retours en arrière), pas encore
  utilisée par l'application. Spécification : [docs/20](docs/20-spec-mises-a-jour-registre.md).
- `npm run valider` : permissions connues, doublons, fonction du SDK utilisée sans permission ; avertissement pour un plugin « ^1 ».
  `npm run nouveau-plugin` crée un plugin « ^2 ». Modèle de menace : [docs/19](docs/19-modele-de-menace-plugins.md).
- Spécification (brouillon) des plugins « agenda », « finances », « paie » et « budget » (services entre plugins) et inventaire de l'ancien projet de gestion de budget : [docs/24](docs/24-spec-plugins-budget.md). Aucun code.

## [0.5.0] — 2026-10-03

### Ajouté

- **Serveur facultatif** (`etabli-serveur`, version préliminaire) : comptes, calculs et plugins d'une classe, d'un atelier ou d'une maison,
  sur une machine que vous hébergez vous-même. Un seul administrateur choisit les plugins et crée les comptes ; chaque utilisateur ne
  voit que ses calculs. Mode d'emploi et limites : [docs/17-serveur.md](docs/17-serveur.md).
- **Version web connectée au serveur** : écran de connexion, choix « Établi seul » ou « Serveur », Paramètres › Serveur et
  Administration (comptes, plugins, journal, export), import de vos calculs locaux vers le serveur. **L'application de bureau
  (Tauri) ne se connecte pas encore** : seule la version web servie par `etabli-serveur` le fait ; dans l'application Windows, rien ne change.
- **Hors ligne** (version web connectée) : calculs, réglages et mini-apps restent utilisables sans réseau ; vos modifications
  attendent sur l'appareil puis partent au retour du réseau (en cas de conflit, une « copie hors ligne » est créée). Pour les
  mini-apps hors ligne, le serveur doit exposer une origine dédiée aux plugins (`--ecoute-plugins` et `--url-plugins`).

- **Android (version préliminaire)** : projet Capacitor (`apps/mobile`) et page Paramètres › Alarmes pour **tester que les rappels sonnent
  à l'heure**, application fermée. L'APK de test se fabrique par le workflow GitHub « Android (APK de test) ». iPhone : la version web
  s'ajoute à l'écran d'accueil (plein écran, icône).

### Pour les contributeurs

- Espace de travail Cargo à la racine : `crates/noyau` (règles communes) et `crates/serveur`. L'application Tauri
  (`apps/desktop/src-tauri`) reste à part, avec son propre `Cargo.lock`. La CI vérifie aussi le serveur (format, analyse, 51 tests).

## [0.4.0] — 2026-10-03

### Ajouté

- **Version web** (`npm run build:web`) : Établi dans un navigateur, installable comme une application et utilisable **hors ligne**.
  Les calculs sont gardés dans le navigateur (IndexedDB). Les plugins du dépôt y sont inclus ; pas de catalogue dans cette version.
- **Interface adaptée aux petits écrans** (moins de 760 px) : la colonne des plugins devient un tiroir, une barre simple remplace les
  onglets. Sans effet sur l'application Windows.
- La page **Catalogue** et la fenêtre de mise à jour d'un plugin affichent les **nouveautés** de la version (« Nouveautés de la version… »).
- **Signaler un problème** (Paramètres → Mises à jour et à propos) ouvre le formulaire « Bug » du dépôt avec la version d'Établi et
  la liste des plugins déjà remplies.
- Notes de chaque version écrites dans ce journal, reprises automatiquement pour la Release GitHub, le message de mise à jour
  affiché dans l'application et les nouveautés des plugins.

### Modifié

- Mise à jour de Tauri (le cadre de l'application) et de ses extensions, des bibliothèques qui vérifient les signatures et
  ouvrent les paquets de plugins, et des outils de l'interface. Aucun changement visible ; vérifié sur une version compilée
  (installation de plugins depuis le catalogue, mini-app, réglages).

### Pour les développeurs de plugins

- `npm run nouveau-plugin -- <id> "<Nom>"` crée un plugin prêt à compiler (mini-app d'exemple, tests, journal, page de réglages
  facultative) et `npm run valider -- <id>` le vérifie : manifeste, dépendances, journal des changements, appels réseau ou
  exécution de code dans les sources, contenu du plugin compilé. La publication d'un plugin lance cette validation.
- Chaque plugin a un `CHANGELOG.md` ; sa section pour la version publiée devient les nouveautés du catalogue.

### Pour les contributeurs

- **Couche de stockage unifiée** (`lib/fond/`) : les calculs, réglages et plugins passent par une interface unique (« fond »), avec
  une version « fichiers » (application, inchangée pour l'utilisateur : ses calculs sont conservés) et une version « navigateur »
  (IndexedDB). Première étape du mode serveur facultatif (docs/16).
- Nouveaux fichiers du dépôt : guide de contribution, code de conduite, politique de sécurité, aide, feuille de route, guide de
  l'utilisateur, guide des mainteneurs, modèles de tickets (bug, résultat de calcul faux, idée, plugin) et de demandes de fusion,
  mises à jour automatiques des dépendances (Dependabot), propriétaires du code et étiquettes.
- La vérification automatique contrôle aussi les scripts de publication, les plugins et les liens de la documentation.

## [0.3.0] — 2026-09-30

Les plugins peuvent maintenant ajouter leurs propres réglages et dépendre les uns des autres.

### Ajouté

- **Réglages ajoutés par les plugins.** Un plugin peut ajouter des pages dans *Paramètres → Plugins* : elles apparaissent
  quand le plugin est installé et activé, et disparaissent avec lui.
- **Plugins Fournisseurs et Machines**, au catalogue : ce sont les anciens blocs « Bibliothèques » des Paramètres, devenus des
  plugins comme les autres. Vos fournisseurs et machines déjà saisis sont **repris automatiquement** au premier démarrage
  (les anciens fichiers ne sont pas effacés).
- **Dépendances entre plugins**, obligatoires ou facultatives :
  - installer un plugin installe aussi ce dont il a besoin, après confirmation ;
  - les extensions facultatives sont proposées avec une case cochée par défaut, à décocher si vous n'en voulez pas ;
  - désinstaller ou désactiver un plugin dont d'autres ont besoin demande confirmation et les entraîne avec lui ;
    vos calculs et vos réglages sont toujours conservés ;
  - activer un plugin réactive ce dont il a besoin ;
  - si un plugin a besoin d'un autre qui manque, est trop ancien ou est désactivé, un message le dit à la place de la
    mini-app, avec le bouton qui règle le problème ;
  - les mises à jour automatiques du démarrage installent aussi les dépendances obligatoires.
- Le **catalogue** affiche de quoi chaque plugin a besoin (« A besoin de », « Fonctionne mieux avec ») et les réglages qu'il ajoute.
- **Économie de matière 0.4.0** se sert des plugins Fournisseurs et Machines quand ils sont là, et marche sans.

### Modifié

- *Paramètres → Bibliothèques* n'existe plus : les fournisseurs et les machines se règlent dans leurs plugins
  (*Paramètres → Fournisseurs*, *Paramètres → Machines*).
- **Aucune machine d'exemple** n'est plus créée : la liste est vide tant que vous n'en ajoutez pas.
- Un plugin qui n'a pas de mini-app n'apparaît plus dans la colonne de gauche, l'accueil ni la recherche.
- « + Ajouter une machine… » dans un calcul ouvre la page du plugin Machines avec la machine prête à être nommée ; si le plugin
  n'est pas installé, le catalogue s'ouvre.

### Pour les développeurs de plugins

- Le manifeste accepte `dependencies`, `optionalDependencies` (plages de versions : `^1`, `~1.2`, `1.x`, `>=1.2 <2`, `*`),
  `provides` (données publiées) et `settings` (pages de réglages). Voir
  [Dépendances et services](docs/07-creer-un-plugin.md#dépendances-et-services).
- Nouveau dans le SDK : `etabli.services` (lecture des données publiées par les plugins dont on dépend, et `provide`),
  `etabli.openSettings()`, et `@etabli/sdk/deps` (versions, plages, plan d'installation). Nouveau dans le kit :
  `Icon`, et `PluginSettings` qui publie ses réglages.
- Les données circulent **par le moteur, en lecture seule**, et seulement vers les plugins qui déclarent la dépendance.
- Compatibilité : `libraries` (fournisseurs et machines) est conservé dans le protocole, dérivé des services `fournisseurs` et
  `machines` ; `addMachine` reste compris.

## [0.2.1] — 2026-09-29

### Ajouté

- **Tous les raccourcis clavier se règlent** dans *Paramètres → Raccourcis clavier* : recherche, onglets, colonne,
  accueil, paramètres, catalogue, page précédente. Un doublon est refusé, chaque raccourci s'efface.
- Un **bouton de recherche** dans la barre d'onglets, à côté du « + », puisque la recherche n'a plus de raccourci imposé.
- Les Paramètres sont **rangés par thèmes** (Application, Plugins, Aide) et chaque page a une phrase d'explication.
- *Paramètres → Général* met en évidence deux réglages : **Établi reste en arrière-plan ou se ferme complètement** quand on
  ferme la fenêtre, et **démarrage avec Windows**.

### Modifié

- **Aucun raccourci n'est réglé d'avance**, sauf l'aperçu rapide (Ctrl + Maj + Espace). Les mini-apps ne renvoient au moteur que
  les combinaisons que vous avez réglées : le reste du clavier leur appartient.
- Les raccourcis sont enregistrés par touche physique : ils marchent pareil en AZERTY et en QWERTY.

### Supprimé

- Les **émojis** : chaque plugin a une icône et une couleur. Le réglage « Icônes des plugins » disparaît.
- Les raccourcis imposés (Ctrl+K, Ctrl+T, Ctrl+W…).

### Pour les développeurs de plugins

- Retirez le champ `emoji` des manifestes (il est ignoré). `init.shortcuts` et le message `shortcuts` donnent au SDK la liste des
  raccourcis réglés ; les plugins doivent être recompilés avec ce SDK pour les relayer (les cinq plugins officiels l'ont été).

## [0.2.0] — 2026-09-29

### Ajouté

- **Le catalogue de plugins** : l'installateur ne contient plus aucun plugin, on installe, met à jour, active, désactive et
  désinstalle ceux dont on a besoin, sans redémarrer. Au premier lancement, Établi est vide et propose d'ouvrir le catalogue.
- **Mises à jour automatiques des plugins** au démarrage, avec une notification. Sans réseau, rien ne s'affiche.
- **Installer depuis un fichier** (`.etabli-plugin`), hors ligne, avec la même vérification.
- Reprise pour qui arrive d'une version 0.1.x : les plugins livrés avec elle sont réinstallés depuis le catalogue.

### Modifié

- Les plugins sont publiés **séparément** de l'application : corriger un calcul ne demande plus de republier Établi.
- Désinstaller un plugin **garde vos calculs** (ils restent dans `Documents\Etabli`).

### Sécurité

- Chaque paquet est **signé** : la signature est vérifiée avant la moindre écriture sur le disque.
- Rust ne télécharge que depuis les Releases de ce dépôt ; l'extraction refuse les chemins qui sortent du dossier du plugin
  et borne la taille.

## [0.1.3] — 2026-09-29

### Corrigé

- **Plus de flash blanc** à l'ouverture d'une mini-app : le cadre reste invisible jusqu'à ce que la mini-app ait appliqué le thème
  et dessiné son contenu, puis apparaît en fondu.

## [0.1.2] — 2026-09-29

### Corrigé

- **Plugins absents** dans l'application installée : les fenêtres étaient créées avant que la liste des plugins soit prête.
- Les réglages (`settings.json`) ne sont plus jamais réécrits tant qu'ils n'ont pas pu être lus : une lecture ratée ne remplace
  plus vos réglages par ceux par défaut.

Cette version a servi à valider la mise à jour automatique de bout en bout : la 0.1.1 installée l'a proposée au démarrage
et l'a installée.

## [0.1.1] — 2026-09-29

### Modifié

- **Installateur MSI par utilisateur** : il s'installe dans `%LOCALAPPDATA%` sans droits d'administrateur, remplace
  l'installateur précédent et prépare la signature Windows (SignPath).

## [0.1.0] — 2026-09-29

Première version publiée, retirée depuis (installateur d'un autre type, remplacé dès la 0.1.1).

### Ajouté

- Installateur Windows avec les cinq plugins (Maths et géométrie, Économie de matière, Tôlerie, Traçage, Matériaux et fixation).
- Mises à jour automatiques signées, depuis les Releases GitHub.

## Avant la première version (23 au 26 septembre 2026)

Développement du moteur et des plugins, sans version publiée.

### Ajouté

- **Le moteur** : colonne des plugins (repliable, réordonnable), onglets façon navigateur, accueil avec recherche et favoris,
  palette de commandes, thèmes (clair, sombre, Atelier, Papier, thèmes importés), taille du texte, zone de notification.
- **L'aperçu rapide** : une fenêtre par-dessus n'importe quel logiciel (SolidWorks compris) ouverte par un raccourci global,
  avec les mini-apps favorites utilisables sur place.
- **Les documents** : chaque calcul est enregistré automatiquement dans un fichier `.etabli`, avec historique, duplication et corbeille.
- **Les fiches d'atelier** imprimables en A4, l'**envoi d'un calcul vers une autre mini-app**, l'**export DXF** et les
  **gabarits à l'échelle 1**.
- **Les plugins isolés** : chaque mini-app tourne dans un cadre sans accès au disque ni au réseau, reliée au moteur par un SDK.
- **Cinq plugins** : Maths et géométrie, Économie de matière (débit de tubes, calepinage de tôles), Tôlerie, Traçage et
  Matériaux et fixation.

[Non publié]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Bryan-Cordonnier/etabli/releases/tag/v0.1.0
