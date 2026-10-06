# 10 — Plugins existants

Since 6 October 2026 this repository no longer contains the seven metalworking plugins (Maths, Economy, Sheet metal, Layout, Materials, Suppliers, Machines): see the tag `legacy/etabli-0.5-chaudronnerie` and [docs/22](22-cahier-de-bord.md). What remains are the personal-budget plugins, which will move to the private Quotidien repository.

| Plugin | Version | Mini-apps | Tests |
| --- | --- | --- | --- |
| `finances` Finances | 0.1.0 | 1 + service `finances@1` | 46 |
| `agenda` Agenda | 0.1.0 | 2 + services `agenda@1`, `rappels@1` | 62 |
| `budget` Budget | 0.1.0 | 2 + service `budget@1` | 36 |
| `paie` Paie | 0.1.0 | 1 | 30 |

The `@etabli/ui` kit has its own tests (`money`, `civil`, chart geometry, calculated input).
--- | --- | --- | --- |
| `maths` Maths et géométrie | 1.0.0 | 7 | 31 |
| `economie` Économie de matière | 0.3.0 | 2 | 60 |
| `tolerie` Tôlerie | 1.0.0 | 2 | 11 |
| `tracage` Traçage (ex-« Chaudronnerie ») | 1.1.0 | 5 | 32 |
| `materiaux` Matériaux et fixation | 1.0.0 | 4 | 21 |
| `finances` Finances (hors catalogue officiel) | 0.1.0 | 1 + service `finances@1` | 46 |

Le kit `@etabli/ui` a 201 tests (calculs saisis, format, collage Excel, DXF, `money`, `civil`, géométrie des graphiques).

---

## Finances (`plugins/finances`)

Version préliminaire (0.1.0), écrite d'après [docs/24](24-spec-plugins-budget.md). L'argent **réel** seulement : le prévu sera dans `budget`.
**Hors catalogue officiel** : le plugin est construit avec les autres (`npm run build:plugins`, version web) mais n'est pas publié ; c'est une décision
de Bryan (plugins privés par défaut, docs/24 §11).

| Fichier | Rôle |
| --- | --- |
| `src/types.ts` | modèle (`Compte`, `Categorie`, `Ecriture`, `Registre`), `ErreurFinances` (codes permis à un fournisseur) |
| `src/validation.ts` | validation stricte des arguments : objet sans champ inconnu, centimes entiers, jours qui existent, clé d'idempotence |
| `src/registre.ts` | lecture prudente (des données illisibles donnent une **erreur**, jamais un registre vide qui écraserait tout), limite de taille |
| `src/operations.ts` | `creerCompte`, `creerCategorie`, `ajouterEcriture`, `annulerEcriture` : fonctions pures, registre en entrée, registre neuf en sortie |
| `src/calculs.ts` | `soldeCompte`, `soldesALaDate`, `serieParJour`, `totauxParCategorie` |
| `src/service.ts` | `executer(enregistre, fonction, args, appelant, maintenant)` : les dix fonctions de `finances@1` |
| `service/main.ts` | page `serviceEntry` (aucune interface) : lit et écrit `etabli.settings`, traduit `ErreurFinances` en `ServiceError` |
| `src/tableau.ts`, `apps/tableau/` | vue du tableau de bord (pure, testée) et écran mince ; l'écran passe par `executer` comme un plugin, avec la source `@utilisateur` |

**Règles** : montants en centimes entiers ; `quand` en millisecondes UTC, `jour` civil calculé une fois dans le fuseau figé de l'écriture (Europe/Paris) ;
aucune écriture ne se modifie ni ne se supprime ; `ecritures.annuler` ajoute l'inverse (même compte, **même instant**, montant opposé) pour que les soldes
de toutes les dates redeviennent ceux d'avant l'erreur ; la source est celle du moteur (un champ `source` dans les arguments est refusé) ; un plugin n'annule
que ses écritures ; pas d'écriture dans le futur (au-delà de 24 h), avant l'ouverture du compte ni avant l'an 2000 ; une catégorie « dépense » refuse une
entrée d'argent (et inversement) ; une clé d'idempotence rejouée rend le même identifiant (`rejoue: true`), avec d'autres données elle est refusée. Avec un `sens`,
`totaux.parCategorie` ignore ensemble une écriture annulée et son annulation.

**Stockage et limite** : tout le registre est dans les réglages du plugin (un appel = un cadre neuf). Plafond 3,5 Mo (le moteur refuse 4 Mo par message,
5 Mo par réglage) : au-delà, `limite_atteinte` avec « rien n'a été enregistré », sans perte silencieuse ; avertissement dès 2,8 Mo dans le tableau de bord.
Environ 9 000 écritures. **Non fait** : export, clôture d'année, import. **Piège connu du moteur** : si la lecture des réglages échoue, le moteur donne `null` comme
pour « rien d'enregistré » ; une écriture arrivant ensuite créerait un registre neuf et écraserait l'ancien (à corriger côté moteur : distinguer l'erreur d'une absence).

