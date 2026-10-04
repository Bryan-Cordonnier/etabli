# Traçage : journal des changements

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).
Le journal de l'application est à la [racine du dépôt](../../CHANGELOG.md).

## [Non publié]

## [1.2.0] — 2026-10-04

### Modifié

- Contrat « ^2 » : le moteur contrôle désormais ce que fait ce plugin ; permissions déclarées : presse-papiers, fichiers, impression. Aucun calcul ne change.

## [1.1.1] — 2026-09-29

### Modifié

- Republié avec le SDK de la version 0.2.1 d'Établi : raccourcis clavier réglés par l'utilisateur, plus d'émojis.
  Aucun calcul ne change.

## [1.1.0] — 2026-09-29

Première publication au catalogue. Développés de chaudronnerie « façon Logitrace », calculés sur la fibre moyenne.

### Ajouté

- **Virole** : développé, bout coupé en biais, découpe en plusieurs tôles si le développé dépasse la tôle disponible, masse.
- **Cône** (tronçon droit) : par hauteur, génératrice ou demi-angle ; secteurs, corde et flèche pour tracer sans compas géant.
- **Piquage** : cylindre sur cylindre, droit, incliné ou excentré ; courbe du développé, gabarit du trou.
- **Coude à segments** : extrados, intrados, segments entiers et demi-segments, longueur de tube.
- **Trémie carré-rond** : dépliage par triangulation (vraies grandeurs), soudure au milieu d'un côté.
- **Aperçu Flan ou 3D** de chaque pièce (vues 3D, face, dessus, étiquettes numérotées comme le tableau de traçage).
- **Choix Intérieur, Moyen ou Extérieur pour chaque cote** (diamètres, longueurs, largeurs), avec la cote moyenne affichée dessous.
- **Tableau de traçage** repliable et copiable, **export DXF** du développé et **gabarit à l'échelle 1** imprimé en feuilles A4.

### À vérifier

- La trémie carré-rond est testée par ses invariants (longueurs des arêtes conservées au dépliage) mais pas encore
  contrôlée sur une vraie pièce.
