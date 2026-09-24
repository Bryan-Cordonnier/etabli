# 12 — Reste à faire et limites connues

Les spécifications détaillées (formules, cas de test) sont recopiées dans
[13-specs-a-venir.md](13-specs-a-venir.md). Rappel : **faire valider la spécification par Bryan avant de coder**.

## Économie de matière — fin du débit de tubes v2 (lot 1)

Spécification décidée (section 9.3 du cahier des plugins), pas encore codée :
- **Tolérance des barres** (−/+, préremplie depuis le fournisseur) : calcul sur la longueur la plus
  courte, restes et pertes affichés **en plage** (déjà fait pour les tôles dans `cisaille.ts`).
- **Matière et poids** : matière choisie (masse volumique) + section du profilé (`sectionArea` dans
  `profil.ts`) → kg/m, poids des barres, pièces, chutes, perte.
- **Mode besoin** : sans barre saisie, calcul avec la longueur du fournisseur et « À acheter : N barres »
  (ou en plus des chutes).
- **Chutes réservées** : longueur, angles, projet de destination ; si la réservation coûte une barre
  de plus, afficher **les deux résultats** et laisser choisir. Même règle pour les tôles.
- **Ordre de coupe groupé par angle de scie** (comme la butée de la cisaille) et fiche complète
  fidèle à la maquette validée (réglages de butée si la scie en a une, reste en plage, étiquettes).
- Butée de longueur de la scie (`stopMax`) et longueur mini (`minLength`) : seulement signalées pour
  l'instant.

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

- **Matériaux et fixation** (sections 5.x) : masse d'une pièce ou d'un profilé, perçage avant
  taraudage et trous de passage, vitesses de coupe, couples de serrage.
- **Chaudronnerie** (6.x) : virole, tronçon de cône, piquage cylindre sur cylindre, coude à
  segments, trémie carré-rond ; tableaux de traçage, gabarits PDF à l'échelle 1, export DXF.
- **Soudage** (7.x, proposé) : cordon d'angle, chanfrein, consommables et coût, préchauffage.
- **Tolérances et ajustements** (8.x, proposé) : ISO 286, ISO 2768, ISO 13920 (tables à vérifier sur
  la norme avant publication).
- **Chiffrage** (lot 4, proposé) : lit les résultats et les prix des fournisseurs, facultatif.

## Distribution

- **Mises à jour automatiques** via GitHub Releases (greffon updater de Tauri) : pas faites.
- **Installateur** : vérifier que les plugins officiels compilés sont inclus dans les ressources de
  l'application (`bundle.resources` de `tauri.conf.json`) — en production, le moteur les cherche dans
  `resources/plugins`. Pas encore configuré ni testé.
- Catalogue de plugins en ligne : bouton présent mais désactivé.
- Site de documentation pour les auteurs de plugins : non commencé.

## Limites connues

- Beaucoup d'écrans récents n'ont été vérifiés que par les types et les tests, pas à l'écran par un
  agent : l'outil de prévisualisation n'était pas disponible (voir [02-environnement.md](02-environnement.md)).
- `files::fichier_enregistrer` existe côté Rust mais aucune mini-app ne l'appelle encore.
- `PluginSettings` existe mais n'est utilisé par aucun plugin.
- Le commit `8360f99` a un caractère BOM au début de son titre (sans conséquence).
- `Pythagore.svelte` n'utilise pas encore `MiniAppDocument` (fonctionne, mais style ancien).
