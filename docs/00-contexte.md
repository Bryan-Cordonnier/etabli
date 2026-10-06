# 00 — Contexte du projet

> **Out of date (6 October 2026).** The project is changing direction: this repository becomes **Etable**, an open-source engine with no bundled plugins; the metalworking plugins described below were removed (tag `legacy/etabli-0.5-chaudronnerie`). Current plan: [22-cahier-de-bord.md](22-cahier-de-bord.md), section 9. This document will be rewritten in English.

## En une phrase

**Établi** est une boîte à outils de bureau pour la chaudronnerie : on l'ouvre à côté de SolidWorks
pour faire un calcul d'atelier (trigonométrie, développé de pliage, débit de tubes, calepinage de
tôles…), enregistrer le calcul et imprimer une fiche à emporter à l'atelier.

## Orientation depuis octobre 2026

Bryan arrête le BTS et fait d'Établi le **socle d'une plateforme** : le moteur reste libre (Apache-2.0 décidé, marque protégée à part),
les plugins payants vivent dans des dépôts privés, avec comptes, licences à baux de 48 h et registre signé. Trois applications séparées
partageront ce moteur (par configuration de build, pas par copie) : Établi (tests), un ERP pour son entreprise et un budget/agenda
personnel. Le plan et les décisions sont dans [18](18-spec-plateforme-comptes-licences.md) ; le **moteur sur PC (Windows) passe
avant le mobile**, Linux et iPhone viennent plus tard. Le nom commercial n'est pas encore choisi.

## Pour qui

- **Utilisateur et porteur du projet** : Bryan, étudiant en BTS CRCI (conception et réalisation en
  chaudronnerie industrielle). Il décide de tout ce qui touche au métier et à l'interface.
