# Établi

Boîte à outils de bureau pour la chaudronnerie (BTS CRCI) : calculs d'atelier, débit de tubes,
calepinage de tôles à la cisaille, développés de pliage et de traçage… Légère, pensée pour tourner à côté de
SolidWorks sur des PC modestes, 100 % locale, et extensible par plugins.

> Documentation complète pour reprendre le code : **[AGENTS.md](AGENTS.md)** (sommaire) et le dossier [`docs/`](docs/).

## Structure

```
apps/desktop/     le moteur : application Tauri 2 (Rust) + interface Svelte 5
packages/sdk/     @etabli/sdk : protocole et API des mini-apps
packages/ui/      @etabli/ui : champs, résultats copiables, cartes, document enregistré automatiquement
plugins/maths/    Pythagore, triangle, arc, perçage sur cercle, polygone, volumes, conversions
plugins/economie/ débit de tubes (coupes d'angle, 3D), calepinage de tôles à la cisaille
plugins/tolerie/  développé de pliage, vé et effort de pliage
plugins/tracage/  développés de traçage : virole, cône, piquage, coude, trémie (DXF, gabarits)
plugins/materiaux/ masse, taraudage et passages, vitesse de coupe, couple de serrage
docs/             documentation technique
```

## Plugins

Un plugin est un dossier avec un `manifest.json` (identifiant, nom, couleur, émoji, mini-apps).
Chaque mini-app est une page web affichée dans un cadre isolé, servie à l'adresse
`http://plugins.localhost/<plugin>/<page>` : elle n'a accès ni au disque, ni au réseau, et
dialogue avec le moteur uniquement via [`@etabli/sdk`](packages/sdk/README.md).
Guide : [docs/07-creer-un-plugin.md](docs/07-creer-un-plugin.md).

Les calculs sont enregistrés automatiquement dans des fichiers `.etabli` (JSON), un dossier
par plugin, dans `Documents\Etabli` (ou `%ETABLI_DATA_DIR%\documents` en développement).

## Environnement de développement

Les outils (Rust, Git, compilateur C++ Microsoft) sont isolés sur un Dev Drive `H:` :
ils ne sont visibles que dans un terminal ouvert avec `H:\Terminal Etabli.cmd`
(ou après `. H:\outils\env-dev.ps1`). Détails : [docs/02-environnement.md](docs/02-environnement.md).

Prérequis : Node.js 22+, Rust stable (toolchain MSVC), Build Tools Visual Studio (C++), WebView2.

## Commandes

```
npm install        installe les dépendances
npm run dev        compile les plugins puis lance l'application en mode développement
npm run build      produit l'installateur Windows
npm run check      vérifie les types (moteur, SDK, plugins)
npm test           teste les calculs des plugins
```
