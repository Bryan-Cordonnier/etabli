# Fournisseurs : journal des changements

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).
Le journal de l'application est à la [racine du dépôt](../../CHANGELOG.md).

## [Non publié]

## [1.1.0] — 2026-10-04

### Modifié

- Contrat « ^2 » : le moteur contrôle désormais ce que fait ce plugin ; aucune permission (ce plugin n'enregistre, n'imprime ni n'envoie rien). Aucun calcul ne change.

## [1.0.0] — 2026-09-30

Première publication. Ce plugin n'a pas de mini-app : il ajoute une page de réglages (Paramètres → Fournisseurs) et publie
ses données aux plugins qui en dépendent (service `fournisseurs`, contrat version 1).

### Ajouté

- Une liste de fournisseurs, chacun avec la matière qu'il vend : type de profilé ou tôle, nuance, dimension, longueur de
  barre ou format de tôle, tolérance − / +, prix facultatif (par pièce, kg, mètre ou m²).
- Reprise automatique des fournisseurs saisis dans Établi avant la version 0.3.0.
