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

### Export PDF (lot 2)
- `exportPdf()` : la zone résultats en A4 (A3 pour un développé), avec l'en-tête du calcul, boîte
  « Enregistrer sous ». Pas fait : les fiches passent par l'impression Windows (« Enregistrer au
  format PDF »).
- Export DXF : **fait** (`toDxf` + `saveFile`, voir [09](09-bibliotheques-fiches-envoi.md)).
- `readDxf()` (lot 4) : géométrie simplifiée lue par Rust.

Le débit de tubes v2, le plugin Matériaux et fixation et le plugin Traçage (ex-Chaudronnerie) sont
**faits** : leurs formules et cas de test sont dans [10-plugins-existants.md](10-plugins-existants.md)
et dans les tests.

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
