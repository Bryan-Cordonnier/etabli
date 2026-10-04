# 19 — Isolation des plugins : modèle de menace et permissions

Établi exécute du code qu'il ne maîtrise pas : les mini-apps. Aujourd'hui ce sont celles de Bryan ; demain, celles de tiers.
**L'isolation doit donc être vraie dès maintenant**, pas ajoutée le jour où un tiers publie. Ce document dit contre qui on se
défend, comment, et ce qui est vérifié par un test.

## 1. Adversaire

Un **plugin hostile** : publié (ou piraté) avec une signature valide, installé par l'utilisateur de bonne foi. Il peut exécuter
du JavaScript arbitraire dans son cadre et envoyer n'importe quel message au moteur. Il n'a, au départ, que son cadre.
Hors périmètre : un moteur compromis, une clé de signature volée (voir §5), un navigateur ou un système d'exploitation vulnérable.

## 2. Les défenses, de l'extérieur vers l'intérieur

1. **Signature** : le moteur n'installe qu'un paquet signé par une clé de confiance.
2. **Cadre isolé** : `<iframe sandbox>` ; page servie avec une politique CSP sans réseau (`default-src 'none'`, `connect-src 'none'`).
3. **Origine propre à chaque plugin** (serveur) ou origine opaque (bureau) : aucun stockage, cookie ni cache partagé.
4. **Port privé** : le cadre ne parle au moteur que par un `MessagePort` créé pour lui.
5. **Garde de l'hôte** (`plugins/garde.ts`) : chaque message est contrôlé (forme, taille, permission) avant tout traitement.
6. **Cœur Rust** : il ne fait confiance à personne ; formats d'export, noms de fichiers et tailles y sont revérifiés.
7. **Permissions** déclarées au manifeste, montrées à l'utilisateur avant l'installation.

## 3. Scénarios et état

| # | Menace | Défense | Vérifié par | État |
| --- | --- | --- | --- | --- |
| 1 | Lire le jeton ou les calculs de l'application | origine distincte + `sandbox` ; pas de `window.parent` | essai navigateur (`parent.document`, `parent.localStorage` : `SecurityError`) | ✅ |
| 2 | Lire les données d'un autre plugin | une origine par plugin (nom d'hôte) | essai navigateur : le `localStorage` de `maths` est invisible depuis `tolerie` ; test serveur : un hôte ne sert que son plugin | ✅ serveur · ⚠️ voir §4 |
| 3 | Sortir des données par le réseau (`fetch`, image, WebSocket, formulaire) | CSP `connect-src 'none'`, `img-src 'self' data: blob:`, `form-action 'none'` | essai navigateur (fetch, image bloqués) | ✅ |
| 4 | Sortir des données en naviguant le cadre vers un site extérieur | `frame-src` de l'application limité aux origines de plugins | essai navigateur | ✅ à surveiller |
| 5 | Ouvrir une fenêtre ou un onglet | `sandbox` sans `allow-popups` | essai navigateur (`window.open` bloqué) | ✅ |
| 6 | Écrire un programme sur le disque (`.exe`, `.bat`, `.ps1`, `.lnk`…) via « Enregistrer sous » | liste blanche d'extensions (`csv tsv dxf json txt svg md xml`), noms sans chemin ni caractère interdit, taille ≤ 20 Mo — côté interface **et** côté Rust | tests Vitest (35) et Rust | ✅ |
| 7 | Remplir le disque ou la base | plafonds : 4 Mo par message (interface), 5 Mo par document ou réglage (Rust), quota par utilisateur (serveur) | tests | ✅ |
| 8 | Faire planter le moteur par un message mal formé (référence circulaire, type inconnu, `__proto__`) | le garde ne jette jamais d'exception ; types listés explicitement | tests Vitest | ✅ |
| 9 | Demander ce qui n'est pas déclaré (imprimer, enregistrer, copier, envoyer, ouvrir des réglages) | permission requise par type de message (plugins de contrat ^2) | tests Vitest + validateur | ✅ ^2 · ⚠️ ^1 (voir §4) |
| 10 | Publier un service sans l'avoir déclaré (`provides`) | refus dans le garde | tests Vitest | ✅ |
| 11 | S'agrandir sans limite pour masquer l'interface | hauteur bornée (160 à 20 000 px) | tests Vitest | ✅ |
| 12 | Injecter du HTML dans la fiche imprimée | cadre d'impression sans script (`sandbox` sans `allow-scripts`) ; CSP de l'application | lecture du code | ⚠️ voir §4 |
| 13 | Fichiers d'un plugin servis par le mauvais hôte, évasion de chemin (`../`), hôte étranger (« DNS rebinding ») | contrôle du nom d'hôte, chemins sûrs, liens symboliques refusés | tests serveur (hôtes étrangers, 404) | ✅ |
| 14 | Données d'un fournisseur de service hostile consommées par d'autres plugins | données JSON seulement, jamais de HTML ; Svelte échappe | revue (aucun `{@html}` dans les plugins du dépôt) | ⚠️ voir §4 |
| 15 | Boucle infinie ou calcul sans fin | hors de portée du moteur seul (le cadre est un processus du navigateur) | — | ❌ voir §4 |
| 16 | Faux dialogues ou fausses alertes à l'intérieur de son cadre | limité à la surface du cadre | — | ⚠️ accepté |

