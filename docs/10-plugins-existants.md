# 10 — Plugins existants

| Plugin | Version | Mini-apps | Tests |
| --- | --- | --- | --- |
| `maths` Maths et géométrie | 1.0.0 | 7 | 31 |
| `economie` Économie de matière | 0.3.0 | 2 | 60 |
| `tolerie` Tôlerie | 1.0.0 | 2 | 11 |
| `tracage` Traçage (ex-« Chaudronnerie ») | 1.1.0 | 5 | 32 |
| `materiaux` Matériaux et fixation | 1.0.0 | 4 | 21 |
| `finances` Finances (hors catalogue officiel) | 0.1.0 | 1 + service `finances@1` | 46 |

Le kit `@etabli/ui` a 201 tests (calculs saisis, format, collage Excel, DXF, `money`, `civil`, géométrie des graphiques).

---

## Maths et géométrie (`plugins/maths`)

| Mini-app (`apps/`) | Calcul (`src/`) | Contenu |
| --- | --- | --- |
| `pythagore` | dans le composant | deux côtés d'un triangle rectangle → le troisième, angles, schéma |
| `triangle` | `geometry.ts` `solveTriangle` | 3 valeurs dont un côté ; cas ambigu à 2 solutions |
| `arc` | `geometry.ts` `solveArc` | 2 valeurs parmi corde, flèche, rayon, angle, longueur d'arc (dichotomie pour les cas implicites) |
| `percage` | `formes.ts` `boltCircle` | n trous sur cercle ou arc, départ, sens, centre décalé ; tableau X/Y copiable |
| `polygone` | `formes.ts` `solvePolygon` | une dimension (côté, sur plats, sur angles, aire) ; angles, coupe d'onglet 180°/n |
| `volumes` | `volumes.ts` `volume`, `gaugeTable` | cylindre debout ou couché (segment de disque), bac, tronc de cône, trémie (prismatoïde), sphère ; remplissage, surfaces de tôle, barème |
| `conversions` | `geometry.ts` | deux tableaux : longueurs (mm, cm, m, pouces, fraction au 1/64, pieds) et pentes (degrés, %, mm/m, 1:n, radians) ; on tape dans n'importe quelle ligne, les autres se remplissent |

`Pythagore.svelte` utilise encore `connect()` directement (première mini-app écrite) ; les autres
utilisent `MiniAppDocument`.

---

## Fournisseurs et Machines (`plugins/fournisseurs`, `plugins/machines`)

Deux plugins **sans mini-app** : chacun ajoute une page de réglages (Paramètres → Fournisseurs,
Machines) et publie ses données (services `fournisseurs` et `machines`, contrats `@1`). Fichiers :
`reglages/index.html` + `Fournisseurs.svelte` ou `Machines.svelte`, logique et tests dans `src/`
(`fournisseurs.ts`, `machines.ts` : valeurs par défaut, nettoyage d'un fichier abîmé, saisie des
nombres). Détails et contrats : [09](09-bibliotheques-fiches-envoi.md).

## Économie de matière (`plugins/economie`)

Dépendances **facultatives** sur `fournisseurs` et `machines` (`^1`) : le catalogue propose de les
installer avec Économie ; elle marche sans (saisie à la main).

### Débit de tubes (`apps/debit-tubes/DebitTubes.svelte`)

