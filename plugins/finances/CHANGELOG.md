# Finances : journal des changements

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).
Chaque version a sa section ; elle devient les « Nouveautés » affichées dans le catalogue.

## [Non publié]

### Modifié

- **Contrat d'API 3** : le manifeste déclare `apps` et `pages` (la colonne de gauche liste les pages, le plugin dessine son propre en-tête) au lieu de `miniApps`.

## [0.1.0] — 2026-10-04

Première version (version préliminaire, pas encore publiée dans le catalogue).

### Ajouté

- **Tableau de bord** : solde total et par compte, courbe du solde (30 jours, 90 jours ou 1 an), dépenses du mois par catégorie,
  dernières écritures, saisie rapide d'une dépense ou d'une recette, création d'un compte et de catégories.
- **Un registre qui ne s'efface jamais** : une écriture ne se modifie ni ne se supprime. Une erreur se corrige par « Annuler », qui
  ajoute l'écriture inverse : les soldes de toutes les dates redeviennent ceux d'avant l'erreur, et l'historique reste.
- **Service `finances`** pour les autres plugins (par exemple une future « Paie ») : lire les comptes, catégories, écritures, soldes à une date,
  la série du solde et les totaux par catégorie ; créer un compte ou une catégorie ; ajouter ou annuler une écriture. Chaque écriture
  porte une clé : rejouer le même appel ne crée jamais de doublon. Un plugin n'annule que ses propres écritures.
- Montants en centimes entiers (jamais d'arrondi caché : « 12,505 » est refusé), instants en UTC, jours civils à l'heure de Paris.
- **Limite connue** : le registre tient dans 3,5 Mo (environ 9 000 écritures). Plus près de la limite, un avertissement s'affiche ; au-delà,
  les nouvelles écritures sont refusées avec un message clair (rien n'est perdu). L'export et la clôture d'année ne sont pas encore là.
