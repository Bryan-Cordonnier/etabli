# 24 — Spécification : plugins « agenda », « finances », « paie » et « budget » (reprise de gestion-budget-perso) — brouillon

> **Statut : brouillon, documentation seulement.** Aucun code n'est écrit. Aucune étape de code ne démarre avant la validation de Bryan (règle d'`AGENTS.md`).
> Documents liés : [06](06-protocole-sdk.md) (SDK), [07](07-creer-un-plugin.md) (plugin), [08](08-documents-donnees.md) (données),
> [16](16-spec-serveur-utilisateurs-mobile.md) (serveur, mobile), [19](19-modele-de-menace-plugins.md) (isolation, permissions).
> La spécification des **distributions** est `docs/23-spec-distributions.md` (branche `spec-distributions`, pas encore fusionnée : d'où l'absence de lien).

## L'essentiel en 15 lignes (à lire d'abord)

- Le moteur d'Établi est fait de **blocs séparés : les plugins**. Chacun se met à jour seul ; il n'y a jamais de mise à jour groupée.
- Chaque plugin écrit dans son **manifeste** (sa fiche d'identité) : (a) les **fonctions qu'il offre** aux autres plugins ; (b) les **plugins dont il a besoin**
  (obligatoires) ou qu'il **utilise s'ils sont là** (facultatifs).
- Un plugin **appelle la fonction d'un autre** : le moteur transmet la demande, l'autre plugin fait le travail, le moteur rend la réponse.
- Exemple : « le plugin `finances` veut ajouter un rappel de paiement le 12 octobre » → il appelle la fonction « ajouter un rappel » de l'`agenda`, et l'agenda l'ajoute.
- Une **seule mécanique** à construire dans le moteur : « appeler la fonction X du plugin Y avec ces arguments, recevoir la réponse ». La permission correspondante
  est montrée à l'installation (« Finances veut ajouter des rappels dans l'Agenda »).
- Les quatre plugins : **`agenda`** (le temps, les rappels), **`finances`** (combien d'argent tu as : l'argent réel), **`paie`** (programmer sa paie, pour les particuliers),
  **`budget`** (ce qui est prévu : virements programmés, dépenses du mois).

```
          paie ──────────┬──────────► budget ─────┐
           │             │              │         │
           │             ▼              ▼         ▼
           └───────► finances ─────► agenda ◄─────┘
   flèche = « appelle une fonction de »  (finances : l'argent réel · budget : le prévu · agenda : dates et rappels)
```

Si un plugin n'est pas là : un plugin **facultatif** manque → l'écran le dit et le reste marche ; un plugin **obligatoire** manque → le moteur le dit à l'installation.
Tous les détails d'implémentation (sécurité, doublons, versions…) sont dans l'**annexe technique** en fin de document, « pour le développeur ».

---

# Première partie — Inventaire de `gestion-budget-perso`

## 1. Ce que c'est

Un dépôt de Bryan (3 octobre 2026, quelques commits) : application personnelle « Budget & Planning » pour la période
intérim + réserve + Retux. Il contient :

| Élément | Contenu |
| --- | --- |
| `CAHIER_DES_CHARGES.md` (v0.1, 18 Ko) | 14 sections : calendrier, paie, trésorerie, foyer, prévision, Retux, documents, modèle de données, plan en 6 étapes, choix techniques, risques, points à confirmer |
| `crates/core` (Rust, 597 lignes dont ~45 % de tests) | `paie.rs` (net intérim et réserve), `horaires.rs` (départ, réveil, coucher à rebours), `repos.rs` (11 h, 10 h, 48 h) ; dépendance unique : `serde` |
| `crates/wasm` (72 lignes) | pont `wasm-bindgen` : JSON en entrée, JSON en sortie, `{"erreur": …}` si entrée invalide |
| `web/` (Svelte 5 + Vite, ~1 400 lignes hors glue WASM) | `App`, 4 vues (Agenda, Missions, Réserve, Réglages), composants (Calendrier, JourPanel…), `planning.ts`, `ics.ts`, `dates.ts`, `store.svelte.ts` |
| `docs/SPEC-MOTEUR-SERVEUR.md` | ancienne version de [16](16-spec-serveur-utilisateurs-mobile.md), déjà reprise dans Établi |
| `scripts/build-wasm.mjs`, `.github/workflows/ci.yml` | compilation WASM (`wasm-bindgen-cli` 0.2.129 épinglé) ; CI |

Le cahier des charges écarte lui-même « système de plugins et d'iframes » (§13) : c'est le choix qu'on renverse ici.

## 2. Prévu et réellement codé

| Fonction du cahier des charges | Prévu | Codé | Détail |
| --- | --- | --- | --- |
| Calendrier mensuel, panneau du jour, couleurs par type | §4.1 | **oui** | `Calendrier.svelte` (83 l.), `JourPanel.svelte` (138 l.) |
| Mission d'intérim (jours de semaine, horaires, pause, taux, taux sup, seuil, statut, exclusions, « +1 h ce soir ») | §4.2, 4.4 | **oui** | `Missions.svelte`, `planning.ts` ; sélection par jours de semaine + exclusions (pas de saisie « jour par jour » sur le calendrier) |
| Jours de réserve (hors base, tarif, indemnité) | §4.3 | **oui** | `Reserve.svelte` ; pas de planning annuel en lot ni de compteur « 50 jours par an » |
| Rendez-vous | §4.5 | **oui** | titre, adresse, heure, durée, trajet **saisi à la main**, marge |
| Net d'intérim et de réserve (IFM, CP, cotisations en points de base) | §5.1, 5.2 | **oui** | `paie.rs`, 9 tests dont les chiffres du cahier des charges |
| Heures de départ, réveil, coucher, pré-alertes | §4.7 | **oui** | `horaires.rs`, 4 tests ; l'exemple du cahier (décision à 7 h 10) est un test |
| Alertes de repos (11 h, 10 h/jour, 48 h/semaine) | §4.9 | **cœur oui, interface non vérifiée** | `repos.rs`, 5 tests ; branchement dans l'interface non relevé |
| Export `.ics` avec alarmes | §13 (filet iPhone) | **oui** | `ics.ts` (52 l.), 2 tests ; dates « flottantes » (sans fuseau) |
| Stockage | §13 | **`localStorage` seulement** | `store.svelte.ts`, clé `budget-planning-v1`, un seul objet JSON |
| Rappels réels (alarmes Android, Capacitor) | §4.8, R1 | **non** | l'essai natif a été fait dans Établi (branche `alarme-natif`, 4 octobre 2026) : alarmes et notifications programmées justes à la seconde sur le téléphone de Bryan |
| Calcul d'itinéraire (OSRM), géocodage, heures de pointe | §4.6 | **non** | trajet saisi en minutes ; majoration en pourcentage seulement |
| Calibrage sur bulletin, écart estimé/réel, prévu → confirmé → reçu, date de paiement estimée | §5.3, 5.4 | **non** | statut `prevu`/`confirme` seulement ; pas de gain net après carburant |
| Coût de vie, réserve d'argent, runway, 3 scénarios, paliers, simulateur de déménagement, abonnements | §6 | **non** | **aucun écran de budget n'existe** : le projet est en réalité un planning de paie |
| Prévision mensuelle et allocation (sécurité, PEA, Retux) | §8 | **non** | |
| Foyer / colocation, comptes, serveur, hors ligne | §3, 7 | **non** | repris dans Établi (docs/16, 17) |
| Retux, voiture, documents, dettes, journal de décisions, import CSV | §9, 10 | **non** | |

