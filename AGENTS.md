# Établi — point d'entrée pour un agent

Application de bureau Windows (Tauri 2 + Svelte 5 + Rust) : une boîte à outils de chaudronnerie
(BTS CRCI) extensible par **plugins**. Chaque plugin contient des **mini-apps** (un calcul, un
débit, un calepinage…) affichées dans un cadre isolé et reliées au moteur par un SDK.
Tout est en **français** : interface, commentaires, messages de commit, documentation.

Ce fichier est un **sommaire** : lisez seulement les fichiers utiles à votre tâche.

## Par où commencer

1. [docs/00-contexte.md](docs/00-contexte.md) — le projet, l'utilisateur, l'état d'avancement. **Toujours.**
2. [docs/11-conventions.md](docs/11-conventions.md) — règles de code et de collaboration. **Toujours.**
3. Puis selon la tâche, le tableau ci-dessous.

## Documentation

| Fichier | Contenu | À lire si… |
| --- | --- | --- |
| [docs/00-contexte.md](docs/00-contexte.md) | But, utilisateur, principes, avancement, liens vers les cahiers des charges | toujours |
| [docs/01-stack.md](docs/01-stack.md) | Technologies et versions, organisation du monorepo, scripts npm | vous découvrez le dépôt |
| [docs/02-environnement.md](docs/02-environnement.md) | Poste de dev (Dev Drive H:), lancer, vérifier, CI, pièges connus | vous lancez une commande |
| [docs/03-architecture.md](docs/03-architecture.md) | Vue d'ensemble : Rust, interface hôte, fenêtres, plugins isolés, flux de données | vous touchez à plus d'un fichier |
| [docs/04-coeur-rust.md](docs/04-coeur-rust.md) | Modules Rust, commandes `invoke`, sécurité, ajouter une commande | vous modifiez `apps/desktop/src-tauri` |
| [docs/05-interface.md](docs/05-interface.md) | Interface hôte Svelte : état, navigation, pages, thèmes, aperçu rapide | vous modifiez `apps/desktop/src` |
| [docs/06-protocole-sdk.md](docs/06-protocole-sdk.md) | Protocole moteur ↔ mini-app, `@etabli/sdk`, kit `@etabli/ui` | vous écrivez une mini-app ou changez le protocole |
| [docs/07-creer-un-plugin.md](docs/07-creer-un-plugin.md) | Guide pas à pas : nouveau plugin, nouvelle mini-app, modèles de code, liste de contrôle | vous ajoutez un plugin ou une mini-app |
| [docs/08-documents-donnees.md](docs/08-documents-donnees.md) | Fichiers `.etabli`, réglages, bibliothèques, emplacements, migrations | vous touchez à l'enregistrement |
| [docs/09-bibliotheques-fiches-envoi.md](docs/09-bibliotheques-fiches-envoi.md) | Fournisseurs, machines, réglages de plugin, fiches d'atelier imprimées, envoi entre mini-apps | vous utilisez une de ces briques |
| [docs/10-plugins-existants.md](docs/10-plugins-existants.md) | Maths, Économie de matière, Tôlerie : fichiers, algorithmes, tests | vous modifiez un plugin existant |
| [docs/12-a-faire.md](docs/12-a-faire.md) | Ce qui reste à faire, par priorité, et les limites connues | vous cherchez la prochaine tâche |
| [docs/13-specs-a-venir.md](docs/13-specs-a-venir.md) | Spécifications (formules, cas de test) des Projets et des plugins pas encore codés | vous codez une de ces fonctionnalités |

Autres références : [README.md](README.md) (présentation courte), [packages/sdk/README.md](packages/sdk/README.md) (API du SDK).

## Carte du dépôt

```
apps/desktop/src-tauri/   cœur Rust : fenêtres, plugins, documents, réglages, raccourci global
apps/desktop/src/         interface hôte Svelte (fenêtre principale + aperçu rapide)
packages/sdk/             @etabli/sdk : protocole et API des mini-apps
packages/ui/              @etabli/ui : composants et outils communs des mini-apps
plugins/maths/            7 mini-apps de géométrie
plugins/economie/         débit de tubes (angles, 3D), calepinage de tôles à la cisaille
plugins/tolerie/          développé de pliage, vé et effort de pliage
plugins/tracage/          développés façon Logitrace : virole, cône, piquage, coude, trémie
plugins/materiaux/        masse, taraudage et passages, vitesse de coupe, couple de serrage
docs/                     cette documentation
```

## Règles d'or

- **Chaque commande PowerShell** commence par `. 'H:\outils\env-dev.ps1' | Out-Null;` (Rust, Git et caches sont sur `H:`, rien sur `C:`).
- **Avant chaque commit** : `npm run check`, `npm test`, `npm run build:plugins` et, si Rust a changé, `cargo fmt`, `cargo clippy --all-targets`, `cargo test` dans `apps/desktop/src-tauri`. La CI GitHub refait tout ça sous Windows.
- **Une mini-app ne touche jamais au disque ni au réseau** : tout passe par le SDK et le moteur.
- **Les plugins sont indépendants** : un lien entre plugins (envoi, lecture) reste facultatif.
- **Ne lancez pas de gros développement sans spécification validée** par l'utilisateur : il itère d'abord (maquette, questions), code ensuite.
- **Dites ce qui n'a pas été vérifié à l'écran** : la plupart des changements d'interface ne sont testés que par l'utilisateur dans l'application.
