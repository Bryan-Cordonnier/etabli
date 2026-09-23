# Établi

Boîte à outils de bureau pour la chaudronnerie (BTS CRCI) : calculs, débits de tubes, calepinage de tôles… Légère, pensée pour tourner à côté de SolidWorks, et extensible par plugins.

> Projet en cours de construction — jalon 0 (fondations).

## Structure

```
apps/desktop/     le moteur : application Tauri 2 (Rust) + interface Svelte 5
packages/sdk/     @etabli/sdk : API hôte pour les plugins (à venir)
packages/ui/      @etabli/ui : kit de composants (à venir)
plugins/          plugins officiels (à venir)
docs/             site de documentation (à venir)
```

## Environnement de développement

Les outils (Rust, Git, compilateur C++ Microsoft) sont isolés sur un Dev Drive `H:` :
ils ne sont visibles que dans un terminal ouvert avec `H:\Terminal Etabli.cmd`
(ou après `. H:\outils\env-dev.ps1`).

Prérequis : Node.js 22+, Rust stable (toolchain MSVC), Build Tools Visual Studio (C++), WebView2.

## Commandes

```
npm install        installe les dépendances
npm run dev        lance l'application en mode développement
npm run build      produit l'installateur Windows
npm run check      vérifie les types
```
