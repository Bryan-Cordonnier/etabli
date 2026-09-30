# Journal des changements

Tous les changements notables d'Établi (l'application) sont notés ici, version par version. Les plugins
ont chacun leur journal dans leur dossier (`plugins/<id>/CHANGELOG.md`).

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et les versions suivent
[SemVer](https://semver.org/lang/fr/). Chaque rubrique s'adresse à l'utilisateur ; une rubrique **Pour les
développeurs de plugins** décrit ce qui change pour eux. Le texte de chaque version devient les notes de la
Release GitHub et le message de mise à jour affiché dans l'application (voir
[docs/14](docs/14-publier-une-version.md)).

## [Non publié]

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

[Non publié]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Bryan-Cordonnier/etabli/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Bryan-Cordonnier/etabli/releases/tag/v0.1.0
