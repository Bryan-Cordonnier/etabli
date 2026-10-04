# 12 — Reste à faire et limites connues

Les spécifications détaillées (formules, cas de test) sont recopiées dans
[13-specs-a-venir.md](13-specs-a-venir.md). Rappel : **faire valider la spécification par Bryan avant de coder**.

## À vérifier à l'écran par Bryan (codé fin septembre 2026)

Bryan a déjà vu Traçage, Matériaux et le débit v2 et a demandé les changements ci-dessous (faits le
26 septembre 2026, vérifiés par l'agent dans le navigateur, plugin seul, pas dans l'application) :
- **Traçage** : aperçu 3D (Flan / 3D) et choix Int / Moy / Ext à côté de chaque cote ; la trémie
  carré-rond reste à contrôler sur une vraie pièce.
- **Vitesse de coupe** simplifiée (Ø du trou → théorique, mini, maxi ; « Plus de paramètres »).
- **Débit de tubes** : une seule liste des tubes disponibles (plus de champ « chutes » à part).

Jamais vus :
- **Conversions** en tableau (Maths).
- **Export DXF** (boîte « Enregistrer sous », ouverture dans SolidWorks ou LibreCAD) et **gabarit à
  l'échelle 1** imprimé à 100 % (mesurer la règle de 100 mm).
- Fiche de coupe du débit v2 (ordre par angle de scie, « Tubes du stock » / « Barres à acheter »).

## Appels entre plugins (fondations codées le 4 octobre 2026, branche `appels-entre-plugins`)

À essayer dans la vraie application avant de bâtir `finances` dessus (docs/24 §9) :
- **Cadre invisible dans WebView2 et sur Android** : jamais ouvert ni fermé en conditions réelles (chargement d'une page de 1 px hors
  écran, `MessageChannel`, minuteries) ; à essayer avec les plugins de `fixtures/appels-entre-plugins/` copiés dans un dossier de plugins.
- Pas encore fait : point d'entrée au démarrage (renouvellement des rappels), schémas de fonctions vérifiés par le moteur, `mockService`
  pour les tests, `planInstall` / `problemsOf` sur la version du contrat, révocation branchée sur « fournisseur actif », compteur d'appels
  visible dans les réglages, essai Chromium automatisé (dans l'esprit de `essai-isolation`).

## Économie de matière

- Chutes réservées des **tôles** (même règle que les tubes : deux résultats si la réservation coûte
  une tôle de plus) : pas faites.
- Butée maxi de la scie (`stopMax`) : seulement une étiquette « butée » sur la fiche ; longueur mini
  (`minLength`) : seulement signalée.

## Moteur (lot 1)

- **Projets** (section 3.1) : onglet « Projets » sous Accueil ; créer (nom, description, emplacement)
  → dossier avec un sous-dossier par plugin, sans statut ; déplacer un calcul dans un projet ;
  ouvrir un projet partagé ; double-clic sur un `.etabli` dans l'Explorateur (association de fichier
  dans l'installateur + argument de lancement) ; imprimer toutes les fiches d'un projet.
- Enregistrer les fiches en PDF dans le projet sans passer par la fenêtre d'impression (WebView2
  `PrintToPdf`).
- Envoi entre mini-apps : proposer un choix quand plusieurs mini-apps acceptent le même type.
- Tables de référence : permettre à l'utilisateur d'ajouter ses propres lignes (ex. une matière de
  la Tôlerie), enregistrées dans `PluginSettings`.

## Plugins des lots suivants (spécifiés dans le cahier des plugins)

- **Traçage**, pistes pour la suite (façon Logitrace) : piquage cône sur cylindre, cylindre sur cône,
  réduction excentrée, culotte (Y), trémie rond-rond décalée, virole à pas de vis ; surfaces des
  profilés laminés (peinture) dans Matériaux.
- **Soudage** (7.x, proposé) : cordon d'angle, chanfrein, consommables et coût, préchauffage.
- **Tolérances et ajustements** (8.x, proposé) : ISO 286, ISO 2768, ISO 13920 (tables à vérifier sur
  la norme avant publication).
- **Chiffrage** (lot 4, proposé) : lit les résultats et les prix des fournisseurs, facultatif.

## Distribution

- Releases GitHub et mises à jour automatiques signées : **faites**
  (voir [14-publier-une-version.md](14-publier-une-version.md)). Cycle complet validé par Bryan le
  29/09/2026 : 0.1.1 installée, 0.1.2 proposée au démarrage, installée, plugins présents.
