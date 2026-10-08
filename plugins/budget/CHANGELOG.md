# Budget : journal des changements

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).
Chaque version a sa section ; elle devient les « Nouveautés » affichées dans le catalogue.

## [Non publié]

### Modifié

- **Contrat d'API 3** : le manifeste déclare `apps` et `pages` (la colonne de gauche liste les pages, le plugin dessine son propre en-tête) au lieu de `miniApps`.

## [0.1.0] — 2026-10-05

Première version (version préliminaire, pas encore publiée dans le catalogue). Nécessite le plugin Finances.

### Ajouté

- **Courbe du mois** : « combien j'aurai à telle date », le solde réel d'aujourd'hui (lu dans Finances) puis les prévisions attendues sur 30, 60 ou 90 jours ; point le plus bas, jours sous un seuil que vous fixez.
- **Prévisions en retard** : une prévision passée sans être confirmée est signalée ; vous la confirmez (l'écriture réelle est ajoutée dans Finances, jamais en double) ou vous l'abandonnez.
- **Prévisions** : ajout à la main, liste des 60 prochains jours.
- **Virements entre comptes** (une fois, chaque semaine ou chaque mois) pour que le compte bancaire colle à la réalité.
- **Abonnements** (semaine, mois, année) avec marqueur « à résilier ».
- **Plafonds par catégorie** : ce qui est dépensé, ce qui est encore prévu, ce qui reste.
- **Service `budget@1`** pour les autres plugins (la paie, par exemple) : lire les prévisions, poser ou retirer un groupe de prévisions attendues (sans doublon si l'appel est rejoué), les marquer réalisées.