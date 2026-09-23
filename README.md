# Établi

Boîte à outils de bureau pour la chaudronnerie (BTS CRCI) : calculs, débits de tubes, calepinage de tôles… Légère, pensée pour tourner à côté de SolidWorks, et extensible par plugins.

> Projet en cours de construction — jalon 2 (plugins et documents).

## Structure

```
apps/desktop/     le moteur : application Tauri 2 (Rust) + interface Svelte 5
packages/sdk/     @etabli/sdk : ce qu'une mini-app utilise pour parler au moteur
packages/ui/      @etabli/ui : champs, résultats copiables, cartes, document enregistré automatiquement
plugins/maths/    Pythagore, résolution de triangle, arc et cercle, conversions
plugins/economie/ débit de tubes (barres), calepinage de rectangles sur tôles
plugins/*/        autres plugins officiels (manifeste seul pour l'instant)
docs/             site de documentation (à venir)
```

## Plugins

Un plugin est un dossier avec un `manifest.json` (identifiant, nom, couleur, émoji, mini-apps).
Chaque mini-app est une page web affichée dans un cadre isolé, servie à l'adresse
`http://plugins.localhost/<plugin>/<page>` : elle n'a accès ni au disque, ni au réseau, et
dialogue avec le moteur uniquement via [`@etabli/sdk`](packages/sdk/README.md).

Les calculs sont enregistrés automatiquement dans des fichiers `.etabli` (JSON), un dossier
par plugin, dans `Documents\Etabli` (ou `%ETABLI_DATA_DIR%\documents` en développement).

## Environnement de développement

Les outils (Rust, Git, compilateur C++ Microsoft) sont isolés sur un Dev Drive `H:` :
ils ne sont visibles que dans un terminal ouvert avec `H:\Terminal Etabli.cmd`
(ou après `. H:\outils\env-dev.ps1`).

Prérequis : Node.js 22+, Rust stable (toolchain MSVC), Build Tools Visual Studio (C++), WebView2.

## Commandes

```
npm install        installe les dépendances
npm run dev        compile les plugins puis lance l'application en mode développement
npm run build      produit l'installateur Windows
npm run check      vérifie les types (moteur, SDK, plugins)
npm test           teste les calculs des plugins
```
