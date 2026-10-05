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
| [docs/08-documents-donnees.md](docs/08-documents-donnees.md) | Fichiers `.etabli`, réglages, données de plugin, emplacements, migrations | vous touchez à l'enregistrement |
| [docs/09-bibliotheques-fiches-envoi.md](docs/09-bibliotheques-fiches-envoi.md) | Plugins Fournisseurs et Machines, services, réglages de plugin, fiches d'atelier imprimées, envoi entre mini-apps | vous utilisez une de ces briques |
| [docs/10-plugins-existants.md](docs/10-plugins-existants.md) | Maths, Économie de matière, Tôlerie : fichiers, algorithmes, tests | vous modifiez un plugin existant |
| [docs/12-a-faire.md](docs/12-a-faire.md) | Ce qui reste à faire, par priorité, et les limites connues | vous cherchez la prochaine tâche |
| [docs/13-specs-a-venir.md](docs/13-specs-a-venir.md) | Spécifications (formules, cas de test) des Projets et des plugins pas encore codés | vous codez une de ces fonctionnalités |
| [docs/15-gerer-le-depot.md](docs/15-gerer-le-depot.md) | Réglages GitHub à activer, relire une demande de fusion et un plugin d'un autre auteur, tri des tickets | vous maintenez le dépôt |
| [docs/guide-utilisateur.md](docs/guide-utilisateur.md) | Guide de l'utilisateur (installer, catalogue, raccourcis, données, dépannage) | vous documentez ou vous répondez à un utilisateur |
| [docs/16-spec-serveur-utilisateurs-mobile.md](docs/16-spec-serveur-utilisateurs-mobile.md) | Spécification du mode serveur facultatif, des utilisateurs, des espaces partagés et du mobile (brouillon) | vous touchez au stockage, à `api.ts` ou au mobile |
| [docs/17-serveur.md](docs/17-serveur.md) | Le serveur facultatif `etabli-serveur` : lancer, sécuriser, API, limites, code | vous touchez à `crates/` ou au mode serveur |
| [docs/19-modele-de-menace-plugins.md](docs/19-modele-de-menace-plugins.md) | Isolation des plugins : modèle de menace, défenses, tests, permissions v1 | vous touchez à l'isolation, au garde des messages, aux permissions ou aux manifestes |
| [docs/18-spec-plateforme-comptes-licences.md](docs/18-spec-plateforme-comptes-licences.md) | Spécification (brouillon) : plateforme, comptes, licences, baux, registre, mobile, étapes | vous touchez aux licences, comptes, droits, registre ou à la stratégie produit |
| [docs/20-spec-mises-a-jour-registre.md](docs/20-spec-mises-a-jour-registre.md) | Spécification (brouillon) : catalogue signé, révocation, canaux, retour arrière, rotation de clés | vous touchez aux mises à jour, au catalogue ou aux clés de signature |
| [docs/21-spec-licences-baux.md](docs/21-spec-licences-baux.md) | Spécification (brouillon) : service de comptes et de licences, baux signés, sièges, paquets chiffrés | vous touchez aux licences, aux baux ou aux sièges |
| [docs/22-cahier-de-bord.md](docs/22-cahier-de-bord.md) | Cahier de bord : à faire à la main, décisions prises, journal des avancées | vous voulez savoir où en est le projet ou ce qui attend Bryan |
| [docs/23-spec-distributions.md](docs/23-spec-distributions.md) | Spécification (brouillon) : plusieurs applications (essai, ERP, budget) à partir du même moteur par configuration de build ; fork ou configuration ; questions ouvertes | vous touchez au nom, à l'identifiant, aux clés, au catalogue ou à la CI par produit |
| [docs/24-spec-plugins-budget.md](docs/24-spec-plugins-budget.md) | Inventaire de `gestion-budget-perso` et spécification (brouillon) des plugins agenda, finances, paie et budget : services entre plugins (contrats, appels, absence), données, calculs, manques du SDK, Rust/WASM ou TypeScript | vous touchez au budget, aux finances, à la paie, à l'agenda, aux services entre plugins, aux rappels (`notifications`) ou au réemploi de l'ancien cœur Rust |
| [docs/14-publier-une-version.md](docs/14-publier-une-version.md) | Releases GitHub, mises à jour automatiques signées, clé, publier une version, installer | vous publiez une version ou touchez aux mises à jour |

