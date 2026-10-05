# @etabli/ui

Kit des mini-apps Établi : composants Svelte (`Card`, `Field`, `Result`, `Segmented`, `SelectField`, `Check`), état partagé
(`MiniAppDocument`, `PluginSettings`, `Libraries`) et outils sans interface (calcul saisi, fiches imprimées, DXF, gabarits).
Les composants et l'état sont décrits dans [docs/06](../../docs/06-protocole-sdk.md#etabliui-à-utiliser) ; ce fichier décrit les deux
modules **sans interface** ajoutés pour les plugins d'argent et de temps (`finances`, `paie`, `budget`, `agenda`, et plus tard l'ERP).

```ts
import { money, civil } from "@etabli/ui"; // dans une mini-app
import { formatEuros, pourcentage } from "@etabli/ui/money"; // dans une page de service : sans charger les composants Svelte
import { ajouterMois, localVersInstant } from "@etabli/ui/civil";
```

Règle commune : **une entrée invalide lève `RangeError`** (jamais un résultat faux). Les fonctions de lecture de texte (`parseEuros`,
`parseTaux`, `parseHeure`, `parseDuree`, `isoVersInstant`) renvoient `null` à la place : un champ mal saisi n'est pas une erreur du programme.

## `money` : l'argent en centimes entiers

Un montant est un **entier de centimes** (12,50 € = `1250`), borné à ±10¹² ; un taux est un **entier de points de base** (22 % = `2200`).
Aucun flottant n'entre dans un calcul : les produits passent par `BigInt`, donc `montant × taux` ne dépasse jamais 2⁵³.

| Fonction | Rôle |
| --- | --- |
| `centimes(n)`, `estCentimes(n)` | vérifie un montant (entier sûr, ±10¹²) |
| `ajouter`, `soustraire`, `somme`, `oppose`, `absolu`, `signe` | arithmétique contrôlée (hors limites : erreur ; jamais `-0`) |
| `divArrondi(n, d, regle)`, `mulDiv(montant, m, d, regle)` | division entière avec règle d'arrondi **explicite** ; `mulDiv` fait le produit exact avant l'unique division |
| `pourcentage(montant, bp, regle)` | `bp` points de base d'un montant |
| `apresPrelevement(brut, bp, regle)` | `brut × (10 000 − bp) / 10 000`, **un seul arrondi** (le net de `paie.rs`) |
| `majorer(montant, bp, regle)` | `montant × (10 000 + bp) / 10 000` |
| `repartir(total, poids)`, `repartirEgalement(total, n)` | partage sans perdre ni créer un centime (plus forts restes, le premier d'abord) |
| `formatEuros(c, { symbole, signe })` | « 1 234,56 € » (espace fine insécable des milliers, espace insécable avant « € », comme `Intl` fr-FR) |
| `parseEuros(texte)` | « 12,50 », « 12.5 », « 1 234,56 € », « −3 » → centimes ; `null` si plus de 2 décimales (jamais arrondi en silence), séparateurs incohérents, hors limites |
| `formatTaux(bp)`, `parseTaux(texte)` | 2250 ↔ « 22,5 % » (deux décimales au plus : un point de base est 0,01 %) |

**Règles d'arrondi** (`Arrondi`), pour 2,5 et −2,5 : `demi-haut` 3 / −2 (**défaut**, le `arr()` du cœur Rust : `floor((2n + d) / 2d)`) ·
`demi-eloigne` 3 / −3 (commercial) · `demi-pair` 2 / −2 (bancaire) · `bas` 2 / −3 · `haut` 3 / −2 · `zero` 2 / −2.
Le choix est un choix **métier** (à fixer avec un vrai bulletin ou une vraie facture) ; l'écrire à l'endroit de l'appel quand il
n'est pas le défaut, et ne jamais mélanger deux manières d'arrondir pour la même grandeur (`apresPrelevement(5, 5000)` = 3 mais
`5 − pourcentage(5, 5000)` = 2).

## `civil` : jours civils, instants UTC, durées

Deux sortes de dates qu'il ne faut jamais mélanger : un **jour civil** (« le 12 octobre », texte `AAAA-MM-JJ`, sans heure ni fuseau, jamais
converti en `Date`) et un **instant** (ce qui a eu lieu : millisecondes UTC entières). Une **heure du jour** est un nombre de minutes depuis
minuit (négatif = la veille, ≥ 1 440 = le lendemain). Aucune dépendance : l'arithmétique des jours est sur entiers (calendrier grégorien),
le fuseau passe par `Intl` (fuseau par défaut `Europe/Paris`, fiable à partir de 1912).

| Groupe | Fonctions |
| --- | --- |
| Jours | `jour(a, m, j)`, `estJour`, `decomposer`, `joursDansMois`, `estBissextile`, `numeroDeJour` / `jourDeNumero`, `ajouterJours`, `differenceJours`, `comparerJours`, `plage(du, au)` |
| Semaine et mois | `jourDeSemaine` (1 = lundi … 7 = dimanche), `lundiDe`, `dimancheDe`, `premierDuMois`, `dernierDuMois` |
| Mois avec fin de mois | `ajouterMois(j, n)` : le 31 janvier + 1 mois = 28 février ; pour une échéance mensuelle, **toujours repartir de la date d'origine** (`ajouterMois(origine, k)`), sinon le 31 dérive vers le 28 ; `ajouterAns` |
| Jours ouvrés | `estOuvre`, `prochainOuvre`, `precedentOuvre`, `ajouterJoursOuvres`, `compterJoursOuvres` (lundi à vendredi, hors fériés **choisis par l'appelant** : un prédicat) ; `estFerieFrance`, `feriesFrance(annee)`, `paques(annee)` |
| Heures et durées (minutes) | `normaliserMinutes`, `formatHeure` / `parseHeure` (« 08:30 », « 8h30 »), `dureeEntre(debut, fin)` (fin ≤ début : passe minuit), `formatDuree` / `parseDuree` (« 7 h 30 », « 7h30 », « 45 min ») |
| Instants et fuseau | `localVersInstant(jour, minutes, options)`, `instantVersLocal(ms)` → `{ jour, minutes, decalageMin }`, `jourDeInstant`, `debutDeJour`, `dureeDuJour` (1 380 / 1 440 / 1 500 min), `decalageMinutes`, `instantVersIso`, `isoVersInstant` (exige « Z ») |

**Changements d'heure** (testés pour mars et octobre 2026 et 2027) : une heure locale qui **n'existe pas** (02:30 le 29 mars 2026) est décalée vers
l'avant (03:30) ou refusée (`inexistant: "refuser"`) ; une heure qui **existe deux fois** (02:30 le 25 octobre 2026) prend la première
(`ambigu: "premier"`, défaut), la seconde (`"second"`) ou est refusée (`"refuser"`). Une durée entre deux instants se calcule toujours en
soustrayant les instants, jamais les heures locales (une nuit de 22 h à 8 h dure 9 h le 29 mars, 11 h le 25 octobre).

## Tests

`npm test -w @etabli/ui` : `money.test.ts` et `civil.test.ts` (cas limites : demi-centimes aux deux signes, produits de 10¹² centimes, textes
mal formés, février bissextile, fin de mois, semaines à cheval sur deux années, fériés de 2026, changements d'heure, aller-retour
instant ↔ heure locale sur toute l'année 2026 par demi-heures). Voir [docs/24](../../docs/24-spec-plugins-budget.md) (M10).
