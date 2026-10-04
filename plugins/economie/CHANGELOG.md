# Économie de matière : journal des changements

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).
Le journal de l'application est à la [racine du dépôt](../../CHANGELOG.md).

## [Non publié]

## [0.5.0] — 2026-10-04

### Modifié

- Contrat « ^2 » : le moteur contrôle désormais ce que fait ce plugin ; permissions déclarées : presse-papiers, impression, reglages. Aucun calcul ne change.

## [0.4.0] — 2026-09-30

### Modifié

- Les fournisseurs et les machines viennent maintenant des plugins **Fournisseurs** et **Machines** (dépendances
  facultatives). Le catalogue propose de les installer avec Économie de matière, case cochée par défaut ; elle marche
  aussi sans, en saisissant les réglages à la main.
- « + Ajouter une machine… » ouvre la page de réglages du plugin Machines, avec la nouvelle machine prête à être nommée.
  Si le plugin n'est pas installé, le catalogue s'ouvre.

## [0.3.1] — 2026-09-29

### Modifié

- Republié avec le SDK de la version 0.2.1 d'Établi : raccourcis clavier réglés par l'utilisateur, plus d'émojis.
  Aucun calcul ne change.

## [0.3.0] — 2026-09-29

Première publication au catalogue.

### Ajouté

- **Débit de tubes** : le moins de barres possible, puis les chutes les plus longues.
  - Profilés : tubes carré, rectangulaire et rond, ronds et carrés pleins, plat, cornière, IPE/HEA, UPN ; dimensions,
    section et masse au mètre.
  - Une seule liste des tubes disponibles (barres entières et chutes) avec quantité et tolérance − / + ; sans quantité,
    la longueur est à acheter (longueur d'un fournisseur au choix).
  - Coupes d'angle aux deux bouts, longueur pointe à pointe, quatre poses possibles pour emboîter les coupes.
  - Poids des barres, des pièces, des chutes et de la perte.
  - Chutes réservées pour un autre projet : si les garder coûte une barre de plus, les deux résultats sont proposés.
  - Priorité à la matière ou au temps (moins de changements d'angle de scie), les deux plans sont comparés s'ils diffèrent.
  - Plan de débit en 2D (formes réelles des coupes) ou en 3D, aperçu 3D de chaque pièce.
  - Fiche de coupe imprimable avec l'ordre de coupe conseillé, groupé par angle de scie.
- **Calepinage de tôles à la cisaille** : découpe guillotine en bandes, colonnes puis pièces empilées, ordre de coupe
  groupé par réglage de butée, cotes hors butée et coupes trop longues signalées, chutes gardées au-delà d'une taille
  mini, fiche de calepinage imprimable. Accepte les flans envoyés par le développé de la Tôlerie.