- **Catalogue de plugins** : fait (0.2.0) ; installateur sans plugin. Testé par l'agent le 29/09/2026
  sur une version compilée avec le vrai catalogue (réinstallation d'une 0.1.x, désinstaller,
  installer, adresse étrangère refusée, mini-app ouverte) ; à voir par Bryan dans l'application.
- Releases publiées : 0.1.1 à 0.1.3, puis 0.2.0 (celles de la 0.1.0, installateur NSIS, ont été
  supprimées ; l'étiquette `v0.1.0` reste comme repère) ; Release « catalogue » (préversion).
- Signature Windows par la **SignPath Foundation** : tout est prêt côté dépôt (licence MIT,
  `CODE_SIGNING.md`, installateur MSI, workflow) ; reste la demande de Bryan, puis la mise en place
  dans SignPath et les réglages GitHub (voir [14](14-publier-une-version.md#signpath-signature-windows-gratuite-pour-les-projets-libres)).
  D'ici là, le Contrôle intelligent des applications de Windows 11 bloque Établi.
- **Réglages de plugin et dépendances** : faits (0.3.0). Testés le 30/09/2026 sur une version compilée
  avec le vrai catalogue : reprise des fournisseurs et machines saisis avant (plugins installés et
  données reprises), installation d'Économie de matière avec la case « extensions facultatives »,
  désinstallation, données de Fournisseurs visibles dans le débit de tubes. **Pas testé sur une
  version compilée** : dépendance obligatoire (aucun plugin officiel n'en a ; couverte par les tests de
  `@etabli/sdk/deps` et vue dans l'aperçu navigateur), désinstallation en cascade dans le catalogue.
- **Dépôt public mis au propre** (30/09/2026) : README, guide de l'utilisateur, guide de contribution, code de conduite, politique de
  sécurité, modèles de tickets et de demandes de fusion, journaux des changements (application et plugins), notes de version
  automatiques, Dependabot, validation et création de plugins. Les réglages GitHub de
  [docs/15](15-gerer-le-depot.md#1-réglages-github-à-activer-une-fois-à-la-main) sont appliqués (30/09/2026) et l'image de partage est
  téléversée. Décisions de Bryan : contact de conduite inchangé (signalement privé GitHub ou profil), délais de sécurité de 14 jours
  (accusé de réception) et 30 jours (analyse). Les 5 premières demandes de Dependabot ont été fusionnées les 30/09 et 01/10/2026 (icônes, outils de
  l'interface, bibliothèques Rust dont `minisign-verify` 0.3, `base64` 0.23 et `zip` 8, puis Tauri 2.12 côté npm et côté Rust) : contrôles
  complets passés, CI verte, et version compilée testée (installation de trois plugins depuis le vrai catalogue, mini-app, réglages).
  **Non testé** : l'installateur MSI (le modèle WiX de Tauri est identique entre 2.11.5 et 2.12.0) et la mise à jour automatique, qui ne
  se voient qu'à la prochaine publication. **Reste** : la demande SignPath (un courriel de refus ou de demande de précisions à retrouver).
- Plus tard, si le projet grossit : catalogue de plugins hébergé (recherche, comptes de développeurs,
  vérifications automatiques, révocation) ; points d'extension entre plugins ; réglages déclaratifs.
- Site de documentation pour les auteurs de plugins : non commencé.

## Limites connues

- Beaucoup d'écrans récents n'ont été vérifiés que par les types et les tests. Un agent peut
  maintenant ouvrir une mini-app seule dans le navigateur (voir [02-environnement.md](02-environnement.md)),
  mais pas dans l'application Tauri (impression, boîtes « Enregistrer sous », réglages enregistrés).
- Aperçu 3D du Traçage : les couleurs suivent le thème au moment du calcul ; changer de thème ne
  les met à jour qu'à la prochaine modification d'une cote.
- Masses des tubes et cornières (Matériaux) en angles vifs : 1 à 3 % au-dessus du catalogue.
- Vitesses de la machine (Matériaux) : séparées par des espaces, donc sans espace dans les milliers
  (« 1120 », pas « 1 120 »).
- Catalogue : sans Internet au premier lancement, Établi reste vide (installation depuis un fichier
  possible) ; la version minimale de l'application par plugin (`apiVersion`) n'est pas contrôlée.
- Le commit `8360f99` a un caractère BOM au début de son titre (sans conséquence).
- `Pythagore.svelte` n'utilise pas encore `MiniAppDocument` (fonctionne, mais style ancien).