Constat honnête : **environ 20 % du cahier des charges est codé** (étape 1 partielle, sans rappels ni trajets), et c'est la partie
« agenda + paie » ; la partie « budget » (étapes 2 et 3, qui est l'objectif de vie de Bryan : matelas de 6 000 €, runway) n'existe qu'en texte.

## 3. Taille et qualité

| Mesure | Valeur |
| --- | --- |
| Rust | 669 lignes (core 597, pont 72) ; 1 dépendance (`serde`) côté cœur ; module `.wasm` de 195 Ko |
| TypeScript/Svelte | ~1 400 lignes (libs ~600, vues ~370, composants ~250, tests ~185) |
| Tests | Rust : 18 dans le cœur + 3 dans le pont ; Vitest : 17 (dates 6, ICS 2, planning 9) ; Playwright : 1 parcours (`e2e/parcours.spec.ts`). **Non exécutés ici** (lecture seule) |
| Montants | **centimes entiers partout** (`i64` côté Rust, `*Cents` côté TypeScript) ; pourcentages en **points de base** ; arrondi explicite `div_arrondi` (moitié vers le haut) ; aucun flottant d'argent côté cœur |
| Durées | minutes entières ; heure du jour = minutes depuis minuit, **négative = la veille** (coucher), `fin <= debut` = passe minuit |
| Dates | `AAAA-MM-JJ` **locales** (jour civil), heures en minutes ; l'`.ics` écrit des dates « flottantes » sans fuseau. **Aucune date en UTC** (le besoin UTC est donc nouveau) |

Qualité : le cœur est **petit, pur, lisible, bien testé** (les cas limites sont couverts : nuit passant minuit, semaines indépendantes,
mission vide, entrée invalide). Faiblesses relevées :

- `Agenda.svelte` recalcule le net du mois en dupliquant une partie de la logique de paie en TypeScript (`Math.round(… * pct / 100)`),
  ce qui contredit le principe « un seul cerveau » ; « approximation en limite de semaine » avouée dans le commentaire.
- Les heures supplémentaires se comptent par semaine **lundi → dimanche** ; une journée de nuit est rattachée au jour de début.
  Ce sont des simplifications de paie à confirmer sur un vrai bulletin (cahier §14, points 2 et 3).
- Cotisations à 22 % forfaitaires et indemnité de réserve de 38 € : **hypothèses non confirmées** (§14 du cahier).
- Pas de versionnage de format au-delà de `version: 1` ; migration = repartir de zéro si la version diffère (`store.svelte.ts`).
- `crypto.randomUUID()` pour les identifiants (à vérifier dans un cadre isolé, voir M16).

## 4. Ce qui se reprend, se réécrit, se jette

| Élément | Verdict | Pourquoi |
| --- | --- | --- |
| **Formules et jeux de tests** de `paie.rs`, `horaires.rs`, `repos.rs` | **reprendre tels quels** (comme spécification exécutable) | ce sont les 18 cas de test, avec leurs valeurs attendues ; ils deviennent des « vecteurs d'or » (annexe A.4) |
| Cœur Rust lui-même | **porter en TypeScript** (recommandé, annexe A.4) ; le dépôt reste la référence | ~450 lignes de calcul, aucune dépendance native |
| Pont `wasm-bindgen`, `build-wasm.mjs`, `wasm.ts` | **abandonner** si TypeScript | n'a de sens que pour du WASM |
| `dates.ts`, `ics.ts` | **reprendre en les adaptant** | utilitaires de dates civiles (lundi → dimanche, plages) et génération `.ics` ; à compléter (UTC, fuseau) |
| `planning.ts` (jours de mission, regroupement par semaine, événements du jour, rappels) | **reprendre** (logique) | c'est le « colle » entre données et cœur ; à réécrire au format des données d'Établi |
| `types.ts` | **reprendre en le refondant** | modèle trop plat (un objet unique) ; voir section 6 |
| `store.svelte.ts` (`localStorage`) | **jeter** | remplacé par `PluginSettings`/documents du SDK (annexe A.2) |
| Vues Svelte (Agenda, Missions, Réserve, Réglages), composants | **réécrire avec `@etabli/ui`** | `Field`, `SelectField`, `Segmented`, `Card`, `Result` font déjà le travail ; seul le **calendrier** (grille de mois, 83 l.) est à reprendre |
| Thème sombre, Inter/JetBrains Mono, lucide | **jeter** | fournis par le moteur (thèmes, `base.css`) ; le sombre par défaut devient un réglage de la **distribution** |
| Cahier des charges §3 (comptes), §13 (stack Capacitor, serveur axum, SQLite, VPN) | **obsolète** | remplacé par le moteur : serveur facultatif (docs/17), Capacitor (`apps/mobile`), IndexedDB |
| `SPEC-MOTEUR-SERVEUR.md` | **obsolète** | déjà intégré dans docs/16 |
| Foyer, Retux, voiture, documents, dettes, import bancaire | **repousser** | hors du premier périmètre (section 5) |
| **Surdimensionné** (Bryan le sait) | cœur Rust + pont WASM + serveur axum + OSRM auto-hébergé pour un utilisateur | la **valeur** est dans les règles de calcul et les tests ; on les garde, on jette la machinerie. Mutualiser = écrire les règles **une fois**, dans le moteur de plugins qui existe déjà |

---

---

# Deuxième partie — Spécification des plugins

## 5. Découpage en plugins

Règle voulue par Bryan : **chaque plugin se met à jour seul, même dans un pack ; jamais de mise à jour groupée.** Une dépendance veut seulement dire « j'ai besoin d'une fonction d'un autre plugin ».

| Plugin (id) | Rôle en une phrase | Mini-apps | Dépend de | Fonctions offertes aux autres |
| --- | --- | --- | --- | --- |
| **`agenda`** | le temps : événements, calendrier, repos légal ; **seul à avoir le droit de sonner** (permission notifications) et envoie les rappels que les autres lui demandent | Calendrier ; Rappels et horaires ; réglages | rien | ajouter/retirer un rappel, ajouter un événement, lire les plages occupées |
| **`finances`** | un tableau de bord + le plugin qui **retient combien d'argent tu as** : comptes, soldes, écritures (entrées et sorties **réelles**), courbes. C'est lui qu'on appelle pour **ajouter ou retirer de l'argent** | Tableau de bord ; Écritures ; Comptes et catégories ; Courbes ; réglages | `agenda` (facultatif : rappels de paiement) | lire soldes, comptes, écritures, courbes ; ajouter une écriture ; annuler une écriture |
| **`budget`** | le **prévu** : budget du mois, virements programmés pour coller au compte bancaire, dépenses prévues, courbe « combien j'aurai à telle date » ; il **lit** `finances` | Budget du mois ; Virements ; Abonnements ; Simulateur ; réglages | `finances` (obligatoire) ; `agenda` (facultatif) | ajouter/remplacer/lire des prévisions |
| **`paie`** | pour les **particuliers** : programmer sa paie (CDI, CDD, missions d'intérim, réserve) | Contrats ; Missions d'intérim ; Réserve ; Bulletins ; réglages | `budget`, `finances`, `agenda` : tous **facultatifs** | aucune (personne n'a besoin d'elle) |
| *plus tard* `foyer`, `retux-suivi`, `voiture` | colocation, marge par PC, entretien | — | `finances` | — |

- **`finances` = l'argent réel.** Ce qui s'est passé : une entrée, une sortie. Registre en ajout seulement : on ne corrige pas, on **annule** par une écriture inverse. Généraliste (l'ERP pourra s'en servir) : rien de propre aux particuliers.
- **`budget` = le prévu.** Un virement programmé, une dépense prévue, une paie attendue : tout ça vit dans `budget`, jamais dans `finances`. Quand l'argent passe vraiment, `budget` demande à `finances` d'ajouter l'écriture réelle.
- **Hors périmètre de `finances`** : comptabilité légale (TVA, factures, avoirs, plan comptable, numérotation légale). Retux Panel garde la sienne.
- **Qui appelle qui** : `paie` pose ses paies attendues dans `budget`, le net reçu dans `finances`, les missions dans `agenda` ; `budget` lit `finances` et `agenda` ; `finances` peut demander un rappel à l'`agenda`. Personne n'appelle plus loin : pas de chaîne.

**Pourquoi un seul plugin `paie`** (avis inchangé) : intérim, réserve, CDI et CDD partagent les mêmes calculs (cotisations, semaines, arrondis) et Bryan les utilise ensemble ; un seul plugin évite de les recopier
et de figer trop tôt des échanges entre trois plugins. Il sera rangé en modules par type de contrat, donc facile à scinder plus tard si besoin (comparaison détaillée : annexe A.5).

## 6. Modèle de données

Règles communes : **montants en centimes entiers** (jamais de virgule flottante, « 12,50 » est lu comme du texte) ; taux en points de base (2200 = 22 %) ; durées en minutes ; dates : jour civil `AAAA-MM-JJ`
pour « le 12 octobre à 8 h », instant UTC pour ce qui a eu lieu ou doit sonner ; **rien de financier en dur** (cotisations, seuils, tarifs : des réglages) ; on ne recalcule pas le passé.

**`finances`** (argent réel)

| Entité | Champs principaux |
| --- | --- |
| `Compte` | nom, type (courant, épargne, espèces, autre), solde initial, ouvert le, archivé |
| `Categorie` | nom, catégorie parente, sens (entrée, sortie, les deux), couleur |
| `Ecriture` (**ajout seulement**) | compte, montant signé, date et heure (UTC), jour civil, catégorie, libellé, plugin d'origine, `annule` (l'écriture qu'elle annule) |
| Réglages | fuseau, premier jour du mois |

Solde d'un compte = solde initial + total des écritures jusqu'à la date. Pas de « prévu » ici.

**`budget`** (le prévu)

| Entité | Champs principaux |
| --- | --- |
| `Prevision` | jour, montant signé, compte, catégorie, libellé, plugin d'origine, statut (`attendue` · `realisee` · `abandonnee`), écriture réelle liée |
| `Virement` | libellé, montant, compte source et cible, jour, répétition, rappel (oui/non) : devient deux prévisions |
| `Abonnement` | libellé, montant, périodicité, prochaine échéance, à résilier |
| `Budget` du mois | enveloppes par catégorie (plafond) ; paliers, scénarios, simulation |

**`agenda`** : événements (type, titre, lieu, jour, début/fin en minutes, trajet, répétition, plugin d'origine), demandes de rappel par plugin, réglages (marges, sommeil, fuseau).
**`paie`** : contrats (CDI/CDD/intérim), missions d'intérim, périodes de réserve, paies attendues, bulletins (figés avec leurs taux), réglages de taux. Détail des champs : annexe A.1.

## 7. Écrans (par plugin)

Interface Établi (colonne de plugins, onglets, thèmes) ; chaque écran = une mini-app.

**`agenda`** : *Calendrier* (mois/semaine/jour, chronologie à rebours coucher → réveil → départ, alertes de repos, export `.ics`) ; *Rappels et horaires* (réglages, test d'un rappel, rappels
programmés par plugin avec « tout annuler ») ; réglages.

**`finances`** : *Tableau de bord* (soldes par compte, dernières écritures) ; *Écritures* (liste filtrable, ajout, **annulation**, jamais de suppression) ; *Comptes et catégories* ;
*Courbes* (solde par jour, dépenses par catégorie) ; réglages (liste des plugins qui écrivent).

**`budget`** : *Budget du mois* (enveloppes, **diagramme des dépenses prévues**, reste à vivre) ; *Courbe du mois* (« à telle date, j'aurai X € », avec le réel de `finances` puis le prévu) ;
*Virements* (planifier des dates pour que le compte bancaire colle, rappel facultatif) ; *Abonnements* ; *Simulateur de déménagement* ; *Paliers et runway*.

**`paie`** : *Contrats* (CDI, CDD) ; *Missions d'intérim* (net en direct, comparaison de deux missions, pose sur l'agenda) ; *Réserve* (jours, hors base, compteur annuel, conflit avec une mission) ;
*Bulletins* (net réel, écart) ; réglages ; indicateur « transmis à Budget / Finances / Agenda ».

## 8. Calculs (spécification)

Tous en entiers ; `arr(n, d) = floor((2n + d) / 2d)` (moitié vers le haut) ; `bp` = points de base.

**Intérim** (`paie.rs`, par semaine lundi → dimanche) : `normales = min(planifié, seuil)` ; `sup = max(planifié − seuil, 0) + sup_manuel` ;
`brut_base = arr(normales × taux, 60) + arr(sup × taux_sup, 60)` ; `ifm = arr(brut_base, 10)` ; `cp = arr(brut_base + ifm, 10)` ;
`brut_total = brut_base + ifm + cp` ; `net = arr(brut_total × (10 000 − cotisations_bp), 10 000)`. Nuit : `fin ≤ début` ajoute 24 h ; pause déduite.
Référence (vecteur d'or) : 5 × 7 h à 13 € → net 429,43 €.

**Réserve** : `net = arr(jours × tarif × (10 000 − cotis_bp), 10 000) + hors_base × indemnité`.

**CDI** (nouveau, à valider sur un bulletin) : `net_mensuel = arr(brut_mensuel × (10 000 − cotisations_bp), 10 000)` ; mois incomplet : prorata en jours
ouvrés du contrat, arrondi par `arr`. **CDD** : comme le CDI avec, à la fin, `précarité = arr(brut_total_contrat, 10)` (10 %, réglage) et congés payés
(10 %, réglage) si non pris. Taux et règles **non confirmés** : voir question 3.

**Date de paiement** : `jourDePaie` du contrat ; intérim : fin de semaine + délai de paie (réglage) ; jamais un dimanche (report au jour ouvré suivant, réglage).

**Gain net d'une mission** : `net − carburant − usure` (unités à fixer avec Bryan, question 3).

**Horaires** (`horaires.rs`) : `trajet = ⌈trajet_base × (10 000 + majoration_bp) / 10 000⌉` ; `arrivée = début − marge` ; `départ = arrivée − trajet` ;
`décision = départ − mise_en_route` ; `réveil = décision − préparation` ; `coucher = réveil − sommeil − endormissement` ; rappels : `décision − pré_alerte`
et `coucher − rappel_coucher`. Négatif = la veille.

**Repos** (`repos.rs`) : 11 h entre plages, 10 h par plage, 48 h sur 7 jours glissants ; plages tirées des événements `travail`/`retux` de l'agenda
(donc aussi ceux de `paie`).

**Solde réel** (`finances`) : `solde(c, j) = soldeInitial + Σ écritures(c, ≤ j)` ; `serie.parJour` = une valeur par jour de `du` à `au`, jours sans mouvement reportés.

**Courbe du mois** (`budget`) : solde réel d'aujourd'hui (lu dans `finances`) + prévisions attendues de `budget` (paies, virements, abonnements) jour après jour ; `plancher = min(série)` ;
jours « sous seuil » signalés avec l'écart en centimes. Une prévision `attendue` dont le jour est passé est signalée « en retard » et n'est jamais réalisée automatiquement.

**Runway** : `runway_dixiemes = floor(réserve × 10 / coût_mensuel_scénario)`, `coût_mensuel_scénario = arr(coût × coefCoût_bp, 10 000)` ; cas nuls explicites.

## 9. Ordre de développement conseillé

Fondations d'abord (`finances` et `agenda`). Chaque étape est utilisable seule ; le moteur ne bouge qu'aux étapes marquées « moteur ».

| # | Étape | Sortie | Test |
| --- | --- | --- | --- |
| 0 | Validation de cette spec ; réponses aux questions ; montants de solde et de cotisations confirmés (agence, lundi 5 octobre) | spec figée | — |
| 1 | **Outils communs** (moteur) : `money.ts`, `civil.ts` dans `@etabli/ui` + vecteurs d'or — **fait** (4 octobre 2026) | modules testés | Vitest |
| 2 | **Appels entre plugins** (moteur) : « appeler la fonction X du plugin Y », permission montrée à l'installation (annexe A.3, M1 à M5, M13) | mécanisme prouvé par un plugin d'essai | Vitest + essai |
| 3 | Plugin **`finances`** (comptes, catégories, registre, soldes, courbes ; fonctions offertes `finances@1`) — **v1 faite (4 octobre 2026, `plugins/finances`, hors catalogue)** : tableau de bord, service à dix fonctions, limite de taille gérée ; restent les mini-apps Écritures, Comptes et catégories, Courbes, l'export et la clôture d'année | plugin publiable | vecteurs d'or, tests de contrat |
| 4 | Plugin **`agenda`** sans rappels (calendrier, événements, chronologie, repos, `.ics` ; fonctions `agenda@1`) | plugin | idem |
| 5 | **Rappels** (moteur, M6) : `notifications`, Android puis Windows ; `rappels@1` dans `agenda` | rappels réels | essai sur le téléphone de Bryan |
| 6 | Plugin **`paie`**, intérim et réserve d'abord (urgence réelle), puis CDI et CDD ; appels vers `budget`, `finances` et `agenda` | plugin | vecteurs d'or + essai sur un vrai bulletin |
| 7 | Plugin **`budget`** (en pratique avant `paie` si `paie` doit y poser ses prévisions) : budget du mois, courbe du mois, virements, abonnements, puis simulateur | plugin | vecteurs d'or, essai |
| 8 | Graphiques `@etabli/ui` (M9), import (M7), CSV bancaire | confort | Vitest |
| 9 | **Distribution « Budget personnel »** (docs/23) : plugins livrés d'office, chacun **avec sa propre version et sa propre mise à jour** | application installable | installation côte à côte |
| 10 | Plus tard : `foyer`, `retux-suivi`, `voiture`, itinéraire (`reseau`), éclatement de `paie` si utile | — | — |

Urgence : l'intérim commence la semaine du 5 octobre. Option : **publier `paie` avant les étapes 2 à 4**, en mode autonome (net estimé, `.ics` en repli, aucune
écriture), puis activer les appels quand les fondations existent. Gain : l'outil sert tout de suite. Coût : une couche « appel facultatif » déjà prévue (A.1.7), pas de réécriture.

## 10. Risques (en clair)

| Risque | Parade |
| --- | --- |
| Trop de plugins qui s'appellent entre eux | quatre plugins, personne n'appelle plus loin qu'un voisin direct, pas de chaîne |
| Figer trop tôt les fonctions offertes | on commence avec très peu de fonctions ; on en ajoute sans rien casser ; les noms de ce document sont des propositions |
| Un plugin manque | chaque appel a un mode « sans » défini : l'écran le dit, le reste marche (annexe A.1.7) |
| Net de paie faux (taux non confirmés) | taux visibles et modifiables, comparaison avec un vrai bulletin avant d'en faire un usage de décision |
| Rappel qui ne sonne pas | permission demandée au premier lancement, indicateur « rappels programmés jusqu'au … », export `.ics` en secours |
| Dérive vers la comptabilité légale | exclue (section 5) |
| Perte de données | écriture sûre du moteur, export JSON, sauvegarde du serveur |
| Trop de travail d'un coup | étapes utilisables seules ; `paie` peut sortir avant les fondations |

Les risques techniques (doublons, désynchronisation, détournement, fuseau…) sont dans l'annexe A.6.

## 11. Décisions de Bryan (4 octobre 2026)

1. **Noms et découpage** : `agenda`, `finances`, `budget`, `paie`. `paie` sert aux **particuliers** pour programmer des missions d'intérim et des revenus récurrents ; elle ne gère pas l'argent d'une vente (trop instable pour y mettre un prix).
2. **Ordre** : fondations d'abord (outils communs, appel de fonction entre plugins, `finances`, `agenda`), puis `paie`, puis `budget`.
3. **Montants de paie** : tous **programmables** (réglages, jamais en dur). **Pas de « gain net »** dans `paie` : elle dit combien on sera payé. C'est `budget` qui estime ce qui reste après les charges du quotidien. À confirmer avec un contrat ou un bulletin : taux, heures supplémentaires (majorations légales).
4. **Rappels** : **notifications seulement, pas d'alarmes**, et **sur téléphone seulement**, pas sur PC.
5. **Périmètre exclu** : non discuté, reste comme proposé (connexion bancaire, courses avec prix réels, conseil d'investissement, optimisation par IA, comptabilité légale).
6. **Produit** : **PC d'abord**, puis le téléphone. Nom : **« Quotidien »**, application à usage **personnel** de Bryan, non commerciale (le conflit de nom trouvé pour « Kotidien » ne se pose donc pas).
7. **Plugins publics ou privés** : non tranché ; recommandation : privé par défaut, montants personnels en réglages.
8. **Foyer à deux** : non tranché ; recommandation : version 2.

---

# Annexe technique — pour le développeur

## A.1 Services entre plugins

> Cette annexe est **pour le développeur**. Rien n'y change ce qui est décidé plus haut ; les noms de fonctions sont des **propositions**.

### A.1.1 Ce que le mécanisme permet aujourd'hui (relevé dans le code, non essayé en situation réelle)

Sources : `packages/sdk/src/protocol.ts`, `packages/sdk/src/deps.ts`, `apps/desktop/src/lib/plugins/garde.ts`, `permissions.ts`,
`apps/desktop/src/lib/state/services.svelte.ts`, manifestes de `plugins/fournisseurs` et `plugins/machines`.

| Question | Constat |
| --- | --- |
| Nature | **un instantané de données JSON**, pas un appel de fonction. Le fournisseur *pousse* (`etabli.services.provide(nom, données)`) ; les consommateurs *lisent* (`services.get(nom)`, `onChange`) |
| Lecture seule ? | **oui**, côté consommateur : aucun message pour écrire dans le service d'un autre |
| Appels avec arguments ? | **non** : aucun message `call`/`invoke`/réponse dans `HostToPlugin`/`PluginToHost` |
| Écritures chez le fournisseur ? | **non** (voir ci-dessus). Seul le détenteur modifie ses données, depuis **sa propre page ouverte** |
| Asynchrone ? | pas de requête-réponse. Les consommateurs reçoivent `init.services` puis le message `services` à chaque changement ; l'instantané est écrit par le moteur (`donnees/service.<plugin>.<nom>.json`, 400 ms de délai) |
| Fournisseur fermé | **les données restent** (fichier) : lecture possible tant que le fournisseur est installé, activé et en bonne version, mais elles sont **périmées** tant qu'il n'a pas été rouvert. Un fournisseur ne peut rien publier sans qu'une de ses pages soit ouverte |
| Versionnage | `provides: {"finances": "1"}` (version du **contrat**) ; le consommateur reçoit `version` dans l'instantané. **Mais** le moteur filtre avec la plage de dépendance appliquée à la **version du plugin** (`satisfies(provider.version, range)`), pas à celle du contrat : un plugin en 2.0 qui garde un contrat 1 est coupé à tort, et le consommateur doit vérifier lui-même `snapshot.version` |
| Dépendances | `dependencies` (obligatoire) et `optionalDependencies` (facultatif) dans le manifeste, **par identifiant de plugin**, plage de versions. Installation : `planInstall` ajoute les dépendances obligatoires et propose les facultatives ; désinstaller un plugin dont d'autres dépendent (obligatoirement) est signalé par `dependentsOf` |
| Fournisseur absent, désinstallé ou désactivé | `snapshotFor` ne renvoie rien pour lui : `services.get(nom)` donne `null`, **« comme si le plugin n'était pas là »**. Pas d'erreur, pas de notification. Les données du service restent sur disque (non vérifié : si la désinstallation les efface) |
| Nom de service | **global**, pas préfixé par le plugin : deux plugins qui publient le même nom s'écraseraient dans `snapshotFor` (le dernier gagne). À éviter par convention (un nom = un plugin) ou à imposer |
| Permissions | `provide` exige seulement que le nom soit dans `provides` (garde, test `#10` de docs/19) ; **aucune permission** n'est nécessaire pour publier ou lire. Liste actuelle : `fichiers`, `impression`, `presse-papiers`, `envoi`, `reglages` |
| Validation | taille ≤ 4 Mo et JSON valide seulement ; **pas de schéma par service** (docs/19 §4 : « à prévoir ») : le consommateur valide |
| Envoi `send` | transmet des données à une mini-app d'un autre plugin, ouverte dans un nouvel onglet, une fois : c'est un **geste utilisateur**, pas un appel de programme |

Conséquence directe : **le modèle « banque » voulu par Bryan n'existe pas encore.** Aujourd'hui un plugin « banque » pourrait seulement
publier son état (soldes, écritures du mois) en lecture ; les autres ne pourraient pas lui ajouter une écriture. Il manque quatre choses
(manques M1 à M4, A.3)) : des appels avec arguments, des écritures autorisées, un fournisseur joignable sans page ouverte, et le versionnage
sur le contrat.

### A.1.2 Mécanisme proposé : « fonctions de service »

> **Fait (branche `appels-entre-plugins`, 4 octobre 2026)** : manifeste (`functions`, `serviceEntry`, `services`, permission
> `appelle:<service>:<accès>`), SDK (`services.call`, `services.handle`, `ServiceError`), garde, routeur (file par fournisseur, délais,
> plafonds, profondeur 1), cadre invisible, validation (`npm run valider`), affichage à l'installation, versionnage sur le contrat pour
> les appels et les instantanés. Mode d'emploi : [06](06-protocole-sdk.md#appeler-la-fonction-dun-autre-plugin-docs24-a12) ; menaces :
> [19](19-modele-de-menace-plugins.md) (n° 17 à 23). **Pas fait** : voir « État d'avancement » en fin de A.3.

Le manifeste du fournisseur décrit des **fonctions** ; le moteur route les appels, vérifie, et fait répondre le fournisseur.

```jsonc
// manifeste de finances (extrait, proposition)
"provides": { "finances": "1" },                    // existe déjà : nom → version du contrat
"serviceEntry": "service/index.html",               // NOUVEAU : page sans interface qui répond aux appels
"functions": {                                      // NOUVEAU : déclaration vérifiée par le moteur
  "finances": {
    "soldes.aLaDate":      { "acces": "lecture" },
    "ecritures.ajouter":   { "acces": "ecriture" },
    "ecritures.annuler":  { "acces": "ecriture" }
  }
}
// manifeste du consommateur (paie)
"optionalDependencies": { "finances": "^1" },       // existe déjà (plage sur le plugin)
"permissions": ["appelle:finances:ecriture"]        // NOUVEAU : montrée à l'installation
```

Appel côté consommateur (proposition) : `const r = await etabli.services.call("finances", "ecritures.ajouter", args, { timeoutMs: 5000 })`
→ `{ ok: true, valeur } | { ok: false, code, message }`. Le moteur : (1) vérifie que le fournisseur est présent, actif, en contrat compatible ;
(2) vérifie que la fonction existe et que le consommateur a la permission correspondante ; (3) valide la taille ; (4) **ajoute l'identité du
demandeur** (`appelant`, non falsifiable) ; (5) charge `serviceEntry` du fournisseur dans un cadre invisible (comme l'entrée
`background` de M2), transmet l'appel, attend la réponse, ferme ; (6) renvoie le résultat. Les appels sont **sérialisés par fournisseur**
(une file) pour qu'un registre ne soit jamais modifié par deux appels à la fois. Le fournisseur valide ses arguments (schéma), les bornes
et les permissions de **données** (un appelant ne touche que ce qu'il a créé, A.1.3).

Variante moins coûteuse pour un premier jalon (« v0 ») : **boîte de demandes**. L'appel d'écriture dépose une demande dans un fichier
du moteur ; le fournisseur la traite à sa prochaine ouverture. Avantage : aucun cadre invisible. Inconvénient : écriture *asynchrone et
différée* (l'écriture n'existe pas tant que `finances` n'est pas rouvert), donc soldes faux entre-temps. Acceptable pour `rappels`,
non pour un registre. **Non recommandée pour `finances`**.

### A.1.3 Règles communes à tous les contrats

- **Identité imposée** : `appelant` est écrit par le moteur ; un plugin ne peut pas se faire passer pour un autre. `source.plugin` d'une écriture
  ou d'une prévision = `appelant`.
- **Espace propre** : les fonctions `*.remplacer` et `*.supprimer` n'agissent que sur les objets dont `source.plugin = appelant`. `paie` ne peut
  pas toucher les prévisions de `budget`. Le plugin propriétaire (utilisateur dans l'interface de `finances`) peut tout voir et tout modifier sauf le registre.
- **Idempotence** : toute fonction d'écriture prend une `cle` (texte, unique par appelant) ; rejouer le même appel ne crée pas de doublon.
- **Retours** : `{ ok: true, valeur }` ou `{ ok: false, code, message }` ; codes communs `service_absent`, `contrat_incompatible`,
  `permission_refusee`, `argument_invalide`, `introuvable`, `limite_atteinte`, `delai_depasse`, `occupe`.
- **Bornes** : 1 000 résultats par page (curseur), 4 Mo par message, fenêtre de dates ≤ 5 ans, 200 rappels par appelant.
- **Montants** : entiers (centimes), `Number.isSafeInteger`, bornés à ±10¹² ; jours `AAAA-MM-JJ` valides ; instants en ms entiers.
- **Évolution** : on **ajoute** des fonctions et des champs facultatifs sans changer de version ; renommer ou retirer = version majeure,
  et le plugin fournit les deux pendant au moins une version de plugin.

### A.1.4 Contrats `finances@1` et `budget@1` (noms de fonctions : propositions)

`finances@1` (l'argent réel) :

| Fonction | Accès | Arguments | Retour | Erreurs propres |
| --- | --- | --- | --- | --- |
| `comptes.liste` | lecture | — | `Compte[]` | — |
| `categories.liste` | lecture | — | `Categorie[]` | — |
| `ecritures.liste` | lecture | `{du?, au?, compteId?, categorieId?, source?, curseur?}` | `{ecritures, curseur?}` | `argument_invalide` |
| `soldes.aLaDate` | lecture | `{jour, comptes?}` | `{[compteId]: cents}` | |
| `serie.parJour` | lecture | `{du, au, comptes?}` | `[{jour, soldeCents}]` | `limite_atteinte` si > 1 830 jours |
| `totaux.parCategorie` | lecture | `{du, au, sens?}` | `[{categorieId, cents}]` | |
| `comptes.creer` | écriture | `{nom, type, soldeInitialCents, cle}` | `{id}` | `argument_invalide` |
| `categories.creer` | écriture | `{nom, parentId?, sens, cle}` | `{id}` | |
| `ecritures.ajouter` | écriture | `{compteId, montantCents, quand, categorieId, libelle, ref?, cle}` | `{id}` | `introuvable` (compte), `argument_invalide` |
| `ecritures.annuler` | écriture | `{id, motif, cle}` | `{id}` (écriture inverse) | `introuvable`, `deja_annulee`, seulement les écritures de l'appelant |

`budget@1` (le prévu) :

| Fonction | Accès | Arguments | Retour |
| --- | --- | --- | --- |
| `previsions.liste` | lecture | `{du?, au?, compteId?, source?, statut?}` | `{previsions, curseur?}` |
| `previsions.remplacer` | écriture | `{ref, previsions: [{compteId, montantCents, jour, categorieId, libelle}], cle}` | `{ids}` (remplace toutes les prévisions `attendues` de (appelant, `ref`)) |
| `previsions.supprimer` | écriture | `{ref}` | `{supprimees}` |
| `previsions.realiser` | écriture | `{ref, ecritureId?}` | `{realisees}` (marque comme réalisées les prévisions de (appelant, `ref`)) |

Aucune fonction ne supprime d'écriture ni de compte. `comptes.creer` est un confort : en pratique l'utilisateur crée ses comptes dans `finances`.

### A.1.5 Contrats `rappels@1` et `agenda@1`

`rappels@1` (permission `notifications` détenue par `agenda`) :

| Fonction | Accès | Arguments | Retour | Erreurs |
| --- | --- | --- | --- | --- |
| `rappels.remplacer` | écriture | `{groupe, rappels: [{id, at (instant UTC), titre, texte?, niveau: "notification" \| "alarme", ouvre?}], cle}` | `{programmes, jusquau}` | `limite_atteinte`, `permission_notifications_refusee` (non bloquante : renvoie `programmes: 0`), `argument_invalide` (`at` passé, titre vide) |
| `rappels.annuler` | écriture | `{groupe}` | `{annules}` | |
| `rappels.etat` | lecture | — | `{autorise, alarmeExacte, jusquau, total}` | |

Remplacer un `groupe` annule les rappels précédents du même (appelant, groupe) : aucun rappel orphelin quand un planning change.

`agenda@1` :

| Fonction | Accès | Arguments | Retour |
| --- | --- | --- | --- |
| `evenements.liste` | lecture | `{du, au, types?}` (repetitions développées) | `Evenement[]` |
| `plages.occupees` | lecture | `{du, au}` | `[{jour, debutMin, finMin, type}]` |
| `evenements.remplacer` | écriture | `{ref, evenements: [{type, titre, lieu?, jour, debutMin, finMin, trajetMin?, rappels?}], cle}` | `{ids}` (tous les événements de (appelant, `ref`) sont remplacés) |
| `evenements.supprimer` | écriture | `{ref}` | `{supprimes}` |

### A.1.6 Qui appelle quoi

| Appelant | Fonction | Quand | Si l'autre est absent |
| --- | --- | --- | --- |
| `paie` | `budget.previsions.remplacer({ref: "mission:<id>"})` | modification d'une mission, d'un contrat ou d'une paie | calcul et écrans de `paie` inchangés ; bandeau « Installez Budget pour voir vos paies prévues » ; compteur « non transmises » |
| `paie` | `finances.ecritures.ajouter`, puis `budget.previsions.realiser` | saisie du bulletin (net reçu) | idem |
| `paie` | `agenda.evenements.remplacer({ref})`, `rappels.remplacer({groupe: "paie"})` | modification d'une mission, jour de paie | missions visibles dans `paie` seulement ; export `.ics` direct en repli |
| `budget` | `finances.*.liste`, `soldes.aLaDate`, `serie.parJour`, `totaux.parCategorie` | ouverture et chaque changement | **obligatoire** : écran « Finances est nécessaire » |
| `budget` | `finances.ecritures.ajouter` | l'utilisateur confirme qu'un virement ou une dépense a eu lieu | idem |
| `budget` | `agenda.evenements.liste`, `rappels.remplacer({groupe: "budget"})` | échéances ; rappel de virement | échéances absentes du graphique ; pas de rappel |
| `finances` | `rappels.remplacer({groupe: "finances"})` | rappel de paiement demandé par l'utilisateur (« le 12 octobre ») | pas de rappel, message clair |
| `agenda` | aucune | — | — |

### A.1.7 Plugin absent, désinstallé, désactivé, mauvaise version

| Cas | Comportement exigé (consommateur) | Comportement du moteur |
| --- | --- | --- |
| Absent (jamais installé) | dépendance **facultative** : mode dégradé et bandeau avec lien d'installation ; **obligatoire** : écran dédié (jamais d'écran blanc) | `call` renvoie `service_absent` |
| Désinstallé après coup | retour au mode dégradé au prochain `onChange`/`call` ; **rien n'est effacé chez le consommateur** | `dependentsOf` avertit avant la désinstallation d'une dépendance obligatoire ; les écritures déjà faites restent chez le fournisseur tant que ses données le sont (les calculs sont conservés, comme pour les plugins actuels) |
| Désactivé | idem absent | `call` : `service_absent` |
| Contrat trop ancien/trop récent | message « mettez à jour Finances » / « mettez à jour Paie » ; aucune écriture tentée | `contrat_incompatible` |
| Fournisseur en panne (cadre de service qui ne répond pas) | file d'attente locale côté consommateur (« 3 envois en attente »), nouvel essai à la prochaine ouverture | `delai_depasse` après 5 s |
| Écriture déjà faite puis fournisseur réinstallé | les prévisions que `paie` a posées dans `budget` sont **recalculées entièrement** à l'ouverture suivante (`remplacer` est idempotent) | — |

Règle de conception : **un consommateur doit pouvoir être réparé en rejouant**. Le consommateur garde sa propre vérité (missions, contrats), et
`finances`/`agenda` ne reçoivent que des *projections* qu'on peut régénérer.


## A.2 Stockage avec les API actuelles du SDK

| Outil | Nature | Limites |
| --- | --- | --- |
| `MiniAppDocument` | un **calcul** (`.etabli`) par mini-app | 5 Mo ; pas un registre permanent |
| `PluginSettings` | **un JSON par plugin**, partagé par ses mini-apps, enregistré 400 ms après la dernière modification | 5 Mo, 4 Mo par message ; pas de `migrate` (seulement `clean`) |
| Service (`provide`) | instantané publié vers les plugins qui en dépendent | JSON, validé côté lecteur |
| Mode serveur | « tout sur le serveur » (docs/16 §9) | décidé |

**Proposition v1 (sans modifier le moteur pour le stockage)** : chaque plugin garde ses données vivantes dans `PluginSettings` sous
`{ schema, … }`. Pour `finances`, le registre est le plus gros : 300 octets par écriture ≈ 16 000 écritures dans 5 Mo. Un particulier : des
années. **L'ERP** dépassera ce plafond : voir T7 (stockage serveur, question 11). Au-delà de 3 Mo,
« clôturer l'année » déplace l'année écoulée vers un document archivé en lecture seule (les soldes sont reportés par une écriture
d'ouverture ; fonction de `finances`).


## A.3 Ce qui manque au moteur et au SDK

Classé par importance. Les cinq premiers viennent de A.1.1.

| # | Manque | Pourquoi ici | Proposition |
| --- | --- | --- | --- |
| M1 | **Appels de service avec arguments et réponse** | tout le découpage repose dessus ; aujourd'hui, snapshot en lecture seule | messages `serviceCall`/`serviceReply` dans `protocol.ts` + `etabli.services.call(nom, fonction, args, options)` ; routage, délais, file par fournisseur dans `services.svelte.ts` ; garde : forme, taille, identité |
| M2 | **Fournisseur joignable sans page ouverte** (`serviceEntry`/`background`) | `finances` doit répondre quand l'utilisateur est dans `paie` ; l'agenda doit recalculer ses rappels | page sans interface chargée à la demande en cadre invisible (même isolement que les autres, CSP identique), puis fermée ; durée de vie ≤ 10 s par appel ; aussi utilisable au démarrage pour renouveler les rappels. Décision de conception (T1, T2) |
| M3 | **Écriture inter-plugins sous permission** | un plugin ne doit pas écrire chez un autre sans que l'utilisateur le sache | permission `appelle:<service>:<acces>` déclarée par le consommateur, montrée à l'installation ; `functions` du fournisseur avec `acces` vérifié par le moteur ; `npm run valider` contrôle les deux. Passe par `permissions.ts` et docs/19 §6 |
| M4 | **Versionnage sur le contrat, pas sur le plugin** | `satisfies` s'applique aujourd'hui à la version du plugin | dépendance de type `"services": { "finances": "^1" }` (plage sur la version de contrat de `provides`) ; `planInstall` et `problemsOf` le comprennent ; le fournisseur peut publier plusieurs versions de contrat à la fois |
| M5 | **Identité de l'appelant et espace propre** | éviter qu'un plugin modifie les données d'un autre | `appelant` injecté par le moteur (A.1.3) ; contrôles de propriété dans le fournisseur, testés |
| M6 | **Rappels / alarmes** (permission `notifications`, docs/16 §7) | raison d'être de l'agenda | message `reminders.set(liste)` (remplace l'ensemble) et `reminders.clear()`, exécutés **par l'hôte** (Capacitor sur Android, essai du 4 octobre réussi ; Rust sur Windows ; web : notification si l'onglet vit) ; liste gardée sur disque et reprogrammée au démarrage. **Seul `agenda` déclare `notifications`** ; `rappels@1` (A.1.5) le partage. Plafonds : 200 rappels, 60 jours |
| M7 | **Import de fichier** (permission `import`) | restaurer une sauvegarde, relevé bancaire CSV (`finances`), `.ics` | message `openFile({extensions, maxBytes})`, boîte « Ouvrir » exécutée par l'hôte, renvoie le **texte** (5 Mo max) ; le plugin ne voit jamais le chemin |
| M8 | **Extension `ics` pour `saveFile`** | export agenda et filet iPhone | ajouter `ics` à la liste blanche (côté interface et côté Rust) |
| M9 | **Graphiques** | courbes de solde, diagramme de dépenses (`finances`, `budget`) | `Sparkline`/`LineChart`/`BarChart`/`DonutChart` en SVG pur dans `@etabli/ui`, couleurs des jetons de thème, valeurs entières, tableau de valeurs accessible. Mutualisé entre `finances`, `budget` et l'ERP. Décision T3 |
| M10 | **Argent et dates partagés** (`money.ts`, `civil.ts`) | `finances`, `paie`, `budget`, `agenda` et l'ERP | `parseEuros`, `formatEuros`, `divArrondi`, points de base ; jours civils, lundi de la semaine, plages, développement d'une répétition, jour+minutes → instant UTC en `Europe/Paris`. Écrits et testés **une fois** |
| M11 | **Stockage de plugin plus riche** (facultatif) | export/import, migration, volume de l'ERP | `PluginSettings` avec `migrate(saved)` ; export/import JSON ; collections indexées si l'ERP les exige |
| M12 | **Schémas de contrat vérifiés par le moteur** | docs/19 §4 : données de service hostiles | `functions.*.schema` (JSON Schema simple) dans le manifeste ; refus avant d'atteindre le fournisseur |
| M13 | **Outil de test des services** | écrire `paie` sans `finances` réel | simulateur de fournisseur dans le kit (`mockService`) pour Vitest ; vecteurs d'or rejoués contre le contrat |
| M14 | **Réseau** (`reseau`) | itinéraire, géocodage | pas en v1 : trajet saisi en minutes |
| M15 | **Flux de calendrier pour iPhone** | alarmes iPhone | route du serveur d'Établi servant un `.ics` par utilisateur (T4) |
| M16 | **Essais** | `crypto.randomUUID()` dans un cadre à origine opaque ; `Intl` avec `Europe/Paris` ; cadre invisible (M2) | plugin d'essai jetable, comme `essai-isolation` |

Ce que le contrat actuel **permet déjà** et que ces plugins utilisent : réglages de plugin, documents, publication/lecture d'instantanés,
dépendances facultatives et leur installation, `send` (geste utilisateur), `saveFile` (CSV, JSON), `print`, `openSettings`, thèmes.


### État d'avancement des manques (4 octobre 2026)

| Manque | État |
| --- | --- |
| M1 appels avec arguments et réponse | **fait** : `serviceCall`/`serviceReply`, `services.call`, routeur `lib/plugins/appels.ts` |
| M2 fournisseur joignable sans page ouverte | **fait pour les appels** (cadre invisible `serviceEntry`, fermé après la réponse). **Pas fait** : point d'entrée au démarrage (renouveler les rappels), cadre persistant ; **essayé dans Chromium (4 octobre 2026, `scripts/essai-appels.mjs`, 45 essais)**, **non essayé dans WebView2 ni sur Android** |
| M3 écriture sous permission | **fait** : `appelle:<service>:<accès>`, `functions.*.acces`, validateur, phrase à l'installation ; `ecriture` ne donne pas `lecture` (choix de sécurité) |
| M4 versionnage sur le contrat | **fait pour les appels** (plage `services` jugée sur la version du contrat) et pour les instantanés d'un consommateur qui la déclare. **Pas fait** : `planInstall` et `problemsOf` jugent toujours les `dependencies` sur la version du plugin ; pas de plusieurs versions de contrat servies à la fois |
| M5 identité et espace propre | **identité faite** (`caller` écrit par le moteur) ; le **contrôle de propriété** (`source.plugin = appelant`) reste à écrire dans chaque fournisseur |
| M9 graphiques | **fait en partie** : `LineChart` et `DonutChart` (SVG, jetons du thème, tableau pour lecteurs d'écran) dans `@etabli/ui`, utilisés par Finances ; pas encore `BarChart` ni `Sparkline` |
| M12 schémas vérifiés par le moteur | pas fait (le fournisseur valide) |
| M13 `mockService` | pas fait ; les fixtures `fixtures/appels-entre-plugins/` et `appels.integration.test.ts` montrent un appel complet |
| M10 argent et dates partagés | **fait** (`money.ts`, `civil.ts` dans `@etabli/ui`, 179 tests ; voir `packages/ui/README.md`). Choix : arrondi `demi-haut` par défaut (le `arr()` du Rust), `parseEuros` refuse plus de deux décimales, fériés français fournis en option (jamais supposés) |
| M6 rappels | **fait (5 octobre 2026), jamais essayé sur un téléphone** : message `reminders` (`set` remplace tous les rappels du plugin, `state`), permission `notifications`, `etabli.reminders`, programmation par l'hôte avec le plugin de notifications de Capacitor (notifications d'importance 4, jamais d'alarme ; PC : `telephone_seulement`), horizon de 60 jours renouvelé à chaque ouverture, `rappels@1` dans l'Agenda. Écarts : pas de reprogrammation au démarrage (les notifications programmées survivent au redémarrage grâce au récepteur de Capacitor, non vérifié) ; pas de `niveau: "alarme"` ni de `ouvre` ; pas de rappel sur PC (décision du 4 octobre) |
| M8 `ics` | **fait** : `ics` dans la liste blanche (Rust et garde) |
| M7, M11, M14 à M16 | pas faits |

**Choix de conception retenus** (à valider) : (1) `ecriture` ne donne pas `lecture` ; (2) `services` (plage de contrat) est
obligatoire pour appeler, la dépendance sur le plugin aussi ; (3) le délai (5 s par défaut, 10 s au plus) couvre l'attente en file ;
(4) profondeur 1 : un fournisseur qui répond à un appel ne peut en émettre aucun ; (5) plafonds fixes 20 / 8 ; (6) un appel =
un cadre neuf (aucun état gardé en mémoire d'un appel à l'autre : le registre vit dans les réglages du plugin) ; (7) réservé aux
plugins de contrat ^2.


## A.4 Réemploi du cœur Rust : WebAssembly ou TypeScript ?

(Les modules partagés `money`/`civil` (M10) servent aussi `finances` et l'ERP.)

### A.4.1 Ce que le contrat actuel autorise (relevé dans le code, non essayé)

| Point | Constat |
| --- | --- |
| Exécution de WebAssembly dans le cadre | **autorisée** : la politique CSP des pages de plugins contient `script-src … 'wasm-unsafe-eval'` (bureau : `apps/desktop/src-tauri/src/plugins.rs`, serveur : `crates/serveur/src/routes_plugins.rs`) |
| Service du fichier `.wasm` | **prévu** : type MIME `application/wasm` connu du protocole `plugins://`, du serveur et de `etabli-noyau::paquet::type_mime` |
| Chargement habituel de `wasm-bindgen` (`fetch` du `.wasm`) | **bloqué** : `connect-src 'none'` interdit `fetch`. Il faudrait **intégrer les octets dans le JavaScript** (base64, `initSync`) : +33 % de taille, soit ~260 Ko |
| Précédent dans le dépôt | **aucun** plugin n'utilise WebAssembly ; ni `npm run valider`, ni `build:plugins`, ni la CI ne le connaissent |
| Sécurité | aucun pouvoir de plus que JavaScript dans le cadre ; reste la boucle infinie (docs/19 #15) |
| Hôtes | à vérifier sur chacun : bureau (WebView2), Android (Capacitor), web statique et PWA iPhone |

### A.4.2 Comparaison

| Critère | Rust + WASM dans le plugin | Réécriture TypeScript (avec vecteurs d'or) |
| --- | --- | --- |
| Effort initial | porter le pont, intégrer le binaire, étendre `build:plugins` et `valider`, essayer sur 4 hôtes | ~450 lignes à traduire (une journée) plus les tests |
| Outils de construction | `rustup`, cible `wasm32`, `wasm-bindgen-cli` épinglé dans la chaîne de **chaque** plugin et de la CI de catalogue | aucun nouveau |
| Mise à jour séparée | le `.wasm` alourdit chaque paquet et lie le plugin à une version du cœur | un plugin = un paquet JavaScript |
| Mutualisation réelle | le cœur ne sert qu'à `paie` et `agenda` ; illisible pour les auteurs du catalogue | `money`/`civil` servent aussi `finances`, `budget`, l'ERP et tout auteur |
| Exactitude des nombres | `i64` | `number` : entiers sûrs jusqu'à 9 × 10¹⁵ ; `Math.floor` sur entiers, **jamais** `/` flottant sans arrondi explicite ; `BigInt` inutile |
| Tests | `cargo test` existants, plus le pont dans le navigateur | 18 cas Rust convertis en vecteurs JSON rejoués par Vitest |
| Débogage | binaire opaque | source lisible |
| Risque plateforme | CSP différente selon l'hôte, non essayé | nul |

### A.4.3 Recommandation : **réécriture en TypeScript, avec des vecteurs d'or tirés du Rust**

(1) Le cœur est petit et pur ; (2) WebAssembly est *possible* mais non prouvé, pour un gain nul ; (3) la mutualisation voulue par Bryan passe par des
modules écrits une fois pour quatre plugins et l'ERP, pas par un binaire ; (4) un seul langage dans tous les plugins garde le catalogue
maintenable par une personne seule. Garde-fous : les 18 tests Rust deviennent des fichiers `entree.json` → `sortie.json` (générés une fois par un petit
programme Rust, versionnés dans `paie`/`agenda` et dans le kit pour `money`/`civil`), rejoués par Vitest, avec des cas aux limites (changement d'heure,
semaine à cheval sur deux mois, demi-centimes, entrées négatives). Si un calcul devient lourd, WebAssembly se rouvre comme **décision séparée**.


## A.5 `paie` : un plugin ou plusieurs ? (comparaison détaillée)

**Recommandation : commencer par UN plugin `paie`, organisé en modules internes par type de contrat, et le scinder plus tard seulement si
une raison réelle apparaît.** L'avis de départ est **confirmé**, avec une réserve.

| Critère | Un plugin `paie` (modules internes) | Plugins séparés (`interim`, `reserviste`, `cdi-cdd`) |
| --- | --- | --- |
| Surface d'API à versionner | **nulle** entre contrats de travail : ce sont des fonctions TypeScript internes | un contrat inter-plugins pour les cotisations, les semaines, les bulletins : à figer avant d'avoir vécu avec |
| Calculs de cotisations | écrits **une fois** (`cotisations`, `arr`, semaines lundi-dimanche), testés une fois | dupliqués trois fois, ou extraits dans un 4e plugin « socle » (le problème qu'on voulait éviter), ou module `@etabli/ui` trop spécifique à la France |
| Mises à jour indépendantes | une seule : une correction du net d'intérim republie aussi le code CDI (mais le CDI n'est pas touché fonctionnellement) | oui, par contrat : un taux d'intérim change sans toucher la réserve |
| Poids | un paquet de quelques dizaines de Ko | trois paquets, trois manifestes, trois fois le même noyau |
| Usage réel de Bryan | intérim **et** réserve en même temps (conflit de jours : net perdu/gagné) : il faut voir les deux ensemble | le conflit mission/réserve imposerait un appel inter-plugins pour la fonction la plus utile |
| Clarté du catalogue | « Paie » | trois entrées, dont une que personne n'installe seule |

Réserve : la **réserve opérationnelle** (jours de formation, indemnité hors base) obéit à des règles propres à l'armée ; si un jour d'autres
personnes veulent seulement intérim *ou* seulement réserve, ou si les barèmes changent à un rythme très différent, on scinde. **Pour que la
scission coûte peu** : un dossier par module (`src/interim/`, `src/reserve/`, `src/cdi/`, `src/cdd/`), un fichier `types.ts` par module, aucune
importation croisée entre modules sauf vers `src/socle/` (cotisations, semaines, arrondis), des données rangées **par module** dans les
réglages (`{ schema, interim: {…}, reserve: {…} }`), et des fonctions d'écriture vers `finances`/`agenda` qui prennent des structures
simples (jamais un type interne). Scinder revient alors à déplacer des dossiers et à promouvoir `socle/` en module `@etabli/ui` ou en plugin.
Ne **pas** publier de service `paie@1` en v1 : personne n'en a besoin (le flux va de `paie` vers `finances` et `agenda`) et c'est précisément
le contrat qu'il serait dangereux de figer trop tôt.


## A.6 Risques techniques

| Risque | Gravité | Parade |
| --- | --- | --- |
| **Explosion des appels entre plugins** (chaque écran appelle dix fonctions, boucles, cascade) | haute | graphe sans cycle et de profondeur 1 (section 5) ; lectures par `onChange` et cache, pas par interrogation ; une seule écriture groupée par modification (`remplacer`, pas ligne à ligne) ; file sérialisée et plafonds par appelant (A.1.3) ; compteur d'appels visible dans les réglages de `finances` |
| **Contrat d'API figé trop tôt** | haute | contrats **minimaux** en v1 (pas de `paie@1`, pas de `budget@1`) ; ajout de fonctions sans changement de version ; version majeure = deux versions servies ; essais de bout en bout avant de publier `finances@1` ; les noms de fonctions du tableau A.1.4 sont des **propositions** |
| **Chaînes de dépendances** (A exige B qui exige C) | moyenne | une seule dépendance obligatoire (`budget → finances`), profondeur 1, aucune dépendance obligatoire pour `paie`/`agenda`/`finances` ; `planInstall` signale la chaîne |
| **Plugin absent ou désinstallé** | moyenne | mode dégradé défini pour chaque appel (A.1.6, A.1.7), erreurs typées, rejouable (projection régénérable) |
| **Désynchronisation** : prévisions de `paie` périmées dans `budget` | moyenne | `remplacer` idempotent ; indicateur « transmis n sur n » ; re-synchronisation à chaque ouverture de `paie` ; la vérité reste chez l'émetteur |
| **Registre corrompu ou doublon d'écriture** | haute | ajout seulement, `cle` d'idempotence, file sérialisée, annulation par écriture inverse, export JSON, sauvegarde du serveur |
| **Détournement entre plugins** (un plugin écrit des écritures fausses) | moyenne | permission `appelle:finances:ecriture` (ou `budget`) montrée à l'installation, `source` imposée, espace propre, liste des écrivains dans `finances` |
| **Dérive vers la comptabilité légale** (TVA, factures) | moyenne | hors périmètre écrit en section 5 ; refus des champs correspondants ; l'ERP garde sa comptabilité |
| **Net estimé faux** (22 % forfaitaire, indemnité non confirmée) | haute | taux visibles, calibrage sur bulletin, message « estimation », comparaison avec un vrai bulletin avant tout usage de décision |
| **Rappel qui ne sonne pas** | haute | permission au premier lancement, indicateur « rappels jusqu'au … », horizon renouvelé, filet `.ics`, essai sur d'autres téléphones (le test du 4 octobre ne couvre ni redémarrage ni autre marque) |
| **Données financières privées sur un serveur partagé** | moyenne | mode local par défaut ; en mode serveur, données par utilisateur (limite assumée, docs/16) |
| **Perte de données** (un JSON par plugin) | moyenne | écriture atomique du moteur, export JSON, sauvegarde du serveur |
| **Dérive du fuseau / heure d'été** | moyenne | une seule fonction de conversion, tests aux deux changements d'heure ; fuseau **figé** sur chaque écriture |
| **Portée trop large** | haute | quatre plugins seulement, étapes utilisables seules, `foyer`/`retux`/`voiture` écartés tant que 3 à 7 ne sont pas utilisés en vrai (« un chantier à la fois ») |
| **Travail moteur avant tout plugin utile** (étapes 2 et 5) | moyenne | option de publier `paie` en mode autonome (section 9) ; `finances` et `agenda` utilisables seuls même sans appels |
| Écart affichage / logique en double (leçon de `Agenda.svelte`) | faible | tout calcul d'argent passe par les modules testés |


## A.7 Questions techniques, avec la recommandation par défaut

Bryan n'a pas à trancher : sans objection, la recommandation s'applique.

| # | Question | Recommandation par défaut |
| --- | --- | --- |
| T1 | Mécanisme d'appel : cadre invisible (A.1.2) ou boîte de demandes (écriture différée) | **cadre invisible** (fait, 4 octobre 2026) ; la boîte de demandes est trop approximative pour un registre d'argent |
| T2 | Rappels sans ouvrir l'agenda | horizon de 60 jours renouvelé à chaque ouverture ; point d'entrée `background` du moteur plus tard |
| T3 | Graphiques | composant partagé dans `@etabli/ui`, construit avant `finances` |
| T4 | Flux `.ics` par utilisateur pour l'iPhone d'un colocataire | non en v1 ; export manuel |
| T5 | Permissions entre plugins : validation par liaison, ou une fois par pack | une ligne par liaison, affichée à l'installation de **chaque** plugin, jamais acceptée « en bloc » sans liste ; un plugin tiers peut les demander mais elles sont mises en avant |
| T6 | Stockage : un JSON par plugin ou vrai stockage | un JSON par plugin ; stockage plus riche seulement si l'ERP l'exige |
| T7 | `finances` pour Retux Panel (PHP, hors Établi) | pas en v1 ; plus tard par l'API du serveur ou par import de totaux ; la comptabilité légale reste dans Retux Panel |
| T8 | Registre : jamais de suppression, correction par annulation ; devise unique | oui, EUR seulement en v1 |
| T9 | Fuseau et dates : jour civil + minutes pour les horaires, instant UTC pour ce qui a eu lieu | oui ; fuseau `Europe/Paris` par défaut, réglable ; fuseau **figé** sur chaque écriture |
| T10 | Noms de service globaux : collision possible | un nom de service = un plugin ; préfixe imposé plus tard |
| T11 | Cœur Rust : WebAssembly ou TypeScript | **TypeScript** avec vecteurs d'or (A.4.3) |