**Tests** : `src/service.test.ts` (36 : manifeste = service, validation, idempotence, annulation, soldes, série, totaux, pages de 1 000, limite de taille, registre
illisible), `src/tableau.test.ts` (10 : vue, formulaire) ; essai réel dans Chromium : `node scripts/essai-appels.mjs` (appel complet du vrai plugin et ouverture du tableau).

## Agenda (`plugins/agenda`)

Le temps : événements, calendrier, heures à rebours, repos légal, **rappels sur le téléphone** (notifications, jamais d'alarme, rien sur PC). Spécification : [docs/24](24-spec-plugins-budget.md).

| Fichier | Rôle |
| --- | --- |
| `src/types.ts` | `Evenement`, `Occurrence`, `Carnet`, `Reglages`, codes d'erreur ; `UTILISATEUR` |
| `src/carnet.ts` | lecture du carnet (réglages du plugin) : **vide si rien n'est enregistré, erreur `illisible` si les données sont abîmées** (jamais un carnet vide à la place) ; validation d'un événement |
| `src/operations.ts` | ajouter, modifier, supprimer, `remplacer` (idempotent par `cle`), `supprimerGroupe` ; espace propre : un plugin ne touche qu'à ce qu'il a posé |
| `src/calculs.ts` | répétitions (jour, semaine, mois depuis l'origine : le 31 revient en mars), plages absolues, **repos légal** (11 h, 10 h, 48 h) et **chronologie à rebours** : ports de `horaires.rs` et `repos.rs` de gestion-budget-perso, avec leurs tests comme vecteurs d'or |
| `src/ics.ts` | export iCalendar, heures flottantes, lignes pliées à 75 octets |
| `src/service.ts`, `service/main.ts` | service `agenda@1` : `evenements.liste`, `plages.occupees` (lecture), `evenements.remplacer`, `evenements.supprimer` (écriture) |
| `src/vue.ts`, `apps/calendrier/` | grille du mois, jour, écran Calendrier |
| `src/rappels.ts`, `apps/rappels/` | service `rappels@1` (`rappels.remplacer`, `rappels.annuler`, `rappels.etat`) : l'Agenda est le **seul** plugin à détenir la permission `notifications`, les autres lui confient leurs rappels (par plugin et par groupe, jamais mélangés) ; rappels calculés « pars dans X min », « pars maintenant », « coucher » pour les événements avec trajet ; liste COMPLÈTE envoyée au moteur à chaque changement et à chaque ouverture (horizon de 60 jours) ; écran « Rappels » (état du téléphone, d'où viennent les rappels, annuler, essai dans 1 minute) |

Limites : 500 événements par appel, 2 000 par plugin, 5 000 occurrences par lecture, fenêtre de 5 ans, carnet de 3,5 Mo, 200 rappels par plugin appelant et 200 envoyés au téléphone (les plus proches). Un événement dont la fin est avant ou égale au début passe minuit ; début = fin est refusé.
Choix de conception (à valider) : types `travail`, `retux`, `rdv`, `autre` ; seuls `travail` et `retux` comptent pour le repos légal ; icône `clock` (le moteur n'a pas d'icône calendrier).
Rappels : `niveau` n'accepte que `notification` (les alarmes sont refusées) ; `ouvre` n'existe pas ; un rappel est refusé s'il est dans le passé ; notifications refusées ou PC = `programmes: 0` avec une `raison`, jamais une erreur ; un carnet de la première version se relit (réglages de rappels absents = valeurs de départ).
**Pas vérifié à l'écran** : les écrans Calendrier et Rappels n'ont été ni ouverts ni vus (types, tests et construction seulement). **Aucun rappel n'a sonné sur un vrai téléphone** : le programmeur est testé avec un faux plugin de notifications ; l'APK et les autorisations Android restent à essayer.

## Budget (`plugins/budget`)

Le **prévu** ; dépend de Finances (obligatoire). Spécification : [docs/24](24-spec-plugins-budget.md). Budget ne calcule jamais le solde : il le **demande** à Finances (`services.call`).

| Fichier | Rôle |
| --- | --- |
| `src/types.ts` | `Prevision` (statut `attendue`, `realisee`, `abandonnee`), `Virement`, `Abonnement`, `Enveloppe`, `Plan` ; sources `@utilisateur` et `@budget` |
| `src/plan.ts` | lecture du plan (**vide si rien n'est enregistré, erreur `illisible` si les données sont abîmées**) et `synchroniser` : crée les échéances manquantes des virements et abonnements (de J−31 à J+180), sans jamais recréer une échéance existante, quel que soit son statut |
| `src/operations.ts` | ajouter, abandonner, réaliser ; virements, abonnements, plafonds, seuil ; `remplacer`, `supprimer`, `realiser` pour le service (idempotent par `cle`, espace propre) |
| `src/calculs.ts` | échéances (semaine, mois depuis l'origine, an), **courbe** (solde d'aujourd'hui + attendues, plancher, jours sous le seuil, en retard), **budget du mois** par catégorie |
| `src/finances.ts` | ce que Budget lit dans Finances (`comptes.liste`, `categories.liste`, `soldes.aLaDate`, `totaux.parCategorie`) et écrit (`ecritures.ajouter`, clé `budget-<id>`) ; fonctions pures, appelant injecté |
| `src/service.ts`, `service/main.ts` | service `budget@1` : `previsions.liste` (lecture), `previsions.remplacer`, `previsions.supprimer`, `previsions.realiser` (écriture) |
| `src/session.svelte.ts`, `apps/courbe/`, `apps/previsions/` | état partagé et deux écrans : « Courbe du mois » et « Prévisions » |

Une prévision attendue d'**aujourd'hui** compte dans la courbe ; une attendue d'hier ou plus ancienne est « en retard », ne compte pas et n'est **jamais** réalisée automatiquement. On ne confirme qu'à partir du jour prévu (Finances refuse le futur).
Écart avec docs/24 : `previsions.realiser` accepte un `jour` facultatif (pour une paie parmi plusieurs) ; les prévisions peuvent n'avoir pas de compte (`null`, à choisir avant de confirmer).
**Pas fait** : agenda (rappel de virement), simulateur de déménagement, paliers et runway, trois scénarios.
**Pas vérifié à l'écran** : les deux écrans n'ont été ni ouverts ni vus (types, tests, construction), ni l'appel réel de Finances depuis un cadre.
## Paie (`plugins/paie`)

Programmer sa paie de **particulier** : missions d'intérim, réserve, CDI et CDD. Spécification : [docs/24](24-spec-plugins-budget.md). Ne fournit aucun service (personne n'en a besoin) ; Budget, Finances et l'Agenda sont des dépendances **facultatives**.
**Les montants sont des estimations** : aucun taux n'est en dur, tout est un réglage (`Reglages`), et les valeurs par défaut (cotisations 22 %, indemnité hors base 38 €…) sont des hypothèses à confirmer sur un bulletin.

| Fichier | Rôle |
| --- | --- |
| `src/types.ts` | `Mission`, `PeriodeReserve`, `Contrat`, `Reglages`, `Bulletin`, `Donnees` (dont `transmis`, le suivi de ce qui est parti) |
| `src/donnees.ts` | lecture stricte (**vides si rien n'est enregistré, erreur `illisible` si abîmées**), saisies validées, opérations |
| `src/calculs.ts` | **intérim** (semaines lundi → dimanche, heures supplémentaires à deux majorations, brut de base → IFM → congés payés → net), **réserve**, **CDI/CDD** (prorata en jours ouvrés, fin de contrat), date de paie |
| `src/projection.ts` | ce que Paie transmet : une prévision de net par mission, période ou paie de contrat (Budget) ; un événement par jour de mission (Agenda) ; empreinte du contenu |
| `src/transmission.ts` | `transmettre` (renvoie ce qui a changé, retire ce qui n'existe plus, tolère l'absence d'un plugin) et `saisirNetRecu` (Finances → Budget → bulletin) ; appelant injecté, testé sans moteur |
| `src/session.svelte.ts`, `apps/paie/` | état et écran à quatre rubriques : Intérim, Réserve, Contrats, Taux |

Vecteur d'or (`paie.rs`) : 5 jours de 7 h à 13 € → brut 455 €, IFM 45,50 €, congés 50,05 €, net **429,43 €**.
Écarts avec docs/24 : les heures supplémentaires ont **deux majorations légales** (+25 % jusqu'à 8 h par semaine, +50 % au-delà) au lieu d'un `taux_sup` par mission ; IFM, congés et net se calculent sur le total de la mission, pas semaine par semaine ; une saisie de net reçu retire l'attendu de Budget pour cette mission.
**Pas fait** : comparaison de deux missions, compteur annuel de la réserve et conflit mission/réserve, événements de réserve dans l'Agenda (horaires inconnus), rappel du jour de paie (étape 5), modification d'une mission existante (supprimer puis recréer).
**Pas vérifié à l'écran** : l'écran n'a été ni ouvert ni vu (types, tests et construction), ni les appels réels vers Budget, Finances et l'Agenda depuis un cadre du moteur.
