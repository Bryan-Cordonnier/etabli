# 09 — Bibliothèques, fiches d'atelier, envoi entre mini-apps

Briques communes du moteur (lot 1). Un plugin s'en sert s'il veut ; il fonctionne sans.

## Bibliothèque Fournisseurs

- Paramètres → Bibliothèques → Fournisseurs (`components/SuppliersEditor.svelte`).
- `Supplier { id, name, items: SupplierItem[] }` ; `SupplierItem` : `kind` (type de matière :
  `tube-rond`, `tube-carre`, `tube-rect`, `rond-plein`, `carre-plein`, `plat`, `corniere`,
  `poutrelle`, `autre`, `tole`), `material` (nuance, vide = toutes), `designation` (profilé ou
  épaisseur, vide = tous), `length`, `width` (tôle seulement), `tolMinus`, `tolPlus`, `price`
  (facultatif) et `priceUnit` (`piece`, `kg`, `m`, `m2`).
- **Le prix ne sert qu'au futur plugin Chiffrage** : Économie ne l'affiche ni ne l'utilise (décision de Bryan).
- Utilisation actuelle : « Longueur d'un fournisseur… » (débit de tubes), « Format d'un
  fournisseur… » (calepinage, avec la tolérance).

## Bibliothèque Machines

- Paramètres → Bibliothèques → Machines (`components/MachinesEditor.svelte`). Types dans `protocol.ts`.
- `Saw` (scie) : `type` (ruban, tronçonneuse, onglet, autre), `kerf` (trait de scie), `maxAngle`,
  `bothSides`, `stopMax` (course de butée, null = pas de butée), `minLength`, `trim` (dressage).
- `Shear` (cisaille) : `bladeLength`, `maxThickness` (acier), `gaugeMax` (butée arrière), `trim`.
- La presse plieuse viendra avec une évolution de la Tôlerie.
- Dans un calcul, la liste des machines se termine par **« + Ajouter une machine… »** : message
  `addMachine` → la machine est créée et les Paramètres s'ouvrent dessus (mise en avant) ; la
  mini-app choisit la nouvelle machine dès qu'elle apparaît dans `libraries.machines`.
  Depuis l'aperçu rapide, le calcul passe d'abord dans la fenêtre principale.
- Une machine choisie **impose** ses réglages au calcul (ils ne se modifient que dans la
  bibliothèque) ; sans machine, les réglages se saisissent à la main.

## Réglages d'un plugin

`PluginSettings` (`@etabli/ui`) : un objet réactif partagé par toutes les mini-apps d'un plugin,
enregistré dans `donnees/plugin.<id>.json`. Exemple : Matériaux et fixation y garde les vitesses de
la perceuse de l'atelier (`vitessesMachine`), communes à tous les calculs de vitesse de coupe.

## Fiches d'atelier imprimées

Principe (cahier des charges des plugins, section 3.2) : on prépare la fiche au bureau, on l'emporte
à l'atelier sans ordinateur. A4, lisible en noir et blanc (repères en lettres, hachures), cases à
cocher, cadre de signature.

- La mini-app construit un `FichePrint` : `kind` (« Fiche de coupe »), `title` (vide = titre du
  calcul), `subtitle`, `ident` (lignes du cartouche, ex. `[["Poste", "Scie à ruban"]]`), `pages`
  (HTML de chaque page, **sans script**), `css` facultatif. Puis `printFiche(fiche)`.
- Le moteur (`apps/desktop/src/lib/print/print.ts`) ajoute l'en-tête (logo, titre, cartouche avec la
  date et « Préparé : » = nom de l'auteur des Paramètres), le pied de page numéroté (`@page`), la
  feuille `fiche.css`, et ouvre la fenêtre d'impression de Windows (PDF avec « Enregistrer au format
  PDF »).
- Classes de `fiche.css` : `section`, `facts`/`fact`, `table` (`tr.group` = trait épais), `mark`
  (repère, couleur `--fill`), `box` (case à cocher), `settings`, `tag`, `legend`, `tip`, `block`
  (un bloc par barre ou tôle, jamais coupé), `block-head`, `end`, `keep`/`lost`/`reserve`,
  `svg.scheme`, `sign`, `small`, `num`.
- Aides pour écrire les pages : `packages/ui/src/fiche.ts`, exportées par `@etabli/ui` (`esc`, `fmt`,
  `tint`, `mark`, `box`, `section`, `facts`, `table`, `signature`, `hatch`).
- Exemples complets : `plugins/economie/src/fiche-debit.ts`, `fiche-calepinage.ts` et
  `plugins/tracage/src/export.ts` (`tracageFiche` : résultats, tableau de traçage, gabarit).

## Export DXF

`toDxf(drawing)` (`packages/ui/src/dxf.ts`) écrit un DXF **R12 (AC1009)**, en mm (`$INSUNITS` 4),
lu par SolidWorks, LibreCAD, DraftSight et les logiciels de découpe. Calques : `CONTOUR` (blanc/noir,
trait de découpe), `PLI` (rouge, pliage léger ou arête), `TRACE` (cyan, génératrices, repères),
`TEXTE` (vert). La mini-app enregistre le texte avec `saveFile({ name, content, extension: "dxf",
description: "Dessin DXF" })`. Tests : `packages/ui/src/dxf.test.ts`.

## Gabarits à l'échelle 1

`gabaritPages(shapes, labels, title)` (`packages/ui/src/gabarit.ts`) découpe un développé en feuilles
A4 (zone utile 180 × 250 mm, marge 10 mm) repérées A1, A2, B1…, avec des croix d'assemblage et une
**règle de 100 mm** pour vérifier l'échelle. Les pages s'ajoutent aux `pages` d'une fiche : il faut
imprimer à **100 % (taille réelle)**, sans « ajuster à la page ». Types de traits : `contour`, `pli`
(tirets rouges), `trace` (pointillés).

## Envoi entre mini-apps

- Émetteur : `sendTo("piece-plate", données)` (`@etabli/ui`).
- Récepteur : déclare `"accepts": ["piece-plate"]` dans le manifeste, puis appelle
  `onIncoming("piece-plate", (data, from) => …)` **après** avoir créé son `MiniAppDocument`.
- Le moteur (`apps/desktop/src/lib/send.ts`) cherche la première mini-app active qui accepte ce type,
  l'ouvre dans un **nouvel onglet** (nouveau calcul) et lui transmet les données dans `init.incoming`,
  une seule fois. Depuis l'aperçu rapide, l'envoi est délégué à la fenêtre principale.
- Types définis :

| Type | Données | Émetteur → récepteur |
| --- | --- | --- |
| `piece-plate` | `{ name, length, width, quantity, grain, thickness?, family? }` (`length` le long du laminage si `grain` ; `family` : `acier`, `galva`, `inox`, `alu`, `cuivre`, `laiton`) | Tôlerie (développé) → Économie (calepinage) |
| `liste-de-coupe` | prévu (longueurs à débiter) | — |
| `contour-2d` | prévu (pièce plate quelconque) | — |

Si plusieurs mini-apps acceptent un type, la première est prise : un choix proposé à l'utilisateur
reste à faire.
