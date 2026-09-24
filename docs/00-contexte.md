# 00 — Contexte du projet

## En une phrase

**Établi** est une boîte à outils de bureau pour la chaudronnerie : on l'ouvre à côté de SolidWorks
pour faire un calcul d'atelier (trigonométrie, développé de pliage, débit de tubes, calepinage de
tôles…), enregistrer le calcul et imprimer une fiche à emporter à l'atelier.

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
- **100 % local**, aucun compte, aucun réseau (sauf, plus tard, les mises à jour via GitHub).
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

Dépôt : https://github.com/Bryan-Cordonnier/etabli (public, branche `main`, CI « Vérification »).

## Découpage en lots (cahier des charges des plugins)

| Lot | Plugins | Briques du moteur |
| --- | --- | --- |
| 1 | Économie de matière, Maths et géométrie, Tôlerie | Projets, fiches d'atelier, bibliothèques Fournisseurs et Machines, envoi entre mini-apps |
| 2 | Matériaux et fixation, Chaudronnerie | Export DXF (développés), export PDF, tables de référence partagées |
| 3 | Soudage, Tolérances et ajustements | aucune |
| 4 | Chiffrage (proposé) | lecture facultative des résultats d'autres plugins et des prix fournisseurs |

## État d'avancement (fin septembre 2026)

**Moteur — fait**
- Fenêtre principale sans bordure : colonne des plugins (repliable, réordonnable), onglets globaux,
  Accueil avec recherche et favoris, page de plugin, écran de mini-app avec anciens calculs,
  palette de commandes (Ctrl+K), raccourcis clavier.
- Paramètres : Général (zone de notification, démarrage avec Windows, nom de l'auteur des fiches,
  dossier de travail), Apparence (4 thèmes + système + thèmes JSON importés, icônes ou émojis, taille
  du texte, animations), Bibliothèques (Fournisseurs, Machines), Plugins, Aperçu rapide, Raccourcis,
  À propos.
- Aperçu rapide : fenêtre transparente toujours au premier plan, ouverte par un raccourci global
  (Ctrl+Maj+Espace par défaut), grille des favoris, mini-apps utilisables sur place.
- Plugins isolés (cadre `sandbox`, protocole `plugins://`), SDK, kit d'interface.
- Documents `.etabli` enregistrés automatiquement, corbeille, duplication.
- Bibliothèques Fournisseurs et Machines, réglages propres à chaque plugin.
- Impression des fiches d'atelier (A4 ou PDF via « Enregistrer au format PDF »).
- Envoi de données d'une mini-app vers une autre (flan plié → calepinage).

**Plugins**
- **Maths et géométrie 1.0** : Pythagore, triangle quelconque, arc et cercle, perçage sur cercle,
  polygone régulier, volumes et contenances, conversions.
- **Économie de matière 0.3** : débit de tubes (profilés, coupes d'angle, emboîtement, aperçu 3D,
  plan 2D/3D, fiche de coupe) et calepinage de tôles à la cisaille guillotine (fiche de calepinage).
  Le débit de tubes v2 n'est pas terminé (voir [12-a-faire.md](12-a-faire.md)).
- **Tôlerie 1.0** : développé de pliage, vé et effort de pliage.
- Matériaux et Chaudronnerie : manifeste seul.

**Pas encore fait** : Projets, export PDF/DXF, mises à jour automatiques, installateur complet
(ressources des plugins), plugins des lots 2 à 4. Détail dans [12-a-faire.md](12-a-faire.md).
