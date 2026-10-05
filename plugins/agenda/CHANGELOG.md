# Agenda : journal des changements

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).
Chaque version a sa section ; elle devient les « Nouveautés » affichées dans le catalogue.

## [Non publié]

## [0.1.0] — 2026-10-05

Première version (version préliminaire, pas encore publiée dans le catalogue). Pas de rappels pour l'instant.

### Ajouté

- **Calendrier** : vue du mois, événements du jour, ajout, modification et suppression ; types travail, Retux, rendez-vous, autre.
- **Événements qui se répètent** chaque jour, semaine ou mois, jusqu'à une date (5 ans au plus) ; le 31 revient en mars après le 28 février.
- **Heures à rebours** : pour un événement avec trajet, le coucher, le réveil et l'heure de départ sont calculés depuis l'heure de début ; tous les temps (marge, préparation, sommeil, majoration du trajet) se règlent.
- **Alertes de repos légal** : 11 h entre deux journées, 10 h par journée, 48 h sur 7 jours, pour les événements de travail et Retux.
- **Export .ics** des 12 prochains mois, à ouvrir dans le calendrier du téléphone.
- **Service `agenda@1`** pour les autres plugins : lire les événements et les plages occupées, poser ou retirer un groupe d'événements (sans doublon si l'appel est rejoué).