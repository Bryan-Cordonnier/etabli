# Paie : journal des changements

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).
Chaque version a sa section ; elle devient les « Nouveautés » affichées dans le catalogue.

## [Non publié]

## [0.1.0] — 2026-10-05

Première version (version préliminaire, pas encore publiée dans le catalogue). Les montants sont des **estimations** : tous les taux sont des réglages, à confirmer sur un vrai bulletin.

### Ajouté

- **Missions d'intérim** : jours de la semaine, exclusions, horaires (une nuit passe minuit), pause, taux horaire. Le net estimé se calcule en direct (heures supplémentaires par semaine lundi → dimanche, indemnité de fin de mission, congés payés, cotisations) et la date de paie est prévue (délai réglable, jamais un week-end ni un jour férié).
- **Réserve** : jours de réserve au tarif réglé, jours hors base à l'indemnité.
- **CDI et CDD** : net mensuel, prorata en jours ouvrés le premier et le dernier mois, ligne de fin de contrat (prime de précarité et congés payés) pour un CDD.
- **Net reçu** : quand l'argent arrive, une saisie l'ajoute dans Finances, marque la paie prévue comme réalisée dans Budget et garde le bulletin.
- **Transmission** : les paies attendues partent dans Budget, les jours de mission dans l'Agenda. Sans l'un d'eux, Paie fonctionne entièrement ; ce qui n'a pas pu partir est signalé « en attente » et repart à la prochaine ouverture, sans doublon.
- **Taux** : cotisations, indemnités, majorations des heures supplémentaires, seuils, délais, tarif de réserve, précarité : tout se règle.