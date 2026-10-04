# 24 — Spécification : plugins « budget » et « agenda » (reprise de gestion-budget-perso) — brouillon

> **Statut : brouillon, documentation seulement.** Aucun code n'est écrit. Ce document (1) fait l'inventaire de l'ancien projet
> `gestion-budget-perso` (lu en lecture seule, rien n'y a été modifié), (2) propose le découpage en plugins d'Établi, leurs écrans,
> leurs données et leurs calculs, (3) liste ce qui manque au moteur et au SDK, (4) tranche entre réemploi du cœur Rust en WebAssembly
> et réécriture en TypeScript. Les choix qui engagent Bryan sont des **questions ouvertes** (section 12). Aucune étape de code ne
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
- `crypto.randomUUID()` pour les identifiants (à vérifier dans un cadre isolé, voir 8.4).

## 4. Ce qui se reprend, se réécrit, se jette

| Élément | Verdict | Pourquoi |
| --- | --- | --- |
| **Formules et jeux de tests** de `paie.rs`, `horaires.rs`, `repos.rs` | **reprendre tels quels** (comme spécification exécutable) | ce sont les 18 cas de test, avec leurs valeurs attendues ; ils deviennent des « vecteurs d'or » (section 9) |
| Cœur Rust lui-même | **porter en TypeScript** (recommandé, section 9) ; le dépôt reste la référence | ~450 lignes de calcul, aucune dépendance native |
| Pont `wasm-bindgen`, `build-wasm.mjs`, `wasm.ts` | **abandonner** si TypeScript | n'a de sens que pour du WASM |
| `dates.ts`, `ics.ts` | **reprendre en les adaptant** | utilitaires de dates civiles (lundi → dimanche, plages) et génération `.ics` ; à compléter (UTC, fuseau) |
| `planning.ts` (jours de mission, regroupement par semaine, événements du jour, rappels) | **reprendre** (logique) | c'est le « colle » entre données et cœur ; à réécrire au format des données d'Établi |
| `types.ts` | **reprendre en le refondant** | modèle trop plat (un objet unique) ; voir section 6 |
| `store.svelte.ts` (`localStorage`) | **jeter** | remplacé par `PluginSettings`/documents du SDK (section 7) |
| Vues Svelte (Agenda, Missions, Réserve, Réglages), composants | **réécrire avec `@etabli/ui`** | `Field`, `SelectField`, `Segmented`, `Card`, `Result` font déjà le travail ; seul le **calendrier** (grille de mois, 83 l.) est à reprendre |
| Thème sombre, Inter/JetBrains Mono, lucide | **jeter** | fournis par le moteur (thèmes, `base.css`) ; le sombre par défaut devient un réglage de la **distribution** |
| Cahier des charges §3 (comptes), §13 (stack Capacitor, serveur axum, SQLite, VPN) | **obsolète** | remplacé par le moteur : serveur facultatif (docs/17), Capacitor (`apps/mobile`), IndexedDB |
| `SPEC-MOTEUR-SERVEUR.md` | **obsolète** | déjà intégré dans docs/16 |
| Foyer, Retux, voiture, documents, dettes, import bancaire | **repousser** | hors du premier périmètre (section 10) |
| **Surdimensionné** (Bryan le sait) | cœur Rust + pont WASM + serveur axum + OSRM auto-hébergé pour un utilisateur | la **valeur** est dans les règles de calcul et les tests ; on les garde, on jette la machinerie. Mutualiser = écrire les règles **une fois**, dans le moteur de plugins qui existe déjà |

---

# Deuxième partie — Spécification des plugins

## 5. Découpage en plugins

Principes d'Établi respectés : un plugin = des mini-apps ; **plugins indépendants** (mise à jour séparée, liens facultatifs par
`optionalDependencies` et services, [09](09-bibliotheques-fiches-envoi.md)) ; une mini-app ne touche ni au disque ni au réseau.

| Plugin (id) | Rôle | Mini-apps | Dépend de | Publie (service) |
| --- | --- | --- | --- | --- |
| **`agenda`** | temps : calendrier, événements, rappels de départ et de coucher, repos légal | Calendrier ; Rappels et horaires ; réglages du plugin | rien (obligatoire) ; `revenus` en **facultatif** | `agenda` : plages occupées et événements des 60 prochains jours (lecture pour `budget`, `revenus`) |
| **`revenus`** | argent qui entre : missions d'intérim, jours de réserve, net estimé, calibrage sur bulletin, délais de paie | Missions ; Réserve ; Bulletins (calibrage) ; réglages | rien | `revenus` : revenus prévus/confirmés/reçus avec date de paiement estimée ; `travail` : jours et horaires de mission (lu par `agenda`) |
| **`budget`** | argent qui sort et qui reste : coût de vie, réserve, runway, paliers, abonnements, simulateur, prévision et allocation | Tableau de bord ; Coût de vie ; Réserve et paliers ; Abonnements ; Simulateur de déménagement ; Prévision du mois ; réglages | rien ; `revenus` **facultatif** (sinon revenus saisis à la main) | `budget` : réserve, runway, palier atteint (lecture par `agenda` pour afficher une alerte, facultatif) |
| *plus tard* `foyer`, `retux-suivi`, `voiture` | colocation, marge par PC, entretien | — | `budget` facultatif | — |