Autres références : [README.md](README.md) (présentation), [CONTRIBUTING.md](CONTRIBUTING.md) (règles pour les contributeurs),
[CHANGELOG.md](CHANGELOG.md) (journal des changements), [ROADMAP.md](ROADMAP.md), [SECURITY.md](SECURITY.md),
[docs/README.md](docs/README.md) (index de toute la documentation), [packages/sdk/README.md](packages/sdk/README.md) (API du SDK).

## Carte du dépôt

```
crates/noyau/             règles communes (identifiants, calculs, paquets signés) — sans entrée-sortie
crates/serveur/           serveur facultatif : comptes, calculs, plugins (docs/17)
apps/desktop/src-tauri/   cœur Rust : fenêtres, plugins, documents, réglages, raccourci global
apps/desktop/src/         interface hôte Svelte (fenêtre principale + aperçu rapide)
apps/mobile/              emballage Android (Capacitor) de la version web ; APK de test par la CI
packages/sdk/             @etabli/sdk : protocole et API des mini-apps
packages/ui/              @etabli/ui : composants et outils communs des mini-apps
plugins/maths/            7 mini-apps de géométrie
plugins/economie/         débit de tubes (angles, 3D), calepinage de tôles à la cisaille
plugins/tolerie/          développé de pliage, vé et effort de pliage
plugins/tracage/          développés façon Logitrace : virole, cône, piquage, coude, trémie
plugins/materiaux/        masse, taraudage et passages, vitesse de coupe, couple de serrage
plugins/fournisseurs/     réglages : fournisseurs de matière (publie le service « fournisseurs »)
plugins/machines/         réglages : scies et cisailles (publie le service « machines »)
plugins/finances/        l'argent réel : registre, service finances@1, tableau de bord (docs/24)
plugins/agenda/          le temps : calendrier, heures à rebours, repos légal, service agenda@1 (docs/24)
plugins/finances/         l'argent réel : comptes, registre en ajout seulement, tableau de bord, service « finances » (hors catalogue)
fixtures/                 plugins de test (appels entre plugins), jamais distribués
docs/                     cette documentation
```

## Règles d'or

- **Chaque commande PowerShell** commence par `. 'H:\outils\env-dev.ps1' | Out-Null;` (Rust, Git et caches sont sur `H:`, rien sur `C:`).
- **Avant chaque commit** : `npm run check`, `npm test`, `npm run build:plugins` et, si Rust a changé, `cargo fmt`, `cargo clippy --all-targets`, `cargo test` dans `apps/desktop/src-tauri`. La CI GitHub refait tout ça sous Windows.
- **Une mini-app ne touche jamais au disque ni au réseau** : tout passe par le SDK et le moteur.
- **Les plugins sont indépendants** : un lien entre plugins (envoi, lecture) reste facultatif.
- **Ne lancez pas de gros développement sans spécification validée** par l'utilisateur : il itère d'abord (maquette, questions), code ensuite.
- **Tenez le journal des changements** : chaque changement visible d'un utilisateur, d'un auteur de plugin ou d'un mainteneur a une ligne
  dans `CHANGELOG.md` (application) ou `plugins/<id>/CHANGELOG.md`, sous « Non publié », écrite pour l'utilisateur. Une version ne se publie
  pas sans sa section (les notes de la Release en viennent).
- **Dites ce qui n'a pas été vérifié à l'écran** : la plupart des changements d'interface ne sont testés que par l'utilisateur dans l'application.