- **Utilisateurs finaux** : élèves et professeurs d'atelier, sur des PC d'école **modestes**
  (processeur et carte graphique d'entrée de gamme), sous **Windows**.
- Les élèves partagent leurs calculs (dossiers de projet, clés USB).

## Principes (non négociables)

- **Léger** : démarrage rapide, peu de mémoire, rien qui tourne en continu (la 3D ne se redessine
  que quand on bouge la pièce).
- **Ergonomique** : entrées à gauche, résultats à droite, calcul en direct, un clic copie une valeur.
- **Design plat moderne**, animations fluides et discrètes, cohérence visuelle stricte (mêmes
  arrondis, mêmes états actifs partout).
- **Local d'abord** : la logique des plugins tourne toujours sur l'appareil, et sans compte ni réseau l'application marche comme avant. Le serveur de données, les comptes et les licences sont **facultatifs** ([16](16-spec-serveur-utilisateurs-mobile.md), [18](18-spec-plateforme-comptes-licences.md)).
- **Extensible** : tout le métier est dans des plugins ; le moteur fournit les briques communes.
- **Français** partout.

## Documents de référence

Les cahiers des charges et maquettes sont des pages privées sur claude.ai (compte de Bryan). Un autre
agent n'y aura peut-être pas accès : **l'essentiel est résumé dans ce dossier `docs/`**.

| Document | Lien |
| --- | --- |
| Cahier des charges principal (moteur, interface) | https://claude.ai/code/artifact/1acbdf43-5049-458c-aa98-50eb3db46189 |
| Cahiers des charges des plugins (lots, formules, cas de test) | https://claude.ai/code/artifact/e1131f9c-1f78-4f9c-b27e-449a2c55025e |
| Maquette de l'application | https://claude.ai/artifact/XKfkQz5R9UMnVNsW4AtTmq |
| Maquette validée de la fiche de coupe (tubes) | https://claude.ai/artifact/HRdrvgaowa5hDKUw15f72v |
| Maquette validée de la fiche de calepinage (cisaille) | https://claude.ai/artifact/GFGEuW5SZ6eK9Q1326h5ft |

Dépôt : https://github.com/etable-project/etable (public, branche `main`, CI « Vérification »).

## Découpage en lots (cahier des charges des plugins)

| Lot | Plugins | Briques du moteur |
| --- | --- | --- |
| 1 | Économie de matière, Maths et géométrie, Tôlerie | Projets, fiches d'atelier, plugins Fournisseurs et Machines, envoi entre mini-apps |
| 2 | Matériaux et fixation, Traçage (ex-Chaudronnerie) | Export DXF (développés), export PDF, tables de référence partagées |
| 3 | Soudage, Tolérances et ajustements | aucune |
| 4 | Chiffrage (proposé) | lecture facultative des résultats d'autres plugins et des prix fournisseurs |

## État d'avancement (octobre 2026)

- **Version 0.5.0** : serveur facultatif (`crates/serveur`, [17](17-serveur.md)), version web connectée et hors ligne, projet Android de test.
- **Isolation et permissions** ([19](19-modele-de-menace-plugins.md)) : garde de chaque message d'une mini-app, permissions v1 déclarées
  au manifeste et montrées avant l'installation, une origine par plugin côté serveur. Les 7 plugins officiels passent au contrat « ^2 ».
- **Mises à jour « en béton »** ([20](20-spec-mises-a-jour-registre.md)) : l'application utilise le noyau (`crates/noyau`) pour les paquets,
  lit un **catalogue signé** (séquence, expiration, révocations), refuse un retour en arrière ; retour à la version précédente d'un plugin ;
  plugin révoqué désactivé. Le catalogue est resigné à chaque modification et chaque mois (**à lancer une première fois à la main**).
- **Essai d'alarme natif Android** (`tools/essai-alarme`) : alarmes et notifications exactes à la seconde près.
- **Licences, comptes, baux** : spécifiés ([21](21-spec-licences-baux.md)), pas codés. Mobile et iPhone : plus tard.

## Historique (fin septembre 2026)

**Moteur — fait**
- Fenêtre principale sans bordure : colonne des plugins (repliable, réordonnable), onglets globaux,
  Accueil avec recherche et favoris, page de plugin, écran de mini-app avec anciens calculs,
  palette de commandes (bouton de recherche), raccourcis clavier tous réglables (aucun par défaut).
- Paramètres : Général (fermeture en arrière-plan ou non, démarrage avec Windows, nom de l'auteur
  des fiches, dossier de travail), Apparence (4 thèmes + système + thèmes JSON importés, taille du
  texte, animations), Aperçu rapide, Raccourcis clavier, Plugins installés, une page par réglage de
  plugin (Fournisseurs, Machines), Mises à jour et à propos. Icônes : une icône de liste fermée sur la couleur du
  plugin (les émojis ont été retirés).
- Aperçu rapide : fenêtre transparente toujours au premier plan, ouverte par un raccourci global
  (Ctrl+Maj+Espace par défaut), grille des favoris, mini-apps utilisables sur place.
- Plugins isolés (cadre `sandbox`, protocole `plugins://`), SDK, kit d'interface.
- Documents `.etabli` enregistrés automatiquement, corbeille, duplication.
- Plugins Fournisseurs et Machines (réglages ajoutés par des plugins, données publiées), dépendances
  entre plugins (obligatoires ou facultatives, installées avec confirmation), réglages propres à chaque plugin.
- Impression des fiches d'atelier (A4 ou PDF via « Enregistrer au format PDF »).
- Envoi de données d'une mini-app vers une autre (flan plié → calepinage).
- Export DXF (boîte « Enregistrer sous ») et gabarits à l'échelle 1 découpés en feuilles A4.

**Plugins**
- **Maths et géométrie 1.0** : Pythagore, triangle quelconque, arc et cercle, perçage sur cercle,
  polygone régulier, volumes et contenances, conversions (tableau).
- **Économie de matière 0.3** : débit de tubes v2 (profilés, coupes d'angle, emboîtement, aperçu 3D,
  tolérances, poids, mode besoin, chutes réservées, priorité matière ou temps, ordre par angle de
  scie, fiche de coupe) et calepinage de tôles à la cisaille guillotine (fiche de calepinage).
- **Tôlerie 1.0** : développé de pliage, vé et effort de pliage.
- **Traçage 1.0** (nommé « Chaudronnerie » dans le cahier des charges ; Bryan le veut « comme
  Logitrace ») : virole, tronçon de cône, piquage, coude à segments, trémie carré-rond ; tableaux de
  traçage, DXF, gabarits.
- **Matériaux et fixation 1.0** : masse, taraudage et passages, vitesse de coupe, couple de serrage.

Les ajouts de fin septembre 2026 (conversions, débit v2, Traçage, Matériaux) n'ont **pas encore été
vus à l'écran** : liste dans [12-a-faire.md](12-a-faire.md).

**Distribution** : première version publiée le 29 septembre 2026 (v0.1.0) sur
https://github.com/etable-project/etable/releases/latest, avec mises à jour automatiques
signées (voir [14-publier-une-version.md](14-publier-une-version.md)). Des camarades de Bryan
l'installent : une version publiée doit rester sûre (pas de calcul faux, pas de perte de données).
Depuis la 0.2.0, l'installateur ne contient **aucun plugin** : on les installe depuis le **catalogue**
(page Catalogue), chaque plugin étant publié et mis à jour séparément de l'application.

**Pas encore fait** : Projets, export PDF direct, plugins des lots 3 et 4. Détail dans
[12-a-faire.md](12-a-faire.md).
