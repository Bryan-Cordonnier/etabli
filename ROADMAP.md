# Feuille de route

Ce qui est prévu pour Établi, sans dates : le projet avance par petits pas, au rythme des besoins d'atelier et des
contributions. Ce qui est **fait** est dans le [journal des changements](CHANGELOG.md). Une idée qui manque ?
[Ouvrez un ticket](https://github.com/Bryan-Cordonnier/etabli/issues/new/choose) ; on décide ensemble avant de coder.

## En cours de réflexion

- **Projets** : un dossier par projet avec un sous-dossier par plugin, déplacer un calcul dans un projet, ouvrir un projet
  partagé (clé USB, réseau), imprimer toutes les fiches d'un projet.
- **Recherche dans le catalogue** dès qu'il grandit.

## Plugins possibles

Ces plugins sont décrits dans [docs/13-specs-a-venir.md](docs/13-specs-a-venir.md) ; les proposer ou les écrire est le
meilleur moyen d'aider (voir [CONTRIBUTING.md](CONTRIBUTING.md)).

- **Soudage** : cordon d'angle, chanfrein, consommables et coût, préchauffage.
- **Tolérances et ajustements** : ISO 286, ISO 2768, ISO 13920 (tables à vérifier sur la norme).
- **Chiffrage** : lit les résultats des autres plugins et les prix des fournisseurs (facultatif).
- **Traçage, suite** : piquage cône sur cylindre, réduction excentrée, culotte, virole à pas de vis.
- **Autres métiers** : menuiserie, charpente, électricité, plomberie et chauffage… voir les discussions.

## Plus tard, si le projet grossit

- Un **catalogue hébergé** avec recherche, comptes de développeurs, vérifications automatiques et révocation d'un plugin
  dangereux, et des **catalogues tiers** signés par leurs auteurs.
- **Points d'extension** entre plugins (un plugin qui enrichit un autre, par exemple les prix d'un fournisseur réel).
- **Réglages déclaratifs** : un plugin décrit ses réglages en quelques lignes, l'application les dessine.
- Signature Windows de l'installateur (SignPath Foundation), pour ne plus avoir d'avertissement à l'installation.

## Pas prévu

- Un ERP, du multi-utilisateur, de la synchronisation en ligne : Établi reste une boîte à outils de poste de travail, locale.
- De la collecte de données ou de la publicité.
