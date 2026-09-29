# 13 — Spécifications de ce qui reste à coder

Extrait du cahier des charges des plugins (page claude.ai privée), pour un agent qui n'y a pas
accès. Ces spécifications ont été **rédigées mais pas toutes validées en détail** par Bryan :
reposer les questions ouvertes avant de coder. Règles communes : [07-creer-un-plugin.md](07-creer-un-plugin.md).

## Moteur

### Catalogue de plugins : fait (0.2.0, 29/09/2026)
Spécification validée par Bryan puis codée : voir [14-publier-une-version.md](14-publier-une-version.md#catalogue-de-plugins-depuis-la-020).
Restent pour plus tard : plugins d'autres auteurs (par demande de fusion sur le catalogue), version
minimale de l'application par plugin (champ `apiVersion` publié mais pas encore contrôlé).

### Réglages ajoutés par les plugins et dépendances entre plugins (proposé, à valider)

**Pas codé.** Demandé par Bryan le 29/09/2026 : « tout ce qui est fournisseur, machines, il ne faut pas
que ce soit des blocs dans le moteur : c'est le plugin qui ajoute son réglage », et des plugins qui
s'appuient les uns sur les autres « exactement comme un serveur Minecraft ». Aujourd'hui, les
Fournisseurs et les Machines sont codés dans le moteur (`lib/state/libraries.svelte.ts`,
`SuppliersEditor`, `MachinesEditor`, champ `libraries` du message `init`) : c'est ce qui disparaît.

**Principe.** Chaque plugin reste indépendant (son dossier, sa version, ses données, installé et
désinstallé seul). Un plugin **déclare** dans son manifeste ce qu'il fournit et ce dont il a besoin ;
le moteur, jamais un autre plugin, fait circuler les données (les cadres restent isolés).

Manifeste, champs nouveaux (tous facultatifs) :
```json
{
  "id": "fournisseurs",
  "provides": { "fournisseurs": "1" },
  "settings": [{ "id": "fournisseurs", "title": "Fournisseurs", "entry": "reglages/index.html" }],
  "dependencies": { },
  "optionalDependencies": { }
}
```
et, pour un plugin consommateur : `"dependencies": { "fournisseurs": "^1" }` (obligatoire) ou
`"optionalDependencies": { "fournisseurs": "^1" }` (il marche sans, en mieux avec).

1. **Pages de réglages de plugin** (`settings`). Le moteur ajoute une entrée dans Paramètres → Plugins
   pour chaque page déclarée, avec le titre du plugin. La page est une page du plugin, dans le même
   cadre isolé et avec le même kit `@etabli/ui` : le plugin dessine son écran (tableau de fournisseurs,
   liste de machines, prix des tubes). Plugin désactivé ou désinstallé : la page disparaît. Variante
   déclarative (cases, nombres, listes décrits en JSON, dessinés par le moteur) possible plus tard.
2. **Données fournies** (`provides`). Un plugin qui fournit `fournisseurs@1` s'engage sur un
   **contrat** documenté (forme des données, ici la liste des fournisseurs et de leur matière). Les
   contrats officiels (`fournisseurs@1`, `machines@1`) sont décrits dans `docs/` : c'est ce qui permet à
   des développeurs indépendants de s'entendre sans se parler. Les données restent dans l'espace du
   fournisseur (`donnees/<plugin>/…`).
3. **Lecture par un autre plugin.** Le SDK gagne `etabli.services.get("fournisseurs")` : le moteur
   vérifie que la dépendance est déclarée et que le service est disponible, puis relaie la **lecture**
   (jamais l'écriture) et prévient à chaque modification, comme `libraries.onChange` aujourd'hui.
4. **Cycle de vie.** Installer un plugin qui a des dépendances obligatoires : le catalogue affiche
   « a besoin de Fournisseurs » et installe les deux après confirmation, dans l'ordre. Désinstaller ou
   désactiver un plugin dont d'autres dépendent : avertissement avec la liste, désactivation en
   cascade ou annulation ; les données sont **gardées** (règle déjà validée pour la désinstallation).
   Dépendance obligatoire absente : la mini-app affiche « Il faut installer Fournisseurs » avec un
   bouton, jamais un écran cassé. Versions : `^1` = toute version 1.x ; une version 2.0 d'un
   fournisseur n'active pas les plugins qui exigent `^1` (ils sont signalés « à mettre à jour »). Cycles
   de dépendances interdits (le catalogue et le chargement les refusent).
5. **Migration.** Au premier lancement de la version qui apporte ça, les fournisseurs et machines
   enregistrés par l'utilisateur sont repris dans les données des nouveaux plugins officiels
   `fournisseurs` et `machines` (rien de perdu), la section « Fournisseurs et machines » de Paramètres
   disparaît, Économie de matière passe en dépendance **facultative** de ces deux plugins. Comme au
   premier lancement il n'y a rien d'installé, l'application ne les impose pas.
6. **Plus tard** : points d'extension (un plugin tiers, par exemple « fournisseur métaux Lyon »,
   ajoute ses prix au plugin `fournisseurs`).

Ordre de codage proposé : (a) pages de réglages de plugin ; (b) `dependencies`, `provides`, relais de
lecture, installation en chaîne ; (c) plugins `fournisseurs` et `machines`, migration, retrait des blocs
du moteur ; (d) points d'extension.

Questions à trancher avec Bryan avant (c) : un seul plugin « Atelier » ou deux plugins `fournisseurs` et
`machines` (recommandé : deux) ; installer les dépendances obligatoires automatiquement après
confirmation (recommandé) ; réglages en page libre uniquement au début (recommandé).

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
