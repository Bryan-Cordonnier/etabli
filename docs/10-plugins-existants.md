# 10 — Plugins existants

| Plugin | Version | Mini-apps | Tests |
| --- | --- | --- | --- |
| `maths` Maths et géométrie | 1.0.0 | 7 | 31 |
| `economie` Économie de matière | 0.3.0 | 2 | 49 |
| `tolerie` Tôlerie | 1.0.0 | 2 | 11 |
| `materiaux`, `chaudronnerie` | 0.1.0 | manifeste seul (mini-apps « à venir ») | — |

Le kit `@etabli/ui` a 7 tests (calculs saisis, format, collage Excel).

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
| `conversions` | `geometry.ts` | mm ↔ pouces (fractions au 1/64), angles ↔ pentes (%, mm/m, radians, 1:n) |

`Pythagore.svelte` utilise encore `connect()` directement (première mini-app écrite) ; les autres
utilisent `MiniAppDocument`.

---

## Économie de matière (`plugins/economie`)

### Débit de tubes (`apps/debit-tubes/DebitTubes.svelte`)

But : le moins de barres possible, puis les chutes les plus longues. Saisie : profilé, barres
(longueurs, quantités, longueur d'un fournisseur), chutes du stock, scie (bibliothèque Machines) ou
réglages à la main, pièces (repère, longueur **pointe à pointe**, quantité, angles).

| Fichier | Rôle |
| --- | --- |
| `src/profil.ts` | types de profilés (tubes carré/rect/rond, pleins, plat, cornière, IPE/HEA, UPN), dimensions saisies, section (contour + trous en (y, z)), aire, conversion des anciens profilés texte |
| `src/coupe.ts` | géométrie des coupes d'angle : chaque bout est un **recul linéaire** `e(y,z) = c + a·y + b·z` depuis la pointe ; 4 poses (normale, retournée, bout pour bout ×2) ; `gap` = écart entre deux pointes voisines (négatif quand les coupes s'emboîtent, trait de scie compté le long de la barre) ; `arrange` = ordre et pose qui minimisent la longueur (glouton avec essai de chaque pièce de départ) |
| `src/debit.ts` | `planCuts` : pour chaque barre, **sac à dos exact au mm** (programmation dynamique) avec un trait complet par pièce (toujours faisable), puis rangement avec `arrange` et **ajout de pièces dans la place gagnée** ; chutes du stock d'abord (sans dressage), puis la longueur de barre la mieux remplie ; relances avec mélange reproductible pendant 250 ms, meilleur plan gardé ; `groupBars` |
| `src/pieces.ts` | `nextMark` (A, B… AA), `rowsFromPaste` (Excel), `num`, `quantity` |
| `src/piece3d.ts` | scène three.js (`Viewer3D`), géométrie d'une pièce (`buildGeometry`), rendu **à la demande** |
| `src/Piece3D.svelte` | mini écran 3D de la pièce sélectionnée (vues 3D/dessus/côté, pièce raccourcie au milieu si très longue, étiquettes d'angle) |
| `src/plan3d.ts`, `src/Plan3D.svelte` | plan de débit en 3D : barres empilées, pièces écartées et raccourcies au milieu, bouts exacts |
| `src/fiche.ts`, `src/fiche-debit.ts` | fiche de coupe imprimée (récapitulatif, pièces, réglages, barre par barre avec angle de scie et « retourner le tube ») |

Le résultat s'affiche en 2D (formes réelles des coupes) ou en 3D (sélecteur). Données : format 2
(`migrate` convertit le profilé texte et ajoute les angles).

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
