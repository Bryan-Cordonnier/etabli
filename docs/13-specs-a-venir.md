# 13 — Spécifications de ce qui reste à coder

Extrait du cahier des charges des plugins (page claude.ai privée), pour un agent qui n'y a pas
accès. Ces spécifications ont été **rédigées mais pas toutes validées en détail** par Bryan :
reposer les questions ouvertes avant de coder. Règles communes : [07-creer-un-plugin.md](07-creer-un-plugin.md).

## Moteur

### Projets (lot 1)
- Onglet « Projets » dans la colonne, sous Accueil (ce n'est pas un plugin).
- Créer un projet : nom, description facultative, emplacement → dossier `<nom>/` avec un fichier de
  projet et **un sous-dossier par plugin** pour les `.etabli` et leurs fiches PDF. **Pas de statut.**
- Page d'un projet : calculs et fiches rangés par plugin, ouverture en un clic, « Imprimer toutes
  les fiches ».
- Dans chaque calcul : sélecteur « Projet : aucun / … » ; choisir un projet **déplace** le calcul et
  ses fiches ; « aucun » le remet dans l'historique général.
- « Ouvrir un projet » : un dossier (clé USB, partage) rejoint la liste des projets.
- Double-clic sur un `.etabli` ou un fichier de projet dans l'Explorateur : l'application l'ouvre.

### Export PDF et DXF (lot 2)
- `exportPdf()` : la zone résultats en A4 (A3 pour un développé), avec l'en-tête du calcul, boîte
  « Enregistrer sous ».
- `exportDxf(géométrie)` : lignes, arcs, polylignes, textes en mm à l'échelle 1, un calque par nature
  (contour, pli, texte), lisible par SolidWorks et les logiciels de découpe.
- `readDxf()` (lot 4) : géométrie simplifiée lue par Rust.

## Économie — débit de tubes v2 (fin)
Voir [12-a-faire.md](12-a-faire.md) : tolérances en plage, matière et poids, mode besoin, chutes
réservées (deux résultats), ordre par angle de scie, fiche fidèle à la maquette.

## Plugin Matériaux et fixation
1. **Masse d'une pièce ou d'un profilé** : tôle/plat (L × l × e), tube rond (Ø × e), tube carré ou
   rectangulaire (a × b × e), rond plein, carré plein, cornière (a × b × e), IPE/HEA/UPN (masse au
   mètre lue dans une table) ; matière, longueur, quantité, prix au kg facultatif. Résultats : masse
   unitaire et totale, masse au mètre, section, surface extérieure (peinture, galvanisation), prix.
   *Cas* : tube carré 40 × 40 × 2 acier, 6 m → section 304 mm², 2,386 kg/m, 14,32 kg ; tôle
   2000 × 1000 × 3 → 47,1 kg ; rond plein Ø 30 → 5,549 kg/m.
2. **Perçage avant taraudage et trous de passage** : M1,6 à M64, pas gros ou fin. Foret de
   taraudage (table, ≈ d − P), foret pour taraud à refouler (≈ d − P/2), passages ISO 273 (fine,
   moyenne, large), lamage pour vis CHC ISO 4762 (Ø et profondeur), diamètre du noyau.
   *Cas* : M8 → 6,8 ; M8 × 1 → 7,0 ; passage M10 → 10,5 / 11 / 12.
3. **Vitesse de coupe et de rotation** : opération (perçage, fraisage, tournage), matière, outil
   (HSS, carbure) → Vc proposée ; N = 1000 × Vc / (π × D) ; Vf = N × fz × Z (fraisage) ou N × f ;
   temps d'usinage. *Cas* : Vc 25 m/min, foret Ø 10 → 796 tr/min.
4. **Couples de serrage** : M4 à M30, classes 8.8, 10.9, 12.9, A2-70, A4-80, frottement 0,12 par
   défaut → couple (N·m) et précharge (kN), table de type VDI 2230, indicatifs.
   *Cas* : M10 8.8, µ 0,12 → ≈ 49 N·m.
5. Tables JSON : `matieres.json` (même contenu que la Tôlerie, chaque plugin garde sa copie),
   `profiles.json`, `filetages.json`, `couples.json`, `vitesses-coupe.json`, avec leur source.

## Plugin Chaudronnerie (lot 2)
Développés de traçage sur la **fibre moyenne** (Ø intérieur + épaisseur), saisie en Ø intérieur,
moyen ou extérieur ; tableau de traçage (ordonnées par génératrice, 12 à 72 divisions), schéma à
l'échelle, export PDF échelle 1 (gabarit sur plusieurs A4) et DXF.
1. **Virole** : Ø, épaisseur, hauteur, longueur de tôle maxi → L = π × Dm, nombre de tôles et
   longueur de chaque morceau, masse, flan. *Cas* : Ø int 500, e 5 → Dm 505, développé 1 586,5 mm.
2. **Tronçon de cône droit** : grand et petit Ø, hauteur (ou génératrice, ou demi-angle), épaisseur,
   nombre de secteurs. tan α = (R − r)/H ; ρ = R / sin α ; ρ' = r / sin α ; θ = 360° × sin α. Résultats :
   ρ, ρ', θ, génératrice, corde et flèche du secteur, encombrement. *Cas* : Ø 200 et Ø 400 moyens,
   H 300 → génératrice 316,23, ρ 632,46, ρ' 316,23, θ 113,84°.
3. **Piquage cylindre sur cylindre** : d, D, angle (90° par défaut), excentration, épaisseurs,
   divisions → ordonnées de la courbe de coupe (développé π × d) et gabarit du trou. À 90° centré :
   y(φ) = R − √(R² − (r · sin φ)²). *Cas* : d 100, D 200, 90° → à φ = 90° : 13,40 mm.
4. **Coude à segments** : Ø, rayon de cintrage à l'axe, angle total, nombre de joints. Angle de coupe
   β = angle total / (2 × joints) ; y(φ) = (Rc + r · cos φ) · tan β. Longueurs extrados/intrados,
   gabarit, disposition des segments dans un tube. *Cas* : coude 90°, 2 joints → β = 22,5°.
5. **Trémie carré-rond** : rectangle bas, cercle haut, hauteur, décalages, divisions ; triangulation
   (vraies grandeurs, développé par triangles). La plus complexe : à faire en dernier, vérifier sur
   une pièce réelle ou un modèle tôlerie SolidWorks.

## Plugin Soudage (lot 3, proposé)
1. **Cordon d'angle** : gorge a ou côté z (z = a × √2), épaisseurs, longueur, matière → section
   (a², +10 % de surépaisseur par défaut), masse déposée au mètre et totale, gorge conseillée.
   *Cas* : a 4 → z 5,66 mm, section 16 mm², 0,126 kg/m d'acier sans surépaisseur.
2. **Chanfrein bout à bout** : bords droits, V, demi-V, X, U ; épaisseur, angle, talon, écartement,
   longueur → section, masse, passes estimées, schéma. *Cas* : V 60°, e 10, talon 2, écartement 2
   → section = 2 × 10 + 8² × tan 30° = 56,95 mm².
3. **Consommables, temps et coût** : masse à déposer, procédé (MAG fil plein, fil fourré, électrode,
   TIG), taux de dépôt, rendement (fil plein 95 %, électrode 60 %), facteur de marche (30 % en
   manuel), débit de gaz, prix → fil (kg) ou électrodes, gaz (L, bouteilles), temps, coût.
4. **Préchauffage** : CE = C + Mn/6 + (Cr + Mo + V)/5 + (Ni + Cu)/15, température indicative, avec
   l'avertissement « à confirmer par le mode opératoire de soudage ».

## Plugin Tolérances et ajustements (lot 3, proposé)
1. **Ajustements ISO 286** : cote jusqu'à 500 mm, alésage (H6–H11, F7, G7, JS7, K7, N7, P7), arbre
   (f7, g6, h6–h11, js6, k6, m6, n6, p6, r6, s6) → écarts (µm), cotes mini/maxi, jeu ou serrage,
   type d'ajustement, exemple d'usage, schéma. *Cas* : Ø 25 H7/g6 → alésage 0/+21 µm, arbre
   −7/−20 µm, jeu de 7 à 41 µm.
2. **Tolérances générales** : ISO 2768-1 (f, m, c, v : linéaire, angle, rayon, chanfrein) et
   ISO 13920 (constructions soudées, A–D longueurs et angles, E–H rectitude et planéité).
   *Cas* : ISO 2768-m, 120 mm → ± 0,3 mm.
3. Tables `iso286.json`, `iso2768.json`, `iso13920.json`, **vérifiées sur la norme avant publication**.

## Plugin Chiffrage (lot 4, proposé)
Lit, si l'utilisateur l'a, les résultats d'autres plugins (barres, tôles) et les prix de la
bibliothèque Fournisseurs pour estimer un coût matière ; aucun autre plugin n'en dépend.
