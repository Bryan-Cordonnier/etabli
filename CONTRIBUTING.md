# Contribuer à Établi

Merci de vouloir aider ! Établi est un projet libre ([licence MIT](LICENSE)) : n'importe qui peut
l'utiliser, le modifier et écrire des plugins. Ce guide explique comment participer, que vous
sachiez programmer ou non.

Tout le projet est **en français** : interface, documentation, commentaires, messages de commit.
Merci d'écrire vos tickets et vos demandes de fusion en français.

En participant, vous acceptez le [code de conduite](CODE_OF_CONDUCT.md).

## Sommaire

1. [Sans écrire de code](#sans-écrire-de-code)
2. [Écrire un plugin](#écrire-un-plugin)
3. [Modifier le moteur, le SDK ou un plugin existant](#modifier-le-moteur-le-sdk-ou-un-plugin-existant)
4. [Préparer son poste](#préparer-son-poste)
5. [Avant d'ouvrir une demande de fusion](#avant-douvrir-une-demande-de-fusion)
6. [Messages de commit](#messages-de-commit)
7. [Comment se passe la relecture](#comment-se-passe-la-relecture)
8. [Publication](#publication)

## Sans écrire de code

- **Signaler un bug** : [ouvrez un ticket « Bug »](https://github.com/etable-project/etable/issues/new/choose).
  Le bouton *Paramètres → Mises à jour et à propos → Signaler un problème* préremplit la version et
  la liste des plugins.
- **Signaler un résultat de calcul faux** : c'est le bug le plus important d'un outil d'atelier. Utilisez
  le ticket « Résultat de calcul faux » : donnez les valeurs saisies, le résultat obtenu, le résultat
  attendu **et sa source** (norme, catalogue, calcul à la main).
- **Proposer une idée ou un plugin** : ouvrez un ticket « Idée » ou « Proposer un plugin ». Décrivez le
  besoin d'atelier avant la solution.
- **Relire une formule** : si vous connaissez un métier (chaudronnerie, tôlerie, usinage, soudage…),
  votre relecture des formules et des tables vaut de l'or. Commentez le ticket ou la demande de
  fusion concernée.
- **Améliorer la documentation** : une faute, une phrase pas claire, une capture d'écran qui manque :
  proposez la correction directement (bouton « modifier » de GitHub sur le fichier).

## Écrire un plugin

Un plugin est un dossier avec un `manifest.json` et une ou plusieurs mini-apps (pages web isolées).
Il n'a accès ni au disque ni au réseau : tout passe par le [SDK](packages/sdk/README.md).

```bash
npm install
npm run nouveau-plugin -- mon-plugin "Mon plugin"   # crée plugins/mon-plugin avec une mini-app d'exemple
npm run dev                                         # lance Établi avec votre plugin
npm run valider -- mon-plugin                       # vérifie le manifeste et le contenu du plugin
```

Le guide complet est [docs/07-creer-un-plugin.md](docs/07-creer-un-plugin.md). L'essentiel :

- **Chaque formule a au moins trois cas vérifiés à la main** (ou tirés d'un abaque ou d'une norme),
  plus les cas limites, écrits en tests (`src/*.test.ts`). Un calcul faux en atelier coûte de la matière,
  et parfois plus.
- **Jamais de résultat faux affiché** : une phrase qui dit quoi corriger.
- **Aucun accès réseau ni disque**, aucune dépendance lourde sans raison. Le moteur applique une
  politique de sécurité stricte ; `npm run valider` signale aussi les appels suspects.
- **Tout en français** ; unités : mm, degrés, kg, N, MPa.
- Un `CHANGELOG.md` dans le dossier du plugin, avec une section par version (voir
  [Publication](#publication)).
- Les plugins dépendent les uns des autres seulement par le mécanisme de
  [dépendances et services](docs/07-creer-un-plugin.md#dépendances-et-services), jamais directement.

Le moteur n'a **ni catalogue ni magasin** : un plugin se distribue lui-même. Fabriquez le paquet signé
(`npm run paquet -- <id>`, qui produit un fichier `.etapl`) et installez-le depuis la page « Plugins », ou
déposez le dossier compilé dans `%APPDATA%\Etabli\plugins\<id>\` (voir [docs/07](docs/07-creer-un-plugin.md)).
Une demande de fusion qui ajoute un plugin d'exemple dans `plugins/<id>/` n'est acceptée que si ce plugin sert à
illustrer ou à tester le moteur.

## Modifier le moteur, le SDK ou un plugin existant

- **Petit correctif** (faute, bug évident, test manquant) : ouvrez directement la demande de fusion.
- **Nouvelle fonctionnalité ou changement d'interface** : ouvrez d'abord un ticket. Ici, on décide
  d'abord (maquette, questions), on code ensuite : une grosse demande de fusion arrivée sans discussion
  a de fortes chances d'être refusée, même si elle est bien faite.
- Les décisions d'interface déjà prises sont dans [docs/11-conventions.md](docs/11-conventions.md).
- La carte du code est dans [AGENTS.md](AGENTS.md) (sommaire) et [`docs/`](docs/).

## Préparer son poste

Prérequis : **Windows 10 ou 11** (WebView2), **Node.js 24** (22.18 au minimum), **Rust stable**
(toolchain MSVC) et les **Build Tools Visual Studio** (charge de travail C++). Détails et pièges connus :
[docs/02-environnement.md](docs/02-environnement.md).

```bash
git clone https://github.com/etable-project/etable.git
cd etabli
npm install
npm run dev          # compile les plugins, puis lance l'application en mode développement
```

Sans Rust, vous pouvez quand même développer un plugin ou l'interface : `npm run dev -w @etabli/desktop`
n'a pas besoin de Rust pour l'aperçu dans un navigateur (voir docs/02).

## Avant d'ouvrir une demande de fusion

La CI (Windows) refait tout ceci : autant le lancer chez vous d'abord.

```bash
npm run check                 # types : moteur, SDK, plugins
npm test                      # tests des plugins, du SDK et du kit
npm run test:scripts          # tests des scripts de publication
npm run build:plugins         # compile tous les plugins
npm run valider -- --tous     # vérifie chaque plugin
npm run liens                 # vérifie les liens de la documentation

# si vous avez touché au Rust (apps/desktop/src-tauri) :
cargo fmt
cargo clippy --all-targets -- -D warnings
cargo test
```

Puis :

- Une demande de fusion = **un sujet**. Plusieurs idées, plusieurs demandes.
- Décrivez **pourquoi**, pas seulement quoi. Reliez le ticket (`Corrige #12`).
- Ajoutez ou mettez à jour les **tests** et la **documentation** (`docs/`, `README`).
- Ajoutez une ligne dans le **`CHANGELOG.md`** (section « Non publié ») : voir ci-dessous.
- Dites ce que vous **n'avez pas pu vérifier** (par exemple : « pas testé dans l'application installée »).
- Une interface change ? Joignez une capture d'écran.

### Le journal des changements

Chaque changement visible par un utilisateur, un développeur de plugin ou un mainteneur a **une ligne
dans `CHANGELOG.md`** (celui de la racine pour l'application, celui du dossier pour un plugin), sous
« Non publié », dans la bonne rubrique : *Ajouté*, *Modifié*, *Corrigé*, *Supprimé*, *Sécurité*.
Écrivez pour l'utilisateur (« Le débit de tubes accepte les tolérances »), pas pour le code
(« refactor de calcul.ts »). C'est ce texte qui devient les notes de la version publiée.

## Messages de commit

Format [Conventional Commits](https://www.conventionalcommits.org/fr/), **en français** :

```
type(portée): résumé court à l'impératif ou au présent

Corps facultatif : pourquoi ce changement, ce qui change pour l'utilisateur,
ce qui a été vérifié et ce qui ne l'a pas été.
```

Types : `feat` (nouveauté), `fix` (correction), `docs`, `style` (apparence sans changement de logique),
`refactor`, `test`, `ci`, `chore` (version, dépendances, outils), `perf`.
Portées courantes : `moteur`, `sdk`, `ui`, `serveur`, `interface`, un identifiant de plugin
(`agenda`, `finances`…).

Exemples : `fix(agenda): le repos légal ne compte plus deux fois le dimanche`,
`feat(moteur): refuser l'installation d'une version plus ancienne`.

## Comment se passe la relecture

- Un mainteneur répond en général sous quelques jours. Pas de réponse au bout d'une semaine :
  relancez poliment dans le ticket.
- La CI doit être verte. Un mainteneur relit le fond (cohérence avec l'architecture, sécurité,
  exactitude des calculs) puis la forme.
- Pour un **plugin d'un autre auteur**, la relecture regarde en plus : les formules et leurs sources,
  les tests, le manifeste (`npm run valider`), l'absence d'accès sortant, la licence (MIT), et que le
  plugin ne fait pas ce qu'il ne dit pas. Les plugins qui touchent aux **dépendances**, aux
  **permissions** ou à des **données partagées** sont relus avec une attention particulière.
- On peut vous demander des changements : ce n'est pas un refus, c'est la relecture.
- Les demandes de fusion sont **fusionnées en « squash »** : un seul commit propre par demande.

## Publication

Seuls les mainteneurs publient. Le processus complet est dans
[docs/14-publier-une-version.md](docs/14-publier-une-version.md). En résumé :

- **Application** : `CHANGELOG.md` mis à jour, `npm run version:app -- X.Y.Z`, étiquette `vX.Y.Z` →
  la CI compile et signe l'installateur et publie la version, avec pour notes la section du journal.
- **Plugin** : `CHANGELOG.md` du plugin et `version` du manifeste mis à jour, puis `npm run paquet -- <id>` fabrique le
  paquet signé ; le distribuer est l'affaire de son auteur (le moteur ne publie plus dans un catalogue).
- Les versions suivent [SemVer](https://semver.org/lang/fr/) : correction = dernier chiffre, ajout
  compatible = deuxième, changement qui casse quelque chose = premier.

## Licence

En envoyant une contribution, vous acceptez qu'elle soit publiée sous la [licence MIT](LICENSE) du
projet. Ne copiez pas de code, de tables ou de textes dont la licence ne le permet pas : citez la
source et sa licence dans la demande de fusion.