## 4. Limites connues et ce qu'il reste à faire

- **Version web « Établi seul » (hors serveur) et Android local** : les plugins livrés avec l'application ont l'origine de
  l'application (`isolationComplete` faux). Acceptable tant que seuls des plugins officiels y sont (aucune installation n'y est
  possible), **inacceptable** le jour où un tiers y apparaît. Correctif prévu : servir les plugins depuis des origines séparées.
- **Contrat ^1** (anciens plugins) : permissions non contrôlées, mais les plafonds et la forme des messages le sont. Le moteur
  signale ces plugins à l'installation. Prévoir une date après laquelle le catalogue refuse les plugins ^1.
- **Origine par plugin** : exige un enregistrement DNS générique (`*.plugins.exemple.fr`) et, en HTTPS, un certificat générique.
  Sans cela, les mini-apps fonctionnent en cadre opaque, **en ligne seulement**. Sur une machine seule, `*.localhost` suffit.
- **Fiche imprimée** : le HTML du plugin est inséré dans un cadre sans script mais de l'origine de l'application. Une politique
  CSP propre à ce cadre (aucune ressource externe) reste à ajouter et à tester en conditions réelles.
- **Services entre plugins** : un plugin qui publie (`provide`) peut mentir ; les consommateurs doivent traiter ces données comme
  non fiables (validation, bornes). Une validation de schéma par service est à prévoir.
- **Calcul sans fin / mémoire** : le cadre peut figer sa propre mini-app. Piste : un chien de garde qui demande un signe de vie
  régulier et recharge le cadre sinon.
- **Tests dans la CI** : les essais d'isolation ci-dessus sont faits à la main avec un vrai navigateur. À automatiser (un plugin
  de test hostile, un navigateur sans interface, le binaire du serveur) pour qu'une régression soit vue avant publication.

## 5. Chaîne d'approvisionnement

- Perte ou vol de la clé de signature : voir [14](14-publier-une-version.md). Prévoir la **rotation de clé** et la **révocation**
  d'un plugin (liste signée de versions interdites) dans l'étape « mise à jour et registre » de [18](18-spec-plateforme-comptes-licences.md).
- Une mise à jour qui demande **de nouvelles permissions** est présentée à l'utilisateur avant d'être installée (fait).

## 6. Permissions v1

Déclarées dans `permissions` du manifeste ; un plugin de contrat `"apiVersion": "^2"` est contrôlé strictement.

| Permission | Autorise | Message du SDK |
| --- | --- | --- |
| `fichiers` | « Enregistrer sous » (formats de données seulement) | `saveFile` |
| `impression` | imprimer une fiche d'atelier | `print` |
| `presse-papiers` | copier du texte | `copy` |
| `envoi` | envoyer des données à une autre mini-app | `send` |
| `reglages` | ouvrir les réglages d'un autre plugin | `openSettings`, `addMachine` |

Sans permission : calculer, afficher, enregistrer ses propres calculs et réglages (`update`, `pluginData`, `title`, `summary`,
`notify`, `height`), et publier un service **déclaré** dans `provides`.

- La liste vit dans `apps/desktop/src/lib/plugins/permissions.ts` (source unique, lue aussi par `npm run valider`).
- `npm run valider` refuse un plugin ^2 qui utilise une fonction sans la déclarer, ou qui déclare une permission inconnue.
- Une nouvelle permission est un changement d'API : elle se décide ici, avec sa phrase d'explication pour l'utilisateur.
- Les permissions `notifications` et `reseau` prévues pour plus tard (docs/16) s'ajouteront par cette même liste.
