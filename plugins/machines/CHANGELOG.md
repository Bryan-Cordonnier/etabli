# Machines : journal des changements

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).
Le journal de l'application est à la [racine du dépôt](../../CHANGELOG.md).

## [Non publié]

## [1.0.0] — 2026-09-30

Première publication. Ce plugin n'a pas de mini-app : il ajoute une page de réglages (Paramètres → Machines) et publie ses
données aux plugins qui en dépendent (service `machines`, contrat version 1).

### Ajouté

- Les scies (ruban, tronçonneuse, onglet, autre : trait de scie, angle maxi, longueur mini, dressage, butée) et les
  cisailles (longueur de lame, épaisseur maxi en acier, butée arrière, dressage) de l'atelier.
- « + Ajouter une machine… » depuis un calcul ouvre cette page avec la machine prête à être nommée.
- Reprise automatique des machines saisies dans Établi avant la version 0.3.0. Aucune machine d'exemple n'est créée : la liste
  est vide tant que vous n'en ajoutez pas.
