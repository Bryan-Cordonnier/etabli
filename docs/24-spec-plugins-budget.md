# 24 — Spécification : plugins « agenda », « finances », « paie » et « budget » (reprise de gestion-budget-perso) — brouillon

> **Statut : brouillon, documentation seulement.** Aucun code n'est écrit. Ce document (1) fait l'inventaire de l'ancien projet
> `gestion-budget-perso` (lu en lecture seule, rien n'y a été modifié), (2) propose le découpage en quatre plugins qui s'appellent par des **services** (`agenda`, `finances`, `paie`, `budget`), leurs écrans,
> leurs données, leurs contrats de service et leurs calculs, (3) relève ce que le mécanisme de services permet **réellement** aujourd'hui et ce qui manque
> au moteur et au SDK, (4) tranche entre réemploi du cœur Rust en WebAssembly et réécriture en TypeScript. Les choix qui engagent Bryan sont des **questions ouvertes** (section 15). Aucune étape de code ne
> démarre avant sa validation (règle d'`AGENTS.md`).
>
> Documents liés : [06](06-protocole-sdk.md) (SDK), [07](07-creer-un-plugin.md) (plugin), [08](08-documents-donnees.md) (données),
> [16](16-spec-serveur-utilisateurs-mobile.md) (serveur, mobile, permissions `notifications`/`reseau`),
> [19](19-modele-de-menace-plugins.md) (isolation, permissions v1). La spécification des **distributions** est `docs/23-spec-distributions.md`
> (branche `spec-distributions`, pas encore fusionnée : d'où l'absence de lien cliquable ici).

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
- `crypto.randomUUID()` pour les identifiants (à vérifier dans un cadre isolé, voir 9.16).

## 4. Ce qui se reprend, se réécrit, se jette

| Élément | Verdict | Pourquoi |
| --- | --- | --- |
| **Formules et jeux de tests** de `paie.rs`, `horaires.rs`, `repos.rs` | **reprendre tels quels** (comme spécification exécutable) | ce sont les 18 cas de test, avec leurs valeurs attendues ; ils deviennent des « vecteurs d'or » (section 10) |
| Cœur Rust lui-même | **porter en TypeScript** (recommandé, section 10) ; le dépôt reste la référence | ~450 lignes de calcul, aucune dépendance native |
| Pont `wasm-bindgen`, `build-wasm.mjs`, `wasm.ts` | **abandonner** si TypeScript | n'a de sens que pour du WASM |
| `dates.ts`, `ics.ts` | **reprendre en les adaptant** | utilitaires de dates civiles (lundi → dimanche, plages) et génération `.ics` ; à compléter (UTC, fuseau) |
| `planning.ts` (jours de mission, regroupement par semaine, événements du jour, rappels) | **reprendre** (logique) | c'est le « colle » entre données et cœur ; à réécrire au format des données d'Établi |
| `types.ts` | **reprendre en le refondant** | modèle trop plat (un objet unique) ; voir section 6 |
| `store.svelte.ts` (`localStorage`) | **jeter** | remplacé par `PluginSettings`/documents du SDK (section 8) |
| Vues Svelte (Agenda, Missions, Réserve, Réglages), composants | **réécrire avec `@etabli/ui`** | `Field`, `SelectField`, `Segmented`, `Card`, `Result` font déjà le travail ; seul le **calendrier** (grille de mois, 83 l.) est à reprendre |
| Thème sombre, Inter/JetBrains Mono, lucide | **jeter** | fournis par le moteur (thèmes, `base.css`) ; le sombre par défaut devient un réglage de la **distribution** |
| Cahier des charges §3 (comptes), §13 (stack Capacitor, serveur axum, SQLite, VPN) | **obsolète** | remplacé par le moteur : serveur facultatif (docs/17), Capacitor (`apps/mobile`), IndexedDB |
| `SPEC-MOTEUR-SERVEUR.md` | **obsolète** | déjà intégré dans docs/16 |
| Foyer, Retux, voiture, documents, dettes, import bancaire | **repousser** | hors du premier périmètre (section 5) |
| **Surdimensionné** (Bryan le sait) | cœur Rust + pont WASM + serveur axum + OSRM auto-hébergé pour un utilisateur | la **valeur** est dans les règles de calcul et les tests ; on les garde, on jette la machinerie. Mutualiser = écrire les règles **une fois**, dans le moteur de plugins qui existe déjà |

---

# Deuxième partie — Spécification des plugins

> Refonte du découpage (4 octobre 2026), après validation par Bryan de la **mutualisation** : sur le modèle d'un serveur de jeu où un
> plugin « banque » expose des fonctions que les autres appellent, **chaque plugin possède un registre et l'expose par des fonctions** ;
> les autres l'appellent au lieu de recopier les données. Le découpage précédent (`agenda`, `revenus`, `budget`) est remplacé par
> `agenda`, `finances`, `paie`, `budget`.

## 5. Découpage en plugins

Principes d'Établi respectés : un plugin = des mini-apps ; **plugins indépendants** ; une mini-app ne touche ni au disque ni au réseau.
Règle de mise à jour (voulue par Bryan) : **chaque plugin se met à jour seul, même dans un pack ; jamais de mise à jour groupée.** Une
dépendance signifie uniquement « j'ai besoin d'une fonction d'un autre plugin », avec une plage de versions de **contrat**.

| Plugin (id) | Rôle | Mini-apps | Dépend de | Publie (service@contrat) |
| --- | --- | --- | --- | --- |
| **`agenda`** | le temps : événements, calendrier, chronologie à rebours, repos légal, **seul détenteur** de la permission `notifications` ; envoie les rappels demandés par les autres | Calendrier ; Rappels et horaires ; réglages | rien | `agenda@1` (événements, plages) ; `rappels@1` (programmer, annuler) |
| **`finances`** | l'argent, généraliste (aussi dans l'ERP) : comptes, catégories, **registre** d'écritures, prévisions, soldes, séries, graphiques | Tableau de bord ; Écritures ; Comptes et catégories ; Courbes ; réglages | rien | `finances@1` (lecture, prévisions, écritures) |
| **`paie`** | **particuliers seulement** : programmer sa paie (CDI, CDD, missions d'intérim, réserve) | Contrats ; Missions d'intérim ; Réserve ; Bulletins ; réglages | `finances` et `agenda` : **facultatives** | aucun en v1 (voir 5.3) |
| **`budget`** | budget du mois : virements planifiés, diagramme des dépenses prévues, courbe « combien d'argent à quelle date » | Budget du mois ; Virements ; Abonnements ; Simulateur ; réglages | `finances` **obligatoire** ; `agenda` facultatif | aucun en v1 |
| *plus tard* `foyer`, `retux-suivi`, `voiture` | colocation, marge par PC, entretien | — | `finances` | — |

Graphe d'appels (sens : « appelle ») : `paie → finances`, `paie → agenda`, `budget → finances`, `budget → agenda`. `finances` et `agenda` ne
s'appellent pas entre eux en v1 : **pas de cycle, profondeur 1**. Un rappel d'échéance de `finances` passe par le plugin demandeur
(`budget`, `paie`), jamais par `finances` lui-même.

### 5.1 `finances`

Généraliste, sans hypothèse « particulier » : pas de notion de salaire, de réserve, de foyer ni d'intérim. L'ERP (Retux Panel) s'en sert
comme registre de trésorerie (ses règles propres, voir la limite ci-dessous).
- **Hors périmètre, à noter** : comptabilité légale (TVA, factures, avoirs, livre-journal conforme, plan comptable, numérotation légale,
  clôture d'exercice). `finances` n'est **pas** une comptabilité ; c'est un registre de mouvements d'argent avec catégories et courbes.
  Retux Panel garde sa comptabilité (règles 1 à 3 de son `CLAUDE.md`) ; si l'ERP s'en sert, il y met des écritures *déjà* calculées
  par son propre code et ne lit que des totaux. Toute dérive vers la TVA ou les factures se refuse ici et se traite dans un autre plugin.
- Distingue **prévu** et **réalisé** (5.1.1).

#### 5.1.1 Prévu et réalisé : deux familles, pas un champ d'état

| | Écritures (réalisé) | Prévisions (prévu) |
| --- | --- | --- |
| Nature | **registre en ajout seulement** : jamais modifiée, jamais supprimée | liste de travail : remplaçable, supprimable |
| Correction | **écriture d'annulation** (montant opposé, `annule` = id de l'originale), puis nouvelle écriture juste | on remplace la prévision |
| Date | `quand` = **instant UTC** (ms) du fait ; `jour` = jour civil dérivé avec le fuseau **figé à la création** | `jour` civil prévu (date de virement attendue) + `fuseau` |
| Propriétaire | `source` : plugin appelant (imposé par le moteur, 7.3) + `ref` | idem |
| Passage | `previsions.realiser(id, …)` crée l'écriture et marque la prévision `realisee` (lien `ecritureId`) | |

Pourquoi deux familles : la règle « registre en ajout seulement » (celle de Retux Panel pour ses tables figées) est incompatible avec un
prévu qu'on déplace tous les jours. Le prévu reste libre, le réalisé est inaltérable.

### 5.2 `agenda`

Gère l'agenda. **Détient la permission `notifications`** : un seul plugin demande « sonner / notifier » à l'utilisateur ; les autres
envoient des *demandes de rappel*. Gain : une seule autorisation à accorder, une seule liste de rappels à programmer (plafond Android :
200, horizon 60 jours), un seul endroit qui connaît le fuseau et les changements d'heure. « Prévoir large » : le service `rappels`
sert à tout demandeur (paie, budget, mais aussi Tôlerie pour une échéance de livraison, ou l'ERP).

### 5.3 `paie` : un plugin ou plusieurs ? (recommandation)

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

## 6. Modèle de données

Règles communes (reprises de l'ancien projet et de Retux Panel) :

- **Montants en centimes entiers**, jamais de flottant ; saisie « 12,50 » convertie **par analyse du texte** (pas de `parseFloat`).
  Taux en **points de base** (2200 = 22 %). Arrondi : moitié vers le haut, une seule fonction (`divArrondi`).
- **Durées en minutes entières.**
- **Deux sortes de temps** : (a) un **jour civil** `AAAA-MM-JJ` + heure en minutes depuis minuit pour « 8 h le 12 octobre » ; (b) un **instant UTC**
  (ms depuis 1970) pour ce qui a eu lieu ou doit sonner. La conversion (a) → (b) se fait **à un seul endroit** (`civil.ts`) avec le fuseau
  `Europe/Paris` (réglage). Test obligatoire autour des changements d'heure (derniers dimanches de mars et d'octobre).
- **Identifiants** : 16 octets aléatoires en hexadécimal. Numérotation légale : non pertinente (voir limite de `finances`).
- **Rien de financier en dur** : cotisations, IFM, CP, seuil de 35 h, tarif et indemnité de réserve, paliers, marges, durée de sommeil : **réglages**.
- **On ne recalcule pas le passé** : un net *reçu* est figé avec les taux appliqués.
- Chaque enregistrement porte `id`, `creeLe`, `modifieLe` (UTC) ; chaque jeu de données porte `schema` pour `migrate`.

### 6.1 `finances` (propriétaire du registre)

| Entité | Champs principaux |
| --- | --- |
| `Compte` | `id`, `nom`, `type` (`courant` · `epargne` · `especes` · `autre`), `devise` (`EUR`, un seul en v1), `soldeInitialCents`, `ouvertLe`, `archive` |
| `Categorie` | `id`, `nom`, `parentId?`, `sens` (`entree` · `sortie` · `les-deux`), `couleur?`. Liste modifiable ; aucune catégorie « légale » |
| `Ecriture` (**ajout seulement**) | `id`, `compteId`, `montantCents` (signé : entrée > 0), `quand` (instant UTC), `jour` (civil, figé), `fuseau` (figé), `categorieId`, `libelle`, `source` `{plugin, ref?}`, `annule?` (id d'une écriture), `creeLe`. Aucun champ ne se corrige |
| `Prevision` | `id`, `compteId`, `montantCents` (signé), `jour` (civil), `fuseau`, `categorieId`, `libelle`, `source` `{plugin, ref}`, `statut` (`attendue` · `realisee` · `abandonnee`), `ecritureId?`, `recurrence?` (développée à la lecture, jamais stockée) |
| `ReglagesFinances` | fuseau, devise, catégorie par défaut, premier jour du mois budgétaire (1 par défaut) |

Soldes : `solde(compte, à) = soldeInitial + Σ écritures jusqu'à à` (réalisé) ; `solde prévu(compte, à) = solde réalisé à aujourd'hui + Σ prévisions attendues
jusqu'à à`. Une prévision `attendue` dont le jour est passé est signalée « en retard » (jamais réalisée automatiquement).

### 6.2 `agenda`

| Entité | Champs principaux |
| --- | --- |
| `Evenement` | `id`, `type` (`rdv` · `perso` · `retux` · `travail` · `sommeil`), `titre`, `lieu`, `jour`, `debutMin`, `finMin` (peut dépasser 1 440), `trajetMin`, `margeMin?`, `rappels` (booléen), `repetition?`, `source` `{plugin, ref?}` (vide si créé à la main) |
| `Repetition` | `frequence` (`jour` · `semaine` · `mois`), `intervalle`, `jours?`, `jusquau?`, `exceptions` ; développée à la lecture |
| `DemandeRappel` | `plugin` (imposé), `groupe` (texte choisi par le demandeur, ex. `echeances`), `rappels[]` (voir 7.5) ; ensemble **remplacé en bloc** par (plugin, groupe) |
| `ReglagesAgenda` | marges par type, mise en route, préparation, sommeil cible, endormissement, pré-alerte, rappel de coucher, majoration de trajet (bp), fuseau, horizon |

Les événements `travail` créés par `paie` portent `source = {plugin: "paie", ref: "mission:<id>"}` ; l'alerte de repos de l'agenda les
traite comme des plages de travail sans connaître `paie`.

### 6.3 `paie`

| Entité | Champs principaux |
| --- | --- |
| `Contrat` | `id`, `type` (`cdi` · `cdd` · `interim`), `employeur`, `debut`, `fin?`, `brutMensuelCents?` ou `tauxHoraireCents?`, `heuresHebdoMin`, `jourDePaie` (jour du mois), `statut` |
| `Mission` (intérim) | `id`, `contratId?`, `agence`, `entreprise`, `lieu`, `debut`, `fin`, `joursSemaine`, `debutMin`, `finMin`, `pauseMin`, `tauxCents`, `tauxSupCents`, `seuilHebdoMin`, `trajetMin`, `statut` (`prevu` · `confirme` · `termine`), `ajustementsSup`, `exclusions` |
| `PeriodeReserve` | `id`, `lieu`, `jours` (`{jour, horsBase}`), `arriveeMin`, `departMin`, `tarifJourCents`, `indemniteHorsBaseCents`, `statut` (`probable` · `confirme`) |
| `Paie` (une échéance) | `id`, `origine` (`contrat:<id>` · `mission:<id>` · `reserve:<id>`), `moisDe`, `netEstimeCents`, `datePaiementEstimee` (jour), `previsionId?` (dans `finances`), `statut` (`prevue` · `confirmee` · `recue`), `netRecuCents?` |
| `Bulletin` | `id`, `paieId`, `netReelCents`, `ecartCents` (**figé**), `tauxAppliquesBp` (**figés**) |
| `ReglagesPaie` | cotisations par type (bp), IFM, CP, seuil, tarif et indemnité de réserve, délais de paie par source, compte et catégorie de `finances` utilisés, carburant et usure |

### 6.4 `budget`

| Entité | Champs principaux |
| --- | --- |
| `Budget` | `moisDe`, `enveloppes[]` (`categorieId`, `plafondCents`) |
| `Virement` (planifié) | `id`, `libelle`, `montantCents`, `compteSourceId`, `compteCibleId`, `jour` civil, `recurrence?`, `rappel` (booléen) : traduit en deux `Prevision` dans `finances` (sortie et entrée) de `source = budget` |
| `Abonnement` | `id`, `libelle`, `montantCents`, `periodicite`, `prochaineEcheance`, `aResilier` : traduit en `Prevision` récurrente |
| `Palier`, `Scenario`, `Simulation` | comme dans l'ancien découpage (paliers 1 000 / 4 000 / 6 000 €, pondération par statut) |

`budget` **ne possède pas** les écritures : son « mouvement de réserve » de l'ancienne version devient une écriture de `finances` sur un compte « Réserve ».

## 7. Services entre plugins

### 7.1 Ce que le mécanisme permet aujourd'hui (relevé dans le code, non essayé en situation réelle)

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
(section 9.1 à 9.4) : des appels avec arguments, des écritures autorisées, un fournisseur joignable sans page ouverte, et le versionnage
sur le contrat.

### 7.2 Mécanisme proposé : « fonctions de service »

Le manifeste du fournisseur décrit des **fonctions** ; le moteur route les appels, vérifie, et fait répondre le fournisseur.

```jsonc
// manifeste de finances (extrait, proposition)
"provides": { "finances": "1" },                    // existe déjà : nom → version du contrat
"serviceEntry": "service/index.html",               // NOUVEAU : page sans interface qui répond aux appels
"functions": {                                      // NOUVEAU : déclaration vérifiée par le moteur
  "finances": {
    "soldes.aLaDate":      { "acces": "lecture" },
    "ecritures.ajouter":   { "acces": "ecriture" },
    "previsions.remplacer":{ "acces": "ecriture" }
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
`background` de 9.2), transmet l'appel, attend la réponse, ferme ; (6) renvoie le résultat. Les appels sont **sérialisés par fournisseur**
(une file) pour qu'un registre ne soit jamais modifié par deux appels à la fois. Le fournisseur valide ses arguments (schéma), les bornes
et les permissions de **données** (un appelant ne touche que ce qu'il a créé, 7.3).

Variante moins coûteuse pour un premier jalon (« v0 ») : **boîte de demandes**. L'appel d'écriture dépose une demande dans un fichier
du moteur ; le fournisseur la traite à sa prochaine ouverture. Avantage : aucun cadre invisible. Inconvénient : écriture *asynchrone et
différée* (l'écriture n'existe pas tant que `finances` n'est pas rouvert), donc soldes faux entre-temps. Acceptable pour `rappels`,
non pour un registre. **Non recommandée pour `finances`**.

### 7.3 Règles communes à tous les contrats

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

### 7.4 Contrat `finances@1`

| Fonction | Accès | Arguments | Retour | Erreurs propres |
| --- | --- | --- | --- | --- |
| `comptes.liste` | lecture | — | `Compte[]` | — |
| `categories.liste` | lecture | — | `Categorie[]` | — |
| `ecritures.liste` | lecture | `{du?, au?, compteId?, categorieId?, source?, curseur?}` | `{ecritures, curseur?}` | `argument_invalide` |
| `previsions.liste` | lecture | `{du?, au?, compteId?, source?, statut?}` | `{previsions, curseur?}` | |
| `soldes.aLaDate` | lecture | `{jour, comptes?, mode: "realise" \| "prevu"}` | `{[compteId]: cents}` | |
| `serie.parJour` | lecture | `{du, au, comptes?, mode}` | `[{jour, soldeCents}]` (un point par jour) | `limite_atteinte` si > 1 830 jours |
| `totaux.parCategorie` | lecture | `{du, au, mode, sens?}` | `[{categorieId, cents}]` | |
| `comptes.creer` | écriture | `{nom, type, soldeInitialCents, cle}` | `{id}` | `argument_invalide` |
| `categories.creer` | écriture | `{nom, parentId?, sens, cle}` | `{id}` | |
| `ecritures.ajouter` | écriture | `{compteId, montantCents, quand, categorieId, libelle, ref?, cle}` | `{id}` | `introuvable` (compte), `argument_invalide` |
| `ecritures.annuler` | écriture | `{id, motif, cle}` | `{id}` (écriture inverse) | `introuvable`, `deja_annulee`, **seulement** les écritures de l'appelant |
| `previsions.remplacer` | écriture | `{ref, previsions: [{compteId, montantCents, jour, categorieId, libelle}], cle}` | `{ids}` | remplace **toutes** les prévisions `attendues` de (appelant, `ref`) |
| `previsions.supprimer` | écriture | `{ref}` | `{supprimees}` | |
| `previsions.realiser` | écriture | `{id, montantCents?, quand?, cle}` | `{ecritureId}` | `introuvable`, `deja_realisee` |

L'appelant ne peut pas modifier une écriture (il n'y en a pas) ; il peut seulement en ajouter ou en annuler une de lui. Absence de `finances` :
voir 7.7. Aucune fonction ne supprime d'écriture ou de compte. `comptes.creer` est un confort : en pratique l'utilisateur crée ses comptes dans `finances`
et `paie`/`budget` les lui proposent dans une liste.

### 7.5 Contrats `rappels@1` et `agenda@1`

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

### 7.6 Qui appelle quoi

| Appelant | Fonction | Quand | Si l'autre est absent |
| --- | --- | --- | --- |
| `paie` | `finances.previsions.remplacer({ref: "mission:<id>"})` | à chaque modification d'une mission, d'un contrat ou du statut d'une paie | calcul et écrans de `paie` inchangés ; bandeau « Installez Finances pour voir vos paies dans votre budget » ; compteur de paies « non transmises » |
| `paie` | `finances.previsions.realiser` / `ecritures.ajouter` | à la saisie du bulletin (net reçu) | idem |
| `paie` | `agenda.evenements.remplacer({ref})`, `rappels.remplacer({groupe: "paie"})` | modification d'une mission, jour de paie, rappel de bulletin | missions visibles dans `paie` seulement ; export `.ics` direct depuis `paie` en repli (9.8) |
| `budget` | `finances.*.liste`, `soldes`, `serie.parJour`, `totaux.parCategorie` | à l'ouverture et à chaque `onChange` | **plugin obligatoire** : sans lui, `budget` s'installe quand même mais n'affiche qu'un écran « Finances est nécessaire » (le moteur le prévient à l'installation) |
| `budget` | `finances.previsions.remplacer({ref: "virement:<id>"})` | planification d'un virement | idem |
| `budget` | `agenda.evenements.liste`, `rappels.remplacer({groupe: "budget"})` | affichage des échéances ; rappel de virement | échéances absentes du graphique ; pas de rappel |
| `agenda` | aucune fonction d'un autre plugin | — | — |
| `finances` | aucune fonction d'un autre plugin | — | — |

### 7.7 Plugin absent, désinstallé, désactivé, mauvaise version

| Cas | Comportement exigé (consommateur) | Comportement du moteur |
| --- | --- | --- |
| Absent (jamais installé) | dépendance **facultative** : mode dégradé et bandeau avec lien d'installation ; **obligatoire** : écran dédié (jamais d'écran blanc) | `call` renvoie `service_absent` |
| Désinstallé après coup | retour au mode dégradé au prochain `onChange`/`call` ; **rien n'est effacé chez le consommateur** | `dependentsOf` avertit avant la désinstallation d'une dépendance obligatoire ; les écritures déjà faites restent chez le fournisseur tant que ses données le sont (les calculs sont conservés, comme pour les plugins actuels) |
| Désactivé | idem absent | `call` : `service_absent` |
| Contrat trop ancien/trop récent | message « mettez à jour Finances » / « mettez à jour Paie » ; aucune écriture tentée | `contrat_incompatible` |
| Fournisseur en panne (cadre de service qui ne répond pas) | file d'attente locale côté consommateur (« 3 envois en attente »), nouvel essai à la prochaine ouverture | `delai_depasse` après 5 s |
| Écriture déjà faite puis fournisseur réinstallé | les prévisions de `paie` sont **recalculées entièrement** à l'ouverture suivante (`remplacer` est idempotent) | — |

Règle de conception : **un consommateur doit pouvoir être réparé en rejouant**. Le consommateur garde sa propre vérité (missions, contrats), et
`finances`/`agenda` ne reçoivent que des *projections* qu'on peut régénérer.

## 8. Stockage avec les API actuelles du SDK

| Outil | Nature | Limites |
| --- | --- | --- |
| `MiniAppDocument` | un **calcul** (`.etabli`) par mini-app | 5 Mo ; pas un registre permanent |
| `PluginSettings` | **un JSON par plugin**, partagé par ses mini-apps, enregistré 400 ms après la dernière modification | 5 Mo, 4 Mo par message ; pas de `migrate` (seulement `clean`) |
| Service (`provide`) | instantané publié vers les plugins qui en dépendent | JSON, validé côté lecteur |
| Mode serveur | « tout sur le serveur » (docs/16 §9) | décidé |

**Proposition v1 (sans modifier le moteur pour le stockage)** : chaque plugin garde ses données vivantes dans `PluginSettings` sous
`{ schema, … }`. Pour `finances`, le registre est le plus gros : 300 octets par écriture ≈ 16 000 écritures dans 5 Mo. Un particulier : des
années. **L'ERP** dépassera ce plafond : voir limite de `finances` pour l'ERP (stockage serveur, question 11). Au-delà de 3 Mo,
« clôturer l'année » déplace l'année écoulée vers un document archivé en lecture seule (les soldes sont reportés par une écriture
d'ouverture ; fonction de `finances`).

## 9. Ce qui manque au moteur et au SDK

Classé par importance. Les quatre premiers viennent de la section 7.1.

| # | Manque | Pourquoi ici | Proposition |
| --- | --- | --- | --- |
| 9.1 | **Appels de service avec arguments et réponse** | tout le découpage repose dessus ; aujourd'hui, snapshot en lecture seule | messages `serviceCall`/`serviceReply` dans `protocol.ts` + `etabli.services.call(nom, fonction, args, options)` ; routage, délais, file par fournisseur dans `services.svelte.ts` ; garde : forme, taille, identité |
| 9.2 | **Fournisseur joignable sans page ouverte** (`serviceEntry`/`background`) | `finances` doit répondre quand l'utilisateur est dans `paie` ; l'agenda doit recalculer ses rappels | page sans interface chargée à la demande en cadre invisible (même isolement que les autres, CSP identique), puis fermée ; durée de vie ≤ 10 s par appel ; aussi utilisable au démarrage pour renouveler les rappels. Décision de conception (Q7) |
| 9.3 | **Écriture inter-plugins sous permission** | un plugin ne doit pas écrire chez un autre sans que l'utilisateur le sache | permission `appelle:<service>:<acces>` déclarée par le consommateur, montrée à l'installation ; `functions` du fournisseur avec `acces` vérifié par le moteur ; `npm run valider` contrôle les deux. Passe par `permissions.ts` et docs/19 §6 |
| 9.4 | **Versionnage sur le contrat, pas sur le plugin** | `satisfies` s'applique aujourd'hui à la version du plugin | dépendance de type `"services": { "finances": "^1" }` (plage sur la version de contrat de `provides`) ; `planInstall` et `problemsOf` le comprennent ; le fournisseur peut publier plusieurs versions de contrat à la fois |
| 9.5 | **Identité de l'appelant et espace propre** | éviter qu'un plugin modifie les données d'un autre | `appelant` injecté par le moteur (7.3) ; contrôles de propriété dans le fournisseur, testés |
| 9.6 | **Rappels / alarmes** (permission `notifications`, docs/16 §7) | raison d'être de l'agenda | message `reminders.set(liste)` (remplace l'ensemble) et `reminders.clear()`, exécutés **par l'hôte** (Capacitor sur Android, essai du 4 octobre réussi ; Rust sur Windows ; web : notification si l'onglet vit) ; liste gardée sur disque et reprogrammée au démarrage. **Seul `agenda` déclare `notifications`** ; `rappels@1` (7.5) le partage. Plafonds : 200 rappels, 60 jours |
| 9.7 | **Import de fichier** (permission `import`) | restaurer une sauvegarde, relevé bancaire CSV (`finances`), `.ics` | message `openFile({extensions, maxBytes})`, boîte « Ouvrir » exécutée par l'hôte, renvoie le **texte** (5 Mo max) ; le plugin ne voit jamais le chemin |
| 9.8 | **Extension `ics` pour `saveFile`** | export agenda et filet iPhone | ajouter `ics` à la liste blanche (côté interface et côté Rust) |
| 9.9 | **Graphiques** | courbes de solde, diagramme de dépenses (`finances`, `budget`) | `Sparkline`/`LineChart`/`BarChart`/`DonutChart` en SVG pur dans `@etabli/ui`, couleurs des jetons de thème, valeurs entières, tableau de valeurs accessible. Mutualisé entre `finances`, `budget` et l'ERP. Décision Q8 |
| 9.10 | **Argent et dates partagés** (`money.ts`, `civil.ts`) | `finances`, `paie`, `budget`, `agenda` et l'ERP | `parseEuros`, `formatEuros`, `divArrondi`, points de base ; jours civils, lundi de la semaine, plages, développement d'une répétition, jour+minutes → instant UTC en `Europe/Paris`. Écrits et testés **une fois** |
| 9.11 | **Stockage de plugin plus riche** (facultatif) | export/import, migration, volume de l'ERP | `PluginSettings` avec `migrate(saved)` ; export/import JSON ; collections indexées si l'ERP les exige |
| 9.12 | **Schémas de contrat vérifiés par le moteur** | docs/19 §4 : données de service hostiles | `functions.*.schema` (JSON Schema simple) dans le manifeste ; refus avant d'atteindre le fournisseur |
| 9.13 | **Outil de test des services** | écrire `paie` sans `finances` réel | simulateur de fournisseur dans le kit (`mockService`) pour Vitest ; vecteurs d'or rejoués contre le contrat |
| 9.14 | **Réseau** (`reseau`) | itinéraire, géocodage | pas en v1 : trajet saisi en minutes |
| 9.15 | **Flux de calendrier pour iPhone** | alarmes iPhone | route du serveur d'Établi servant un `.ics` par utilisateur (Q9) |
| 9.16 | **Essais** | `crypto.randomUUID()` dans un cadre à origine opaque ; `Intl` avec `Europe/Paris` ; cadre invisible (9.2) | plugin d'essai jetable, comme `essai-isolation` |

Ce que le contrat actuel **permet déjà** et que ces plugins utilisent : réglages de plugin, documents, publication/lecture d'instantanés,
dépendances facultatives et leur installation, `send` (geste utilisateur), `saveFile` (CSV, JSON), `print`, `openSettings`, thèmes.

## 10. Réemploi du cœur Rust : WebAssembly ou TypeScript ?

(Inchangé sur le fond ; les modules partagés de 9.10 servent désormais aussi `finances` et l'ERP.)

### 10.1 Ce que le contrat actuel autorise (relevé dans le code, non essayé)

| Point | Constat |
| --- | --- |
| Exécution de WebAssembly dans le cadre | **autorisée** : la politique CSP des pages de plugins contient `script-src … 'wasm-unsafe-eval'` (bureau : `apps/desktop/src-tauri/src/plugins.rs`, serveur : `crates/serveur/src/routes_plugins.rs`) |
| Service du fichier `.wasm` | **prévu** : type MIME `application/wasm` connu du protocole `plugins://`, du serveur et de `etabli-noyau::paquet::type_mime` |
| Chargement habituel de `wasm-bindgen` (`fetch` du `.wasm`) | **bloqué** : `connect-src 'none'` interdit `fetch`. Il faudrait **intégrer les octets dans le JavaScript** (base64, `initSync`) : +33 % de taille, soit ~260 Ko |
| Précédent dans le dépôt | **aucun** plugin n'utilise WebAssembly ; ni `npm run valider`, ni `build:plugins`, ni la CI ne le connaissent |
| Sécurité | aucun pouvoir de plus que JavaScript dans le cadre ; reste la boucle infinie (docs/19 #15) |
| Hôtes | à vérifier sur chacun : bureau (WebView2), Android (Capacitor), web statique et PWA iPhone |

### 10.2 Comparaison

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

### 10.3 Recommandation : **réécriture en TypeScript, avec des vecteurs d'or tirés du Rust**

(1) Le cœur est petit et pur ; (2) WebAssembly est *possible* mais non prouvé, pour un gain nul ; (3) la mutualisation voulue par Bryan passe par des
modules écrits une fois pour quatre plugins et l'ERP, pas par un binaire ; (4) un seul langage dans tous les plugins garde le catalogue
maintenable par une personne seule. Garde-fous : les 18 tests Rust deviennent des fichiers `entree.json` → `sortie.json` (générés une fois par un petit
programme Rust, versionnés dans `paie`/`agenda` et dans le kit pour `money`/`civil`), rejoués par Vitest, avec des cas aux limites (changement d'heure,
semaine à cheval sur deux mois, demi-centimes, entrées négatives). Si un calcul devient lourd, WebAssembly se rouvre comme **décision séparée**.

## 11. Écrans (par plugin)

Interface Établi (colonne de plugins, onglets, Accueil, thèmes) ; chaque écran = une mini-app, `@etabli/ui` ; sur mobile, la barre basse.

**`agenda`**
- *Calendrier* : mois / semaine / jour ; pastilles par type (les événements posés par un autre plugin portent son nom) ; panneau du jour avec la
  **chronologie à rebours** (coucher, réveil, départ, arrivée) et l'état des rappels ; ajout avec répétition ; alertes de repos ; « Exporter .ics ».
- *Rappels et horaires* : réglages, aperçu sur un exemple, test d'un rappel dans 1 minute, **liste des rappels programmés par plugin** (« paie : 4, budget : 2 ») avec bouton
  « tout annuler » par plugin, et état de la permission.
- Réglages (fuseau, horizon, plugins autorisés à demander des rappels).

**`finances`**
- *Tableau de bord* : soldes par compte (réalisé et prévu), prochaines prévisions, prévisions en retard.
- *Écritures* : liste filtrable (compte, catégorie, source, période) ; ajout ; **annulation** (jamais de suppression) ; import CSV plus tard.
- *Comptes et catégories* : création, archivage, arborescence de catégories.
- *Courbes* : solde par jour (réalisé en trait plein, prévu en pointillés), dépenses par catégorie, comparaison de deux périodes.
- Réglages (fuseau, premier jour du mois, **liste des plugins qui écrivent** avec leur nombre d'écritures et de prévisions).

**`paie`**
- *Contrats* : CDI (brut mensuel ou taux horaire, jour de paie), CDD (dates, fin, indemnité de précarité) ; net estimé par mois.
- *Missions d'intérim* : liste ; fiche ; **net estimé en direct** ; comparaison de deux missions (gain net après carburant et usure) ; pose sur l'agenda.
- *Réserve* : jours en lot ou un par un, hors base, compteur annuel (~50 jours), conflit avec une mission.
- *Bulletins* : net réel, écart, proposition d'ajuster les taux ; statut prévue → confirmée → reçue.
- Réglages (taux, compte et catégorie cibles dans `finances`), indicateur « transmis à Finances / à l'Agenda : n sur n ».

**`budget`**
- *Budget du mois* : enveloppes, **diagramme des dépenses prévues du mois** (par catégorie), reste à vivre, message « mois tendu ».
- *Courbe du mois* : « à telle date, j'ai X € de prévu » (prévisions de `finances` + virements planifiés + échéances de l'agenda) ; ligne du plancher de sécurité.
- *Virements* : planifier des dates de virement pour que le compte bancaire colle (le compte courant ne passe jamais sous un seuil) ; rappel facultatif via `agenda`.
- *Abonnements* ; *Simulateur de déménagement* ; *Paliers et runway*.

## 12. Calculs (spécification)

Tous en entiers ; `arr(n, d) = floor((2n + d) / 2d)` (moitié vers le haut, d > 0) ; `bp` = points de base.

**Intérim** (`paie.rs`, par semaine lundi → dimanche) : `normales = min(planifié, seuil)` ; `sup = max(planifié − seuil, 0) + sup_manuel` ;
`brut_base = arr(normales × taux, 60) + arr(sup × taux_sup, 60)` ; `ifm = arr(brut_base, 10)` ; `cp = arr(brut_base + ifm, 10)` ;
`brut_total = brut_base + ifm + cp` ; `net = arr(brut_total × (10 000 − cotisations_bp), 10 000)`. Nuit : `fin ≤ début` ajoute 24 h ; pause déduite.
Référence (vecteur d'or) : 5 × 7 h à 13 € → net 429,43 €.

**Réserve** : `net = arr(jours × tarif × (10 000 − cotis_bp), 10 000) + hors_base × indemnité`.

**CDI** (nouveau, à valider sur un bulletin) : `net_mensuel = arr(brut_mensuel × (10 000 − cotisations_bp), 10 000)` ; mois incomplet : prorata en jours
ouvrés du contrat, arrondi par `arr`. **CDD** : comme le CDI avec, à la fin, `précarité = arr(brut_total_contrat, 10)` (10 %, réglage) et congés payés
(10 %, réglage) si non pris. Taux et règles **non confirmés** : voir Q4.

**Date de paiement** : `jourDePaie` du contrat ; intérim : fin de semaine + délai de paie (réglage) ; jamais un dimanche (report au jour ouvré suivant, réglage).

**Gain net d'une mission** : `net − carburant − usure` (unités à fixer avec Bryan, Q4).

**Horaires** (`horaires.rs`) : `trajet = ⌈trajet_base × (10 000 + majoration_bp) / 10 000⌉` ; `arrivée = début − marge` ; `départ = arrivée − trajet` ;
`décision = départ − mise_en_route` ; `réveil = décision − préparation` ; `coucher = réveil − sommeil − endormissement` ; rappels : `décision − pré_alerte`
et `coucher − rappel_coucher`. Négatif = la veille.

**Repos** (`repos.rs`) : 11 h entre plages, 10 h par plage, 48 h sur 7 jours glissants ; plages tirées des événements `travail`/`retux` de l'agenda
(donc aussi ceux de `paie`).

**Soldes et courbe** (`finances`) : `solde(c, j) = soldeInitial + Σ écritures(c, ≤ j)` ; prévu : `solde réalisé(c, aujourd'hui) + Σ prévisions attendues(c, ≤ j)` ;
`serie.parJour` = une valeur par jour de `du` à `au`, jours sans mouvement reportés.

**Courbe du mois** (`budget`) : `série prévue` de `finances` + virements planifiés de `budget` (déjà des prévisions) ; `plancher = min(série)` ; jours « sous seuil »
signalés avec l'écart en centimes.

**Runway** : `runway_dixiemes = floor(réserve × 10 / coût_mensuel_scénario)`, `coût_mensuel_scénario = arr(coût × coefCoût_bp, 10 000)` ; cas nuls explicites.
La réserve se lit dans `finances` (compte « Réserve »).

**Paliers** : première date où `réserve + Σ épargne_mensuelle_pessimiste ≥ palier`, revenus pondérés par statut (`prévu` 50 %, `confirmé` 100 %, `reçu` déjà dans la réserve) et décalés
par le délai de paie.

**Prévision / allocation** : `reste_à_vivre = revenus pondérés − charges fixes − nourriture − carburant − provisions` ; allocation proposée seulement si le matelas cible est atteint en
pessimiste. C'est un calcul, pas un conseil financier.

Principe directeur conservé : *l'application ne donne jamais un chiffre qui flatte* (pessimiste en premier).

## 13. Ordre de développement conseillé

Fondations d'abord. Chaque étape est utilisable seule ; le moteur ne bouge qu'aux étapes marquées « moteur ».

| # | Étape | Sortie | Test |
| --- | --- | --- | --- |
| 0 | Validation de cette spec ; réponses aux questions ; montants de solde et de cotisations confirmés (agence, lundi 5 octobre) | spec figée | — |
| 1 | **Outils communs** (moteur) : `money.ts`, `civil.ts` dans `@etabli/ui` + vecteurs d'or | modules testés | Vitest |
| 2 | **Appels de service** (moteur, 9.1 à 9.5, 9.13) : `call`, `serviceEntry`, permission `appelle:*`, contrat de version, simulateur de test. Essai jetable d'un cadre invisible (9.16) | mécanisme prouvé par un plugin d'essai | Vitest + essai |
| 3 | Plugin **`finances`** (comptes, catégories, registre, prévisions, soldes, séries ; contrat `finances@1`) | plugin publiable | vecteurs d'or, tests de contrat |
| 4 | Plugin **`agenda`** sans rappels (calendrier, événements, chronologie, repos, `.ics`, 9.8 ; contrat `agenda@1`) | plugin | idem |
| 5 | **Rappels** (moteur, 9.6) : `notifications`, Android puis Windows ; `rappels@1` dans `agenda` | rappels réels | essai sur le téléphone de Bryan |
| 6 | Plugin **`paie`**, intérim et réserve d'abord (urgence réelle), puis CDI et CDD ; appels vers `finances` et `agenda` | plugin | vecteurs d'or + essai sur un vrai bulletin |
| 7 | Plugin **`budget`** : budget du mois, courbe du mois, virements, abonnements, puis simulateur | plugin | vecteurs d'or, essai |
| 8 | Graphiques `@etabli/ui` (9.9, **ou avant l'étape 3 si Q8 = oui**), import (9.7), CSV bancaire | confort | Vitest |
| 9 | **Distribution « Budget personnel »** (docs/23) : plugins livrés d'office, chacun **avec sa propre version et sa propre mise à jour** | application installable | installation côte à côte |
| 10 | Plus tard : `foyer`, `retux-suivi`, `voiture`, itinéraire (`reseau`), éclatement de `paie` si utile | — | — |

Urgence : l'intérim commence la semaine du 5 octobre. Option : **publier `paie` avant les étapes 2 à 4**, en mode autonome (net estimé, `.ics` en repli, aucune
écriture), puis activer les appels quand les fondations existent. Gain : l'outil sert tout de suite. Coût : une couche « appel facultatif » déjà prévue (7.7), pas de réécriture.
À décider en Q2.

## 14. Risques

| Risque | Gravité | Parade |
| --- | --- | --- |
| **Explosion des appels entre plugins** (chaque écran appelle dix fonctions, boucles, cascade) | haute | graphe sans cycle et de profondeur 1 (5) ; lectures par `onChange` et cache, pas par interrogation ; une seule écriture groupée par modification (`remplacer`, pas ligne à ligne) ; file sérialisée et plafonds par appelant (7.3) ; compteur d'appels visible dans les réglages de `finances` |
| **Contrat d'API figé trop tôt** | haute | contrats **minimaux** en v1 (pas de `paie@1`, pas de `budget@1`) ; ajout de fonctions sans changement de version ; version majeure = deux versions servies ; essais de bout en bout avant de publier `finances@1` ; les noms de fonctions du tableau 7.4 sont des **propositions** |
| **Chaînes de dépendances** (A exige B qui exige C) | moyenne | une seule dépendance obligatoire (`budget → finances`), profondeur 1, aucune dépendance obligatoire pour `paie`/`agenda`/`finances` ; `planInstall` signale la chaîne |
| **Plugin absent ou désinstallé** | moyenne | mode dégradé défini pour chaque appel (7.6, 7.7), erreurs typées, rejouable (projection régénérable) |
| **Désynchronisation** : prévisions de `paie` périmées dans `finances` | moyenne | `remplacer` idempotent ; indicateur « transmis n sur n » ; re-synchronisation à chaque ouverture de `paie` ; la vérité reste chez l'émetteur |
| **Registre corrompu ou doublon d'écriture** | haute | ajout seulement, `cle` d'idempotence, file sérialisée, annulation par écriture inverse, export JSON, sauvegarde du serveur |
| **Détournement entre plugins** (un plugin écrit des écritures fausses) | moyenne | permission `appelle:finances:ecriture` montrée à l'installation, `source` imposée, espace propre, liste des écrivains dans `finances` |
| **Dérive vers la comptabilité légale** (TVA, factures) | moyenne | hors périmètre écrit en 5.1 ; refus des champs correspondants ; l'ERP garde sa comptabilité |
| **Net estimé faux** (22 % forfaitaire, indemnité non confirmée) | haute | taux visibles, calibrage sur bulletin, message « estimation », comparaison avec un vrai bulletin avant tout usage de décision |
| **Rappel qui ne sonne pas** | haute | permission au premier lancement, indicateur « rappels jusqu'au … », horizon renouvelé, filet `.ics`, essai sur d'autres téléphones (le test du 4 octobre ne couvre ni redémarrage ni autre marque) |
| **Données financières privées sur un serveur partagé** | moyenne | mode local par défaut ; en mode serveur, données par utilisateur (limite assumée, docs/16) |
| **Perte de données** (un JSON par plugin) | moyenne | écriture atomique du moteur, export JSON, sauvegarde du serveur |
| **Dérive du fuseau / heure d'été** | moyenne | une seule fonction de conversion, tests aux deux changements d'heure ; fuseau **figé** sur chaque écriture |
| **Portée trop large** | haute | quatre plugins seulement, étapes utilisables seules, `foyer`/`retux`/`voiture` écartés tant que 3 à 7 ne sont pas utilisés en vrai (« un chantier à la fois ») |
| **Travail moteur avant tout plugin utile** (étapes 2 et 5) | moyenne | option de publier `paie` en mode autonome (13) ; `finances` et `agenda` utilisables seuls même sans appels |
| Écart affichage / logique en double (leçon de `Agenda.svelte`) | faible | tout calcul d'argent passe par les modules testés |

## 15. Questions ouvertes pour Bryan

1. **Découpage** : `agenda`, `finances`, `paie`, `budget` vous conviennent-ils ? Noms (« Finances » ou « Comptes », « Paie » ou « Revenus ») ?
2. **Ordre** : fondations d'abord (`finances`, `agenda`, puis `paie`, puis `budget`) ou publier `paie` en mode autonome tout de suite pour l'intérim d'octobre (13) ?
3. **`paie`** : un seul plugin à modules internes (recommandé, 5.3) ou plugins séparés dès le départ ? Utilisez-vous *toujours* intérim et réserve ensemble ?
4. **Paie, montants** : solde de réserve (60 € imposable, 38 € non imposable hors base), cotisations (22 %), IFM (10 %), congés payés (10 %) confirmés par un contrat ou un bulletin ? Heures sup au-delà de 35 h avec taux propre à la mission ? Précarité de CDD (10 %) ? « Gain net après carburant » dès la v1 (consommation et prix à saisir) ?
5. **Fuseau et dates** : « jour civil + minutes » pour les horaires et instants UTC pour ce qui a eu lieu (6) ; fuseau toujours `Europe/Paris` ?
6. **Rappels** : lesquels sont des **alarmes** (réveil, coucher, départ) et lesquels de simples **notifications** (échéance, virement, palier) ? Combien de jours d'avance (60 proposés) ? Rappels utiles sur PC ou seulement sur le téléphone ? Acceptez-vous qu'`agenda` soit le seul à demander la permission ?
7. **Appels entre plugins** : acceptez-vous le mécanisme « fonctions de service » avec **cadre invisible** (7.2, 9.2), plus lourd pour le moteur mais seul adapté à un registre, ou une version simplifiée (boîte de demandes, écriture différée) pour commencer ? Rappels sans ouvrir l'agenda : rouvrir tous les 60 jours, ou point d'entrée `background` ?
8. **Graphiques** : composant partagé dans `@etabli/ui` (recommandé, 9.9) construit avant `finances`, ou SVG privé dans chaque plugin ?
9. **iPhone du colocataire** : flux `.ics` par utilisateur servi par le serveur, ou export manuel suffisant en v1 ? Foyer à deux : v2 lointaine ?
10. **Permissions entre plugins** : l'utilisateur doit-il valider chaque liaison (« Paie veut écrire dans Finances ») à l'installation, ou une seule fois pour tout un pack ? Un plugin tiers du catalogue peut-il demander à écrire dans `finances` ?
11. **ERP** : l'ERP est une distribution du moteur Établi (voir docs/23), pas une application à part. `finances` doit-il en être le registre de trésorerie ? Le registre en ajout seulement suffit-il, sachant que la comptabilité légale (TVA, factures, numérotation) serait un autre plugin, à spécifier plus tard ?
12. **Registre** : confirmez-vous « jamais de suppression, correction par écriture d'annulation » pour le réalisé, et un prévu librement remplaçable ? Devises multiples : non en v1 ?
13. **Stockage** : « un JSON par plugin » (8) suffit-il pour `finances`, ou le moteur doit-il d'abord offrir un vrai stockage (collections, export, sauvegarde) ?
14. **Distribution** : nom définitif du produit (« Budget personnel » est un nom de travail), plateforme d'abord (Android seul ou Windows aussi), mode par défaut (local ou serveur personnel), thème sombre par défaut, installation à côté d'Établi (docs/23 Q4) ?
15. **Confidentialité** : plugins livrés d'office publics (Apache-2.0) ou privés (registre privé, docs/23 §5.6) ? Vos hypothèses de paie seraient dans le code.
16. **Périmètre exclu** : confirmez-vous l'exclusion de la connexion bancaire, des courses avec prix réels, du conseil d'investissement, de l'optimisation de journée par IA, et de la comptabilité légale (TVA, factures) dans `finances` ?