But : le moins de barres possible, puis les chutes les plus longues. Saisie : profilé, matière
(kg/m), **une seule liste des tubes disponibles** (barres entières et chutes : longueur, quantité,
**tolérance −/+** ; sans quantité = longueur à acheter ; longueur d'un fournisseur), scie
(plugin Machines) ou réglages à la main, pièces (repère, longueur **pointe à pointe**,
quantité, angles, **chute réservée** avec sa destination). Bryan a demandé de supprimer le champ
séparé « chutes déjà en stock » : les anciens calculs y versent leurs chutes (`migrate`).

Débit v2 (fait) :
- **Tolérance** : calcul sur la barre la plus courte (longueur − tol−), reste affiché en plage
  (« 2 479 à 2 509 »).
- **Poids** : barres, pièces, chutes, perte (section du profilé × masse volumique).
- **Mode besoin** : sans barre saisie, longueur du fournisseur (ou 6 000) et « Barres à acheter ».
- **Chutes réservées** : si les garder coûte une barre de plus, les deux résultats sont proposés.
- **Priorité matière ou temps** : « temps » débite chaque famille d'angles sur ses propres barres
  (moins de changements d'angle de scie) ; si les deux plans diffèrent, les deux sont comparés
  (barres, réglages de scie, coupes) et l'utilisateur choisit.
- **Ordre de coupe groupé par angle de scie** (`ordre.ts`) et fiche fidèle à la maquette.
- Longueur mini de la scie : signalée ; butée maxi (`stopMax`) : étiquette « butée » sur la fiche.

| Fichier | Rôle |
| --- | --- |
| `src/profil.ts` | types de profilés (tubes carré/rect/rond, pleins, plat, cornière, IPE/HEA, UPN), dimensions saisies, section (contour + trous en (y, z)), aire, conversion des anciens profilés texte |
| `src/coupe.ts` | géométrie des coupes d'angle : chaque bout est un **recul linéaire** `e(y,z) = c + a·y + b·z` depuis la pointe ; 4 poses (normale, retournée, bout pour bout ×2) ; `gap` = écart entre deux pointes voisines (négatif quand les coupes s'emboîtent, trait de scie compté le long de la barre) ; `arrange` = ordre et pose qui minimisent la longueur (glouton avec essai de chaque pièce de départ) |
| `src/debit.ts` | `planCuts` : pour chaque barre, **sac à dos exact au mm** (programmation dynamique) avec un trait complet par pièce (toujours faisable), puis rangement avec `arrange` et **ajout de pièces dans la place gagnée** ; chutes passées à part d'abord (sans dressage, plus utilisé par l'interface), puis les **tubes du stock** (lignes avec quantité), enfin les **barres à acheter** (sans quantité), chaque fois la longueur la mieux remplie ; `BarPlan.purchase` dit si la barre est à acheter ; relances avec mélange reproductible pendant 250 ms (`budgetMs`), meilleur plan gardé. `StockBar` : `tolMinus`/`tolPlus` ; `BarPlan` : `length` (de calcul), `nominal`, `grow` (plage du reste). `priority: "temps"` : une planification par famille d'angles (clé = paire d'angles triée), stock et chutes consommés dans l'ordre ; `groupBars` |
| `src/ordre.ts` | `barOps` : opérations de scie d'une barre (dressage, coupe de bout, recoupe, pièce ; angle, retourner, coupe commune) ; `sawOrder` : ordre qui enchaîne le plus de coupes au même angle (glouton, à égalité le plus petit angle) |
| `src/pieces.ts` | `nextMark` (A, B… AA), `rowsFromPaste` (Excel), `num`, `quantity` |
| `src/piece3d.ts` | scène three.js (`Viewer3D`), géométrie d'une pièce (`buildGeometry`), rendu **à la demande** |
| `src/Piece3D.svelte` | mini écran 3D de la pièce sélectionnée (vues 3D/dessus/côté, pièce raccourcie au milieu si très longue, étiquettes d'angle) |
| `src/plan3d.ts`, `src/Plan3D.svelte` | plan de débit en 3D : barres empilées, pièces écartées et raccourcies au milieu, bouts exacts |
| `src/fiche-debit.ts` | fiche de coupe imprimée : récapitulatif (barres à acheter, chutes gardées, perte en plage, poids), pièces avec destination des chutes réservées, réglages (tolérances, priorité), **ordre conseillé** par angle de scie, puis barre par barre (N°, repère, angle de scie, cote à mesurer, « butée », retourner, coupe commune, reste en plage) |

Le résultat s'affiche en 2D (formes réelles des coupes) ou en 3D (sélecteur). Données : format 2
(`migrate` convertit le profilé texte, ajoute les angles et les tolérances des barres).

### Calepinage de tôles à la cisaille (`apps/calepinage-rect/Calepinage.svelte`)

L'identifiant `calepinage-rect` est celui de l'ancien calepinage de rectangles, gardé pour ne pas
perdre les calculs. Saisie : matière, épaisseur, formats de tôle (quantité, tolérance), chutes du
stock, cisaille, taille mini des chutes gardées, pièces (sens imposé ou libre).

| Fichier | Rôle |
| --- | --- |
| `src/cisaille.ts` | `planPlates` : découpe guillotine en **bandes** (1er passage), **colonnes** (2e), pièces empilées de même longueur (3e) ; pas de trait de coupe, dressage du premier bord ; axe des bandes choisi pour que la coupe tienne dans la lame ; trois stratégies de largeur de bande essayées ; calcul sur la plus petite tôle (tolérance), restes en plage ; chutes gardées au-delà d'une taille mini ; **ordre de coupe groupé par réglage de butée** (du plus grand au plus petit, en respectant les dépendances) ; cotes hors butée et coupes trop longues signalées ; `groupPlates` |
| `src/matiere.ts` | matières (masse volumique, facteur de capacité de cisaille), `plateWeight` |
| `src/fiche-calepinage.ts` | fiche de calepinage : récapitulatif et poids, une tôle par page avec schéma coté, coupes numérotées, tableau N° / butée / couper / donne / reste |

Le calepinage **accepte** `piece-plate` (flan envoyé par la Tôlerie). Sur l'exemple de la maquette
validée (armoire, tôle 2 500 × 1 250), le calcul retrouve exactement la fiche : 4 bandes, 17 coupes.

---

## Tôlerie (`plugins/tolerie`)

| Mini-app | Contenu |
| --- | --- |
| `developpe` | profils types (L, U, Z, chapeau) ou ailes et plis libres ; cotes extérieures ou intérieures ; facteur K proposé (DIN 6935 : K = (0,65 + 0,5·log(Ri/e))/2, entre 0,3 et 0,5) ou déduction de pli saisie ; parties droites, longueur des plis, **lignes de pli cotées** depuis le bord gauche, profil plié et flan dessinés, masse ; alertes rayon mini et aile trop courte ; « Envoyer au calepinage » |
| `ve` | vé conseillé (8·e jusqu'à 8 mm, 10·e jusqu'à 20, 12·e au-delà, arrondi au vé courant), effort F = 1,33·Rm·e²·L/V (kN, t, t/m), rayon obtenu ≈ V/6, aile mini ≈ 0,7·V, taux de la presse |

`src/pliage.ts` (calculs), `src/data/matieres.json` (12 nuances : masse volumique, Rm, Re, rayon mini
en multiple de e ; valeurs indicatives avec les normes citées).

Cas de test du cahier : équerre 50 × 50, e 2, Ri 2, K 0,44 → développé 96,52 mm ; S235, e 3,
L 1 000, V 24 → 199,5 kN (20,3 t).

---

## Traçage (`plugins/tracage`)

Développés de chaudronnerie « façon Logitrace » (l'ancien plugin prévu « Chaudronnerie », renommé).
Tout est calculé sur la **fibre moyenne**. **Chaque cote** a son choix Int / Moy / Ext
(`src/CoteField.svelte`, cote moyenne affichée dessous) : Ø de virole et de coude, grand et petit Ø
du cône, Ø du tube principal (avec son épaisseur) et du piquage, longueur, largeur et Ø de la trémie.
Chaque mini-app a un **aperçu Flan / 3D** (`src/Apercu.svelte`, choix gardé dans les réglages du
plugin), un **tableau de traçage** repliable et copiable (`src/TraceTable.svelte`), et propose
**Exporter en DXF** et **Imprimer le gabarit** (fiche + gabarit à l'échelle 1 en feuilles A4, voir
[09](09-bibliotheques-fiches-envoi.md)).

Aperçu 3D : `src/modele3d.ts` décrit chaque pièce sans three.js (surfaces réglées en anneaux de
génératrices, `shell` pour l'épaisseur, lignes de génératrices, soudure et raccords, étiquettes :
numéros du tableau en quinconce, 12 au plus, coins de la trémie) ; `src/viewer3d.ts` (three.js, chargé
à part, rendu à la demande) ; `src/Vue3D.svelte` (vues 3D / face / dessus, étiquettes masquées
derrière la pièce). Le tube principal du piquage est dessiné en gris, les segments du coude en deux
teintes, la soudure en rouge.

| Mini-app | Calcul (`src/`) | Contenu |
| --- | --- | --- |
| `virole` | `developpes.ts` `virole` | L = π × Dm, bout coupé en biais (hauteur mini et maxi), découpe en plusieurs tôles si le développé dépasse la tôle disponible, masse |
| `cone` | `developpes.ts` `cone` | tronçon de cône droit par hauteur, génératrice ou demi-angle ; ρ = R / sin α, θ = 360° × sin α ; secteurs ; corde et flèche (traçage sans compas géant) |
| `piquage` | `developpes.ts` `piquage` | cylindre sur cylindre, droit, incliné ou excentré ; courbe t(φ) = (√(R² − (e + r cos φ)²) − r sin φ cos β) / sin β, contact du **Ø intérieur** du piquage sur l'**extérieur** du tube principal, développé sur la fibre moyenne ; gabarit du trou (DXF séparé) |
| `coude` | `developpes.ts` `coude` | coude à segments : β = A / (2 × joints), y(φ) = (Rc + r cos φ) × tan β ; extrados, intrados, segments entiers et demi-segments, longueur de tube en coupant les segments à la suite |
| `tremie` | `tremie.ts` `tremie` | trémie carré-rond (rectangle en bas, cercle en haut, décalages) par **triangulation** : vraies grandeurs, dépliage des triangles un à un (`place`, loi des cosinus), soudure au milieu d'un côté |

`src/export.ts` : matières et masse de tôle, `patternDxf`, `patternShapes` (vers `gabaritPages`),
`tableText`, `tracageFiche`. Cas de test du cahier : virole Ø int 500, e 5 → 1 586,5 ; cône Ø 400/200,
H 300 → ρ 632,46, θ 113,84° ; piquage d 100 sur D 200 → 13,40 à 90° ; coude 90°, 2 joints → 22,5°.
La trémie est testée par ses invariants (longueurs des arêtes conservées au dépliage) : **à vérifier
sur une vraie pièce** ou un modèle de tôlerie SolidWorks.

---

## Matériaux et fixation (`plugins/materiaux`)

| Mini-app | Calcul (`src/`) | Contenu |
| --- | --- | --- |
| `masse` | `masse.ts` | tôle ou plat, tube rond, tube carré ou rectangulaire (angles vifs), rond et carré pleins, cornière, IPE/HEA/HEB/UPN (masse au mètre de `profiles.json`, acier) ; matière, longueur (vide : au mètre), quantité, prix au kg ou au mètre ; masse unitaire et totale, kg/m, kg/m² d'une tôle, section, surface extérieure |
| `taraudage` | `filetage.ts` | M1,6 à M64, pas gros et fins ; foret de taraudage (table DIN 336 au pas gros, d − P au pas fin), foret pour taraud à refouler (d − P/2), D1, d2, d3, section résistante As, passages ISO 273 (fine, moyenne, large), lamage CHC ; tableau complet copiable |
| `rotation` | `vitesse.ts` | écran simple voulu par Bryan : on saisit **le Ø du trou**, on lit la **vitesse théorique** et la plage **mini-maxi** (Vc de la table en [mini, conseillée, maxi], perçage HSS en acier doux par défaut) ; « Plus de paramètres » : opération, matière, outil, Vc, avance, dents, longueur (Vf, temps), **vitesses de la machine** gardées dans `PluginSettings` (vitesse à régler : dans la plage, la plus proche de la théorique) |
| `serrage` | `serrage.ts` | méthode simplifiée **VDI 2230** : précharge à 90 % de Rp0,2, FM = ν Rp A0 / √(1 + 3 [3/2 · d2/d0 · (P/(π d2) + 1,155 µ)]²), MA = FM (0,16 P + 0,58 d2 µ + Dkm/2 · µ) ; classes 8.8, 10.9, 12.9, A2-70, A4-80 ; µ de 0,08 à 0,20 ; répartition du couple ; tableau M3 à M30 |

Tables (`src/data/`, chacune avec sa source) : `matieres.json` (copie de celle de la Tôlerie),
`profiles.json`, `filetages.json`, `couples.json` (Rp0,2 des classes, frottements, clés),
`vitesses-coupe.json`. L'identifiant `rotation` (vitesse de coupe) vient du premier manifeste : gardé tel quel.
Cas de test : tube 40 × 40 × 2 → 304 mm², 2,386 kg/m, 14,32 kg sur 6 m ; tôle 2000 × 1000 × 3 →
47,1 kg ; rond Ø 30 → 5,549 kg/m ; M8 → 6,8, M8 × 1 → 7,0, passages M10 → 10,5 / 11 / 12 ; Vc 25,
Ø 10 → 796 tr/min ; M10 8.8, µ 0,12 → 49,7 N·m et 29,6 kN (les tables usuelles sont retrouvées à 5 %).

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