Pourquoi trois et pas un : l'agenda est utile sans argent (rendez-vous, sommeil), la paie est utile sans budget (comparer deux missions,
c'est l'usage de la semaine du lundi 5 octobre), et le budget doit pouvoir vivre sans connaître l'agenda. Chaque plugin se met à jour seul.
Pourquoi pas cinq dès le départ : plus de plugins, plus de dépendances à tenir à jour pour une personne seule.

Liens facultatifs (jamais bloquants) : `agenda` lit le service `travail` de `revenus` pour afficher missions et réserve ; `budget` lit
`revenus` pour la prévision mensuelle ; `revenus` propose « envoyer à Budget » (`send`) un net reçu. Sans le plugin lié, l'écran
l'indique (« Installez Revenus pour voir vos missions ici ») et une saisie manuelle prend le relais.

**Distribution** (docs/23) : « Budget personnel » = moteur + `agenda`, `revenus`, `budget` livrés d'office ; nom, logo, thème sombre par défaut ;
Android d'abord (les rappels de départ servent sur le téléphone) puis Windows ; données privées (mode local, ou serveur personnel).

## 6. Modèle de données

Règles communes (reprises de l'ancien projet et du projet Retux Panel de Bryan) :

- **Montants en centimes entiers**, jamais de flottant ; saisie « 12,50 » convertie **par analyse du texte** (pas de `parseFloat`).
  Taux en **points de base** (2200 = 22 %). Arrondi : moitié vers le haut, une seule fonction (`divArrondi`), comme dans `lib.rs`.
- **Durées en minutes entières**.
- **Deux sortes de temps** : (a) un **jour civil** `AAAA-MM-JJ` + heure en minutes depuis minuit pour ce qui est « 8 h le 12 octobre »
  (un horaire de travail reste à 8 h même si l'heure d'été change) ; (b) un **instant UTC** (`…Ms` : millisecondes depuis 1970, comme les
  `created`/`modified` des `.etabli`) pour ce qui a eu lieu ou doit sonner (réception d'un virement, rappel). La conversion
  (a) → (b) se fait **à un seul endroit**, avec le fuseau `Europe/Paris` (réglage), au moment de programmer un rappel. Test obligatoire autour
  des changements d'heure (dernier dimanche de mars et d'octobre).
- **Identifiants** : texte aléatoire de 16 octets en hexadécimal (comme les documents). **Numérotation légale : non pertinente** en v1 (pas de
  facture, pas de livre de police) ; si Retux est repris plus tard, la numérotation relève de la distribution ERP.
- **Rien de financier en dur** : cotisations (22 %), IFM (10 %), CP (10 %), seuil de 35 h, tarif de réserve (60 €), indemnité (38 €), paliers
  (1 000/4 000/6 000 €), marges, durée de sommeil : **tous des réglages** avec valeur par défaut, modifiables en deux minutes.
- **On ne recalcule pas le passé** : un net *reçu* (bulletin) est figé avec les taux appliqués ; changer un taux ne modifie pas l'historique.
- Chaque enregistrement porte `id`, `creeLe`, `modifieLe` (instants UTC) ; chaque jeu de données porte `schema` (entier) pour `migrate`.

### 6.1 `agenda`

| Entité | Champs principaux |
| --- | --- |
| `Evenement` | `id`, `type` (`rdv` · `perso` · `retux` · `sommeil`), `titre`, `lieu`, `jour`, `debutMin`, `finMin` (peut dépasser 1 440), `trajetMin`, `margeMin?`, `rappels` (booléen), `repetition?` |
| `Repetition` | `frequence` (`jour` · `semaine` · `mois`), `intervalle`, `jours?` (0 = lundi…), `jusquau?`, `exceptions` (liste de jours) ; développée **à la lecture** sur une fenêtre, jamais stockée |
| `ReglagesAgenda` | marges par type, mise en route, préparation, sommeil cible, endormissement, pré-alerte, rappel de coucher, majoration de trajet (points de base), fuseau, horizon des rappels |
| `Rappel` (calculé, non stocké) | `genre` (`coucher-avant` · `coucher` · `reveil` · `depart-avant` · `depart`), `instantUtc`, `titre`, `texte` |

Les missions et jours de réserve **ne sont pas** des `Evenement` de l'agenda : ils viennent du service `travail` de `revenus` (lecture seule).

### 6.2 `revenus`

| Entité | Champs principaux |
| --- | --- |
| `Mission` | `id`, `agence`, `entreprise`, `lieu`, `debut`, `fin`, `joursSemaine`, `debutMin`, `finMin`, `pauseMin`, `tauxCents`, `tauxSupCents`, `seuilHebdoMin`, `trajetMin`, `statut` (`prevu` · `confirme` · `termine`), `ajustementsSup` (jour → minutes), `exclusions` |
| `PeriodeReserve` | `id`, `lieu`, `jours` (`{jour, horsBase}`), `arriveeMin`, `departMin`, `tarifJourCents`, `indemniteHorsBaseCents`, `statut` (`probable` · `confirme`) |
| `Revenu` | `id`, `source` (`mission` · `reserve` · `autre`), `refId?`, `libelle`, `netEstimeCents`, `statut` (`prevu` · `confirme` · `recu`), `datePaiementEstimee`, `recuLe?` (instant UTC), `netRecuCents?` |
| `Bulletin` | `id`, `revenuId`, `netReelCents`, `ecartCents` (calculé à l'enregistrement et **figé**), `tauxAppliquesBp` (cotisations, IFM, CP au moment du calcul) |
| `ReglagesRevenus` | cotisations intérim et réserve (points de base), seuil hebdomadaire, tarif et indemnité de réserve par défaut, délais de paie (jours) par source, coût du carburant (consommation, prix), usure par kilomètre |

### 6.3 `budget`

| Entité | Champs principaux |
| --- | --- |
| `LigneCout` | `id`, `libelle`, `categorie` (loyer, charges, internet, nourriture, assurance, carburant, téléphone, abonnements, provision-voiture, divers), `nature` (`fixe` · `variable`), `portee` (`perso` · `foyer`), `montantMensuelCents`, `jourDuMois?` |
| `MouvementReserve` | `id`, `quand` (instant UTC), `montantCents` (signé), `motif`, `soldeApresCents` (**figé**) ; l'historique est ajouté, jamais modifié (une correction = un mouvement inverse) |
| `Palier` | `id`, `libelle`, `montantCents`, `ordre` ; défauts 100 000 / 400 000 / 600 000 |
| `Abonnement` | `id`, `libelle`, `montantCents`, `periodicite` (`mois` · `an`), `prochaineEcheance` (jour), `aResilier` |
| `Scenario` | `nom` (`pessimiste` · `realiste` · `optimiste`), `coefCoutBp`, `coefRevenusBp`, `ponderationParStatutBp` (`prevu`, `confirme`, `recu`) |
| `Simulation` | `loyerCents`, `chargesCents`, `date`, `revenuMensuelCents` (non conservée par défaut) |

## 7. Stockage avec les API actuelles du SDK

Ce que le moteur offre aujourd'hui ([06](06-protocole-sdk.md), [08](08-documents-donnees.md)) :

| Outil | Nature | Limites |
| --- | --- | --- |
| `MiniAppDocument` | un **calcul** (fichier `.etabli`) par mini-app ; nouveau à chaque ouverture ; liste « anciens calculs » | 5 Mo ; pensé pour « un calcul = un fichier », pas pour un registre permanent |
| `PluginSettings` | **un JSON par plugin**, partagé par ses mini-apps, enregistré 400 ms après la dernière modification, synchronisé entre mini-apps ouvertes | 5 Mo, 4 Mo par message ; pas de `migrate` (seulement `clean`) |
| Service (`provide`) | publication de données vers les plugins qui en dépendent, conservées par le moteur | JSON, à valider côté lecteur (docs/19 §4) |
| Mode serveur | « tout sur le serveur », données par utilisateur, hors ligne avec file d'écritures | décidé (docs/16 §9) |

**Proposition v1 (sans modifier le moteur)** :

- Les **données vivantes** (événements, missions, lignes de coût, mouvements) vont dans `PluginSettings` de chaque plugin, sous la forme
  `{ schema, … }` : c'est le seul stockage permanent partagé entre les mini-apps d'un plugin (le Calendrier et la liste de missions
  éditent les mêmes données). La migration est faite à la main dans le plugin (champ `schema`).
- Les **réglages** (taux, marges) vivent dans le même objet, sous une clé `reglages`.
- Les **analyses figées** (simulation de déménagement, prévision d'un mois) sont des `MiniAppDocument` : on les garde, on les rouvre.
- Les services (`travail`, `revenus`, `agenda`, `budget`) publient des **extraits** (fenêtre de 60 jours, totaux), jamais tout.
- **Volume** : 300 octets par événement ou mouvement ≈ 16 000 enregistrements dans 5 Mo, soit des années d'usage d'une personne. Au-delà de 3 Mo,
  « clôturer l'année » déplace l'année écoulée vers un document archivé (fonction à écrire dans le plugin).

Limites de cette voie (à lever par le moteur si Bryan les juge gênantes, section 8) : tout est réécrit à chaque modification (acceptable à cette
échelle) ; pas d'index ni de requête ; pas de sauvegarde ni d'export intégrés ; un plugin qui ne s'ouvre pas ne publie rien (les services
sont relayés tels que la dernière ouverture les a laissés).

## 8. Ce qui manque au moteur et au SDK

Classé par importance pour ces plugins. « Permission » = entrée à ajouter à `permissions.ts` (docs/19 §6, règle : une nouvelle permission est un changement d'API décidé par écrit).

| # | Manque | Pourquoi ici | Proposition |
| --- | --- | --- | --- |
| 8.1 | **Rappels / alarmes** (permission `notifications`, prévue docs/16 §7, étape E7) | c'est la raison d'être de l'agenda : « pars maintenant », « va te coucher », réveil | Messages `reminders.set(liste)` (**remplace** l'ensemble des rappels du plugin) et `reminders.clear()`, plutôt que `schedule/cancel` un par un : un changement de planning ne laisse aucun rappel orphelin. Chaque rappel : `{ id, at (instant UTC), titre, texte, niveau ('notification' · 'alarme'), ouvre?: appId }`. Exécution **par l'hôte** (Capacitor sur Android : alarme exacte, essai réussi le 4 octobre ; Rust/zone de notification sur Windows ; web : notification si l'onglet vit, sinon rien — à dire clairement). Le moteur **garde la liste sur disque** et la programme au démarrage et au redémarrage du téléphone : le cadre isolé n'existe pas quand l'alarme sonne. Plafonds : 200 rappels, horizon 60 jours (Android limite les alarmes d'une application). Permission demandée à l'installation et rappel dans les Paramètres si l'utilisateur a refusé l'alarme exacte |
| 8.2 | **Remise à jour des rappels sans ouvrir la mini-app** | si Bryan n'ouvre pas l'agenda pendant 60 jours, plus aucun rappel ne sonne ; les rappels d'un événement récurrent ont besoin d'être calculés d'avance | v1 : horizon de 60 jours renouvelé à chaque ouverture + avertissement « rappels programmés jusqu'au … ». Mieux : un point d'entrée facultatif `background` du manifeste, chargé en cadre invisible au démarrage de l'application pour recalculer les rappels (décision de conception, Q7) |
| 8.3 | **Import de fichier** (permission `import`) | restaurer une sauvegarde, importer un relevé bancaire CSV (cahier §10), importer un `.ics` | Message `openFile({ extensions, maxBytes })` : boîte « Ouvrir » exécutée par l'hôte, renvoie le **texte** ; mêmes extensions de données que `saveFile` (`csv tsv json txt ics`), 5 Mo maximum. Le plugin ne connaît jamais le chemin |
| 8.4 | **Extension `ics` pour `saveFile`** | export agenda vers Calendrier (iPhone) et Agenda (Android), filet de sécurité des alarmes | ajouter `ics` à la liste blanche (`csv tsv dxf json txt svg md xml`, docs/19 scénario 6) côté interface et côté Rust ; un `.ics` est du texte inerte |
| 8.5 | **Graphiques** | runway au fil des mois, progression vers 6 000 €, répartition des dépenses | Pas de composant dans `@etabli/ui` aujourd'hui (les plugins dessinent leur SVG à la main). Proposé : `Sparkline`/`LineChart`/`BarChart` en SVG pur, sans bibliothèque (pas de réseau, CSP, poids), couleurs des jetons de thème, valeurs en entiers. Mutualisable avec les autres plugins et l'ERP. Alternative : SVG privé du plugin (Q8) |
| 8.6 | **Argent et dates partagés** | trois plugins + l'ERP auront besoin des mêmes outils : saisie « 12,50 » → centimes, affichage « 1 234,50 € », jours civils, lundi de la semaine, plages, développement d'une répétition, conversion jour+minutes → instant UTC en `Europe/Paris` | Un module sans interface de `@etabli/ui` (à côté de `calc.ts`) : `money.ts` (`parseEuros`, `formatEuros`, `divArrondi`, points de base) et `civil.ts` (dates et fuseau). **C'est la vraie « mutualisation »** : les règles d'arrondi et de dates écrites une fois, testées une fois |
| 8.7 | **Stockage de plugin plus riche** (facultatif) | export / import / sauvegarde, migration versionnée, plusieurs fichiers par année | `PluginSettings` avec `migrate(saved)` (comme `MiniAppDocument`) ; export/import JSON de l'ensemble des données d'un plugin (par 8.3/8.4). Le reste (collections, requêtes) n'est pas nécessaire ici |
| 8.8 | **Réseau** (permission `reseau`, docs/16 §7) | itinéraire et géocodage (cahier §4.6) | **Pas en v1** : trajet saisi en minutes (comme l'ancien code) avec majoration en points de base. À rouvrir quand `reseau` existe |
| 8.9 | **Flux de calendrier pour iPhone** | alarmes fiables sur iPhone (cahier R8) | hors plugin : une route du serveur d'Établi qui sert un `.ics` par utilisateur. Non proposé en v1 (Q9) |
| 8.10 | Détails à vérifier par un essai, pas par lecture | `crypto.randomUUID()` dans un cadre `sandbox` à origine opaque ; `Intl.DateTimeFormat` avec `Europe/Paris` ; pas de `localStorage` (inutile ici) | un plugin d'essai jetable, comme `essai-isolation` |

Ce que le contrat actuel **permet déjà** et que ces plugins utilisent : réglages de plugin, documents, services et dépendances facultatives,
`send` (envoyer un net reçu vers Budget), `saveFile` (CSV, JSON), `print` (fiche imprimée : bilan du mois), `openSettings`, thèmes, dimensions.

## 9. Réemploi du cœur Rust : WebAssembly ou TypeScript ?

### 9.1 Ce que le contrat actuel autorise (relevé dans le code, non essayé)

| Point | Constat |
| --- | --- |
| Exécution de WebAssembly dans le cadre | **autorisée** : la politique CSP des pages de plugins contient `script-src … 'wasm-unsafe-eval'` (bureau : `apps/desktop/src-tauri/src/plugins.rs`, serveur : `crates/serveur/src/routes_plugins.rs`) |
| Service du fichier `.wasm` | **prévu** : type MIME `application/wasm` connu du protocole `plugins://`, du serveur et de `etabli-noyau::paquet::type_mime` |
| Chargement habituel de `wasm-bindgen` (`fetch` du `.wasm`) | **bloqué** : `connect-src 'none'` interdit `fetch`, y compris vers ses propres fichiers. Il faudrait **intégrer les octets dans le JavaScript** (base64, `initSync`, comme le faisait déjà `initialiserDepuisOctets` pour les tests) : +33 % de taille, soit ~260 Ko pour ce module |
| Précédent dans le dépôt | **aucun** plugin n'utilise WebAssembly aujourd'hui ; ni `npm run valider`, ni `build:plugins` ni la CI ne le connaissent |
| Sécurité | WebAssembly ne donne aucun pouvoir de plus que JavaScript dans le cadre (pas d'accès réseau ni disque) ; reste le risque habituel de boucle infinie (docs/19 #15) |
| Hôtes | à vérifier sur chacun : bureau (WebView2), Android (Capacitor, WebView), web statique et PWA iPhone ; la politique CSP des plugins servis par un hébergement statique n'est pas sous le contrôle du moteur |

### 9.2 Comparaison

| Critère | Rust + WASM dans le plugin | Réécriture TypeScript (avec vecteurs d'or) |
| --- | --- | --- |
| Effort initial | porter le pont, intégrer le binaire, étendre `build:plugins` et `valider`, essayer sur 4 hôtes : plusieurs jours, avec risque d'hôte | ~450 lignes de calcul à traduire (une journée), plus les tests |
| Outils de construction | `rustup`, cible `wasm32`, `wasm-bindgen-cli` à version épinglée dans la chaîne de **chaque** plugin et de la CI de catalogue | aucun nouveau : même chaîne que les 7 plugins |
| Mise à jour séparée des plugins | le `.wasm` rend chaque paquet plus lourd et lie le plugin à une version du cœur | un plugin = un paquet de JavaScript |
| Mutualisation réelle | le cœur ne sert qu'à ces trois plugins ; il n'est pas lisible par les auteurs de plugins du catalogue (tous en TypeScript) | les outils (`money`, `civil`, vecteurs d'or) deviennent des modules du kit `@etabli/ui`, utilisables par l'ERP et tout auteur |
| Exactitude des nombres | `i64` | `number` : entiers sûrs jusqu'à 9 × 10¹⁵ ; les montants (centimes) et durées restent très en dessous ; `Math.floor` sur entiers, **jamais** `/` flottant sans arrondi explicite ; `BigInt` inutile |
| Tests | `cargo test` existants, mais il faut aussi tester le pont dans le navigateur | les 18 cas Rust deviennent des fichiers JSON (« vecteurs d'or ») rejoués par Vitest ; le Rust, tant qu'il reste dans l'ancien dépôt, peut les régénérer et **vérifier la parité** une fois |
| Réemploi côté serveur (validation par `etabli-serveur`) | oui, natif | non (mais personne ne le demande : le serveur ne valide pas des calculs de paie) |
| Débogage et lecture par un contributeur | binaire opaque dans le paquet | source lisible, mêmes outils que le reste |
| Risque de blocage plateforme | CSP / chargement différent selon l'hôte, non essayé | nul |

### 9.3 Recommandation : **réécriture en TypeScript, avec des vecteurs d'or tirés du Rust**

Argumentaire : (1) le cœur est petit et pur (pas de dépendance, pas de temps réel, pas d'entrée-sortie) : le coût de réécriture est faible ;
(2) WebAssembly est *possible* mais rien n'est prouvé (CSP `connect-src 'none'`, chaîne de build inexistante, 4 hôtes à essayer) pour un gain
nul (on n'a pas de calcul lourd : quelques additions par jour affiché) ; (3) le but de Bryan — **mutualiser** — est mieux servi par des
modules `@etabli/ui` écrits une fois pour trois plugins et l'ERP que par un binaire que seuls ces plugins savent appeler ; (4) un seul langage
dans tous les plugins garde le catalogue maintenable par une personne seule.

Garde-fous : les 18 tests Rust sont convertis en **fichiers de vecteurs** `entree.json` → `sortie.json` (générés par un petit programme Rust
exécuté une fois, puis versionnés dans les plugins) et rejoués par Vitest ; on ajoute des cas aux limites (changement d'heure, semaine à
cheval sur deux mois, arrondis aux demi-centimes, entrées négatives). Si, plus tard, un calcul devient vraiment lourd (simulation sur des
années, optimisation de planning), WebAssembly se rouvre comme **décision séparée**, après un essai jetable des quatre hôtes.

## 10. Écrans (par plugin)

Interface Établi (colonne de plugins, onglets, Accueil, thèmes) ; chaque écran = une mini-app, `@etabli/ui` ; sur mobile, la barre basse du moteur.

**`agenda`**
- *Calendrier* : mois / semaine / jour ; pastilles de couleur par type ; panneau du jour avec la **chronologie à rebours** (coucher, réveil,
  départ, arrivée) et l'état des rappels (programmés / non autorisés) ; ajout d'un événement avec répétition ; alertes de repos
  (« 8 h de repos seulement entre deux journées ») ; bouton « Exporter .ics ».
- *Rappels et horaires* : réglages (marges, préparation, sommeil, majoration de trajet, pré-alerte, rappel de coucher), aperçu sur un
  exemple (« début à 8 h → pars à 7 h 10 »), test d'un rappel dans 1 minute.
- Réglages du plugin (fuseau, horizon).

**`revenus`**
- *Missions* : liste ; fiche (agence, lieu, jours, horaires, taux, statut) ; **net estimé en direct** (brut de base, IFM, CP, net) ; comparaison
  de deux missions (« gain net après carburant et usure », cahier §5.4).
- *Réserve* : jours (en lot ou un par un), hors base, compteur annuel (objectif ~50 jours), net, conflit avec une mission (net perdu / gagné).
- *Bulletins* : saisie du net réel, écart, proposition d'ajuster le taux de cotisations ; statut prévu → confirmé → reçu.
- Réglages.

**`budget`**
- *Tableau de bord* : réserve, **runway** (mois tenables, dans les trois scénarios, le pessimiste en premier), prochain palier et date estimée, alerte
  d'abonnement, message du mois.
- *Coût de vie* : lignes fixes/variables ; total mensuel par scénario.
- *Réserve et paliers* : mouvements avec motif, courbe de la réserve (graphique), paliers 1 000 / 4 000 / 6 000 €, épargne **acquise** vs **reçue**.
- *Abonnements* : coût mensuel et annuel, échéances, « à résilier ».
- *Simulateur de déménagement* : loyer, charges, date → runway et épargne mensuelle après.
- *Prévision du mois* : reste à vivre pessimiste, allocation proposée (« Ce mois : 150 € PEA possibles » / « Mois tendu : aucun investissement »).

## 11. Calculs (spécification)

Tous en entiers ; `arr(n, d) = floor((2n + d) / 2d)` (moitié vers le haut, d > 0) ; `bp` = points de base.

**Intérim** (reprise de `paie.rs`, par semaine lundi → dimanche) :
`normales = min(planifié, seuil)` ; `sup = max(planifié − seuil, 0) + sup_manuel` ;
`brut_base = arr(normales × taux, 60) + arr(sup × taux_sup, 60)` ; `ifm = arr(brut_base, 10)` ; `cp = arr(brut_base + ifm, 10)` ;
`brut_total = brut_base + ifm + cp` ; `net = arr(brut_total × (10 000 − cotisations_bp), 10 000)`.
Journée de nuit : `fin ≤ début` ajoute 24 h ; la pause est déduite. Cas de référence (vecteur d'or) : 5 × 7 h à 13 € → net 429,43 €.

**Réserve** : `net = arr(jours × tarif × (10 000 − cotis_bp), 10 000) + hors_base × indemnité`.

**Gain net d'une mission** (nouveau) : `net − carburant − usure`, avec carburant = km × consommation × prix et usure = km × réglage en centimes par kilomètre ; les unités
de la consommation et du prix (entiers) sont à fixer avec Bryan avant d'écrire du code (Q4).

**Horaires** (reprise de `horaires.rs`) : `trajet = ⌈trajet_base × (10 000 + majoration_bp) / 10 000⌉` ; `arrivée = début − marge` ;
`départ = arrivée − trajet` ; `décision = départ − mise_en_route` ; `réveil = décision − préparation` ;
`coucher = réveil − sommeil − endormissement` ; rappels : `décision − pré_alerte` et `coucher − rappel_coucher`. Valeurs négatives = la veille.
Origine du trajet : lieu de l'événement précédent (cahier §4.6) — saisie manuelle en v1.

**Repos** (reprise de `repos.rs`) : 11 h entre plages, 10 h par plage, 48 h sur 7 jours glissants ; les plages viennent de l'agenda (événements
`retux`, `rdv` marqués « travail ») **et** du service `travail` si `revenus` est installé.

**Runway** : `runway_dixiemes = floor(réserve × 10 / coût_mensuel_scénario)` (dixièmes de mois, affichés « 3,4 mois »), `coût_mensuel_scénario = arr(coût × coefCoût_bp, 10 000)`. Réserve nulle ou coût nul : cas explicites, jamais de division par zéro.

**Paliers** : date estimée = premier mois où `réserve + Σ épargne_mensuelle_pessimiste ≥ palier`, en simulant mois par mois avec les revenus
**pondérés par statut** (`prévu` à 50 % par défaut, `confirmé` 100 %, `reçu` déjà dans la réserve) et décalés par le délai de paie. Épargne *acquise*
(gagnée) et *reçue* affichées séparément (cahier R4).

**Prévision / allocation** : `reste_à_vivre = revenus pondérés − charges fixes − nourriture − carburant − provisions`. L'allocation (sécurité, PEA, Retux)
n'est proposée **que si** le matelas cible est atteint à la fin du mois dans le scénario pessimiste ; sinon message « mois tendu ». C'est un calcul,
pas un conseil financier.

**Principe directeur** conservé : *l'application ne donne jamais un chiffre qui flatte* — le scénario pessimiste est affiché en premier et sert aux décisions.

## 12. Étapes proposées, risques, questions

### 12.1 Étapes (chacune utilisable seule ; le moteur ne bouge qu'aux étapes marquées « moteur »)

| # | Étape | Sortie | Test |
| --- | --- | --- | --- |
| 0 | Validation de cette spec par Bryan ; réponses aux questions ; confirmation des montants de solde et de cotisations (rendez-vous d'agence du lundi 5 octobre, cahier §14) | spec figée | — |
| 1 | **Outils communs** (moteur) : `money.ts`, `civil.ts` dans `@etabli/ui`, avec vecteurs d'or (conversion des 18 tests Rust) | modules testés | Vitest |
| 2 | Plugin **`revenus`** (missions, réserve, net, bulletins) : c'est le besoin immédiat (intérim et formation de réserve en octobre) | plugin publiable au catalogue | vecteurs d'or + essai par Bryan sur une vraie mission |
| 3 | Plugin **`agenda`** sans rappels (calendrier, événements, chronologie, repos, export `.ics` ; extension `ics`, 8.4) | plugin | idem |
| 4 | **Rappels** (moteur) : permission `notifications`, hôte Android (Capacitor) puis Windows ; branchement dans `agenda` | rappels réels | essai sur le téléphone de Bryan (fait pour la couche native) |
| 5 | Plugin **`budget`** : coût de vie, réserve, runway, paliers, abonnements, puis simulateur, prévision | plugin | vecteurs d'or, essai |
| 6 | Graphiques `@etabli/ui` (8.5) ; import de fichier (8.3) ; import CSV bancaire | confort | Vitest, essai |
| 7 | **Distribution « Budget personnel »** (docs/23) : nom, logo, plugins livrés d'office | application installable à côté d'Établi | installation côte à côte |
| 8 | Plus tard : `foyer`, `retux-suivi`, `voiture`, itinéraire (`reseau`) | — | — |

L'ordre 2 → 3 → 4 → 5 suit l'urgence réelle (étape 1 de l'ancien plan : intérim et réserve avant le budget). Si Bryan préfère le budget d'abord
(le matelas de 6 000 € est le but de vie), les étapes 2 et 5 s'échangent sans autre changement.

### 12.2 Risques

| Risque | Gravité | Parade |
| --- | --- | --- |
| **Net estimé faux** (22 % forfaitaire, indemnité de réserve non confirmée) | haute | taux visibles et modifiables, calibrage sur bulletin, message « estimation » partout, premiers chiffres comparés à un vrai bulletin avant tout usage de décision |
| **Rappel qui ne sonne pas** (économiseur de batterie, alarmes exactes refusées, application non rouverte) | haute | permission demandée au premier lancement, indicateur « rappels programmés jusqu'au … », horizon renouvelé, filet `.ics`, essai sur d'autres téléphones (le test du 4 octobre ne couvre ni redémarrage ni autre marque) |
| **Données financières privées sur un serveur partagé** | moyenne | mode local par défaut de la distribution ; en mode serveur, données par utilisateur, administrateur qui pourrait techniquement les lire (limite assumée dans l'ancien cahier §3) |
| **Perte de données** (un seul fichier JSON par plugin) | moyenne | écriture atomique du moteur, export JSON (8.3/8.4), corbeille pour les documents, sauvegarde du serveur |
| **Dérive du fuseau / heure d'été** | moyenne | une seule fonction de conversion, tests aux deux changements d'heure |
| **Portée trop large** (le cahier initial est un ERP personnel complet) | haute | trois plugins seulement, étapes utilisables seules, `foyer`/`retux`/`voiture` écartés tant que 2 à 5 ne sont pas utilisés en vrai (règle « un chantier à la fois ») |
| Dépendance au moteur (permissions `notifications`, hôte mobile, distributions) pas encore livrés | moyenne | les étapes 1 à 3 et 5 n'en dépendent pas |
| Écart entre chiffre affiché et logique en double (leçon de `Agenda.svelte`) | faible | tout calcul d'argent passe par les modules testés, jamais en ligne dans un écran |

### 12.3 Questions ouvertes pour Bryan

1. **Découpage** : trois plugins (`agenda`, `revenus`, `budget`) vous conviennent-ils, ou préférez-vous un seul plugin « Budget & planning » (moins de liens, mais une mise à jour pour tout) ? Les noms (« Agenda », « Revenus », « Budget ») sont-ils les bons ?
2. **Ordre** : commencer par `revenus` (urgence : intérim, réserve) puis `agenda`, ou par `budget` (le matelas de 6 000 €) ?
3. **Cœur Rust** : acceptez-vous la recommandation « réécriture TypeScript avec vecteurs d'or » (section 9.3), le dépôt `gestion-budget-perso` restant comme archive de référence ?
4. **Paie** : les montants de la solde (60 € imposable, 38 € non imposable hors base), le taux de cotisations (22 %), l'indemnité de fin de mission (10 %) et les congés payés (10 %) sont-ils confirmés par votre contrat ou votre premier bulletin ? Heures supplémentaires : au-delà de 35 h par semaine, taux propre à la mission, comme dans le code ? Voulez-vous le « gain net après carburant » dès la v1 (consommation et prix du carburant à saisir) ?
5. **Fuseau et dates** : « jour civil + heure en minutes » pour les horaires et instants UTC pour ce qui sonne ou a eu lieu (section 6) — d'accord ? Le fuseau est-il toujours `Europe/Paris` (déménagement, voyages) ?
6. **Rappels** : quels rappels sont des **alarmes** (réveil, coucher, départ) et lesquels de simples **notifications** (échéance d'abonnement, palier atteint) ? Combien de jours d'avance acceptez-vous (60 proposés) ? Sur PC, des rappels sont-ils utiles ou seulement sur le téléphone ?
7. **Rappels sans ouvrir l'application** : acceptez-vous de rouvrir l'agenda au moins tous les 60 jours (solution simple), ou voulez-vous le point d'entrée `background` du moteur (plus de travail, section 8.2) ?
8. **Graphiques** : un composant de graphique dans `@etabli/ui` (mutualisé, section 8.5) ou un SVG privé dans le plugin `budget` ?
9. **iPhone du colocataire** : un flux `.ics` par utilisateur servi par le serveur est-il voulu, ou l'export manuel suffit-il en v1 ? Le foyer à deux est-il pour une v2 lointaine ?
10. **Stockage** : la voie « un JSON par plugin » (section 7) suffit-elle, ou voulez-vous que le moteur offre d'abord un vrai stockage de plugin (collections, export, sauvegarde) ?
11. **Distribution** : nom définitif du produit (« Budget personnel » est un nom de travail), plateforme d'abord (Android seul, ou Windows aussi), mode par défaut (local seul, ou serveur personnel), thème sombre par défaut ; le produit s'installe-t-il à côté d'Établi (identifiants distincts, docs/23 Q4) ?
12. **Retux et ERP** : le suivi Retux (marge par PC, réserve URSSAF) du cahier est-il un plugin de cette distribution, ou relève-t-il de l'ERP de l'entreprise (même moteur, autre distribution) ? Les données de Retux Panel peuvent-elles être lues comme vocabulaire (indiquez les fichiers) ?
13. **Confidentialité** : les plugins livrés d'office restent-ils publics (code ouvert, Apache-2.0 comme le moteur) ou privés (registre privé, docs/23 §5.6) ? Des chiffres personnels ne seront pas dans le code, mais vos hypothèses de paie y seraient.
14. **Périmètre exclu** : confirmez-vous l'exclusion de la connexion bancaire, des courses avec prix réels, du conseil sur les supports d'investissement et de l'optimisation de journée par IA ?
