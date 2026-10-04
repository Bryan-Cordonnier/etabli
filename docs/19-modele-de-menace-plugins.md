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
| 17 | **Usurpation d'identité** : se faire passer pour un autre plugin en appelant un service (`caller`, `appelant` dans le message) | le garde ne recopie que les champs connus ; l'appelant est le plugin du cadre qui a envoyé le message (connu de l'hôte) et le fournisseur reçoit `caller` écrit par le moteur | tests Vitest (garde, routeur, appel complet avec le vrai SDK) | ✅ |
| 18 | **Appel sans autorisation** : appeler un service, une fonction ou un niveau d'accès non permis, ou en contrat ^1 | permission `appelle:<service>:<accès>` par service et par niveau, fonction déclarée par le fournisseur (`functions`), dépendance déclarée ; refus sans révéler si le fournisseur est installé | tests Vitest (routeur) | ✅ |
| 19 | **Amplification** : A appelle B qui appelle C… (boucle, cascade) ; un appel qui en déclenche des centaines | profondeur 1 : le cadre de service d'un fournisseur ne peut émettre aucun appel (`profondeur_max`) ; plafonds de 8 appels en attente par appelant et 20 par fournisseur (`occupe`) ; 4 Mo par appel | tests Vitest | ✅ · plafonds fixes, pas encore réglables |
| 20 | **Déni de service** : un fournisseur qui ne répond jamais, ou qui répond sans fin ; un appelant qui inonde la file | délai de 5 s par défaut (10 s au plus) file d'attente comprise, cadre détruit à l'échéance, la file avance (filet du routeur si l'exécuteur ne rend pas la main) ; réponse bornée à 4 Mo | tests Vitest (délais simulés) | ✅ · un fournisseur qui boucle fige seulement son cadre (voir §4, calcul sans fin) |
| 21 | **Fournisseur hostile** : réponse mal formée, code d'erreur inventé (`service_absent`…), message géant, fenêtre ou notification depuis le cadre invisible | réponse revalidée par le garde (forme, taille, codes permis au fournisseur) ; cadre de service limité à `pluginData`, `provide`, `ready`, `height`, `serviceReady`, `serviceResult` ; mêmes `sandbox`, origine et CSP que les mini-apps | tests Vitest | ✅ · cadre invisible non essayé dans WebView2 ni Android |
| 22 | **Plugin absent, désinstallé, désactivé, trop ancien** pendant un appel | réponse typée (`service_absent`, `contrat_incompatible`), jamais d'exception ; l'appelant garde sa vérité et rejoue | tests Vitest | ✅ |
| 23 | **Écriture appliquée mais réponse perdue** (délai expiré pendant l'exécution) | idempotence par `cle` côté fournisseur (docs/24, A.1.3) | à tester dans chaque fournisseur | ⚠️ à la charge du fournisseur |

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
- **Appels entre plugins** (fait, docs/06) : le cadre invisible d'un fournisseur et la file par fournisseur sont codés et testés
  (garde, routeur, appel complet avec le vrai SDK), mais **pas essayés dans WebView2 ni sur Android** (cadre sans taille, minuteries
  et `MessageChannel` hors écran). Plafonds fixes (20 en attente par fournisseur, 8 par appelant, 5 s par défaut). Le moteur ne
  vérifie pas les arguments : validation par schéma (`functions.*.schema`, docs/24 M12) et contrôle de propriété restent à la charge du
  fournisseur. La révocation d'un plugin (docs/20) n'est pas encore branchée sur « fournisseur actif ». Un fournisseur lent bloque
  seulement sa propre file.
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
| `appelle:<service>:lecture` | appeler les fonctions de **lecture** d'un service offert par un autre plugin | `serviceCall` |
| `appelle:<service>:ecriture` | appeler les fonctions d'**écriture** (ajouter, modifier) de ce service ; ne donne pas la lecture | `serviceCall` |

Sans permission : calculer, afficher, enregistrer ses propres calculs et réglages (`update`, `pluginData`, `title`, `summary`,
`notify`, `height`), et publier un service **déclaré** dans `provides`.

- `appelle:<service>:<accès>` : une ligne par service et par niveau, montrée à l'installation de **chaque** plugin appelant
  (« Ajouter ou modifier des données dans le service « finances » du plugin Finances »), jamais acceptée en bloc. Le niveau d'une
  fonction est fixé par le **fournisseur** dans `functions` ; l'appelant le subit. Réservé aux plugins de contrat ^2.
- La liste vit dans `apps/desktop/src/lib/plugins/permissions.ts` (source unique, lue aussi par `npm run valider`).
- `npm run valider` refuse un plugin ^2 qui utilise une fonction sans la déclarer, ou qui déclare une permission inconnue.
- Une nouvelle permission est un changement d'API : elle se décide ici, avec sa phrase d'explication pour l'utilisateur.
- Les permissions `notifications` et `reseau` prévues pour plus tard (docs/16) s'ajouteront par cette même liste.
