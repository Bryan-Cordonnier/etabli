# 10 — Plugins existants

| Plugin | Version | Mini-apps | Tests |
| --- | --- | --- | --- |
| `maths` Maths et géométrie | 1.0.0 | 7 | 31 |
| `economie` Économie de matière | 0.3.0 | 2 | 59 |
| `tolerie` Tôlerie | 1.0.0 | 2 | 11 |
| `tracage` Traçage (ex-« Chaudronnerie ») | 1.0.0 | 5 | 22 |
| `materiaux` Matériaux et fixation | 1.0.0 | 4 | 20 |

Le kit `@etabli/ui` a 12 tests (calculs saisis, format, collage Excel, DXF).

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

## Économie de matière (`plugins/economie`)

### Débit de tubes (`apps/debit-tubes/DebitTubes.svelte`)

But : le moins de barres possible, puis les chutes les plus longues. Saisie : profilé, matière
(kg/m), barres (longueurs, quantités, **tolérance −/+**, longueur d'un fournisseur), chutes du stock,
scie (bibliothèque Machines) ou réglages à la main, pièces (repère, longueur **pointe à pointe**,
quantité, angles, **chute réservée** avec sa destination).

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
| `src/debit.ts` | `planCuts` : pour chaque barre, **sac à dos exact au mm** (programmation dynamique) avec un trait complet par pièce (toujours faisable), puis rangement avec `arrange` et **ajout de pièces dans la place gagnée** ; chutes du stock d'abord (sans dressage), puis la longueur de barre la mieux remplie ; relances avec mélange reproductible pendant 250 ms (`budgetMs`), meilleur plan gardé. `StockBar` : `tolMinus`/`tolPlus` ; `BarPlan` : `length` (de calcul), `nominal`, `grow` (plage du reste). `priority: "temps"` : une planification par famille d'angles (clé = paire d'angles triée), stock et chutes consommés dans l'ordre ; `groupBars` |
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
Tout est calculé sur la **fibre moyenne** : on saisit le Ø intérieur, moyen ou extérieur et
l'épaisseur. Chaque mini-app affiche le flan (`src/Flat.svelte`), un **tableau de traçage** repliable
et copiable (`src/TraceTable.svelte`), et propose **Exporter en DXF** et **Imprimer le gabarit**
(fiche + gabarit à l'échelle 1 en feuilles A4, voir [09](09-bibliotheques-fiches-envoi.md)).

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
| `rotation` | `vitesse.ts` | Vc proposée (opération × outil HSS/carbure × matière), N = 1000 Vc / (π D), avance conseillée, Vf, temps ; **vitesses de la machine** gardées dans `PluginSettings` : vitesse à régler et Vc réelle |
| `serrage` | `serrage.ts` | méthode simplifiée **VDI 2230** : précharge à 90 % de Rp0,2, FM = ν Rp A0 / √(1 + 3 [3/2 · d2/d0 · (P/(π d2) + 1,155 µ)]²), MA = FM (0,16 P + 0,58 d2 µ + Dkm/2 · µ) ; classes 8.8, 10.9, 12.9, A2-70, A4-80 ; µ de 0,08 à 0,20 ; répartition du couple ; tableau M3 à M30 |

Tables (`src/data/`, chacune avec sa source) : `matieres.json` (copie de celle de la Tôlerie),
`profiles.json`, `filetages.json`, `couples.json` (Rp0,2 des classes, frottements, clés),
`vitesses-coupe.json`. L'identifiant `rotation` (vitesse de coupe) vient du premier manifeste : gardé tel quel.
Cas de test : tube 40 × 40 × 2 → 304 mm², 2,386 kg/m, 14,32 kg sur 6 m ; tôle 2000 × 1000 × 3 →
47,1 kg ; rond Ø 30 → 5,549 kg/m ; M8 → 6,8, M8 × 1 → 7,0, passages M10 → 10,5 / 11 / 12 ; Vc 25,
Ø 10 → 796 tr/min ; M10 8.8, µ 0,12 → 49,7 N·m et 29,6 kN (les tables usuelles sont retrouvées à 5 %).