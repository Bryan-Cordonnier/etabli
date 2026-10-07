# 19 — Isolation des plugins : modèle de menace et permissions

> **Note du 7 octobre 2026.** Le projet Android Capacitor (`apps/mobile`) et son origine par plugin (`OriginesPlugins.java`) sont supprimés : Android tourne avec Tauri mobile, qui sert les plugins par le protocole `plugins` dans des cadres à origine opaque, comme sous Windows, et ferme le pont natif aux cadres (docs/26). Les passages ci-dessous sur Capacitor sont historiques.

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
| 1 | Lire le jeton ou les calculs de l'application | origine distincte + `sandbox` ; pas de `window.parent` | essai navigateur automatique (CI) (`parent.document`, `parent.localStorage` : `SecurityError`) | ✅ |
| 2 | Lire les données d'un autre plugin | une origine par plugin (nom d'hôte) | essai navigateur automatique (CI) : le `localStorage`, le cookie et le cache de `maths` est invisible depuis `tolerie` ; test serveur : un hôte ne sert que son plugin | ✅ serveur · ⚠️ voir §4 |
| 3 | Sortir des données par le réseau (`fetch`, image, WebSocket, formulaire) | CSP `connect-src 'none'`, `img-src 'self' data: blob:`, `form-action 'none'` | essai navigateur automatique (CI) (fetch, image bloqués) | ✅ |
| 4 | Sortir des données en naviguant le cadre vers un site extérieur | `frame-src` de l'application limité aux origines de plugins | essai navigateur automatique (CI) | ✅ à surveiller |
| 5 | Ouvrir une fenêtre ou un onglet | `sandbox` sans `allow-popups` | essai navigateur automatique (CI) (`window.open` bloqué) | ✅ |
| 6 | Écrire un programme sur le disque (`.exe`, `.bat`, `.ps1`, `.lnk`…) via « Enregistrer sous » | liste blanche d'extensions (`csv tsv dxf json txt svg md xml ics`), noms sans chemin ni caractère interdit, taille ≤ 20 Mo — côté interface **et** côté Rust | tests Vitest (35) et Rust | ✅ |
| 7 | Remplir le disque ou la base | plafonds : 4 Mo par message (interface), 5 Mo par document ou réglage (Rust), quota par utilisateur (serveur) | tests | ✅ |
| 8 | Faire planter le moteur par un message mal formé (référence circulaire, type inconnu, `__proto__`) | le garde ne jette jamais d'exception ; types listés explicitement | tests Vitest | ✅ |
| 9 | Demander ce qui n'est pas déclaré (imprimer, enregistrer, copier, envoyer, ouvrir des réglages) | permission requise par type de message (plugins de contrat ^2) | tests Vitest + validateur | ✅ ^2 · ⚠️ ^1 (voir §4) |
| 10 | Publier un service sans l'avoir déclaré (`provides`) | refus dans le garde | tests Vitest | ✅ |
| 11 | S'agrandir sans limite pour masquer l'interface | hauteur bornée (160 à 20 000 px) | tests Vitest | ✅ |
| 12 | Injecter du HTML dans la fiche imprimée | sans objet depuis le 6 octobre 2026 : le moteur n'imprime plus de fiche (message `print` retiré) | — | ✅ supprimé |
| 13 | Fichiers d'un plugin servis par le mauvais hôte, évasion de chemin (`../`), hôte étranger (« DNS rebinding ») | contrôle du nom d'hôte, chemins sûrs, liens symboliques refusés | tests serveur (hôtes étrangers, 404) | ✅ |
| 14 | Données d'un fournisseur de service hostile consommées par d'autres plugins | données JSON seulement, jamais de HTML ; Svelte échappe | revue (aucun `{@html}` dans les plugins du dépôt) | ⚠️ voir §4 |
| 15 | Boucle infinie ou calcul sans fin | hors de portée du moteur seul (le cadre est un processus du navigateur) | — | ❌ voir §4 |
| 16 | Faux dialogues ou fausses alertes à l'intérieur de son cadre | limité à la surface du cadre | — | ⚠️ accepté |
| 17 | **Usurpation d'identité** : se faire passer pour un autre plugin en appelant un service (`caller`, `appelant` dans le message) | le garde ne recopie que les champs connus ; l'appelant est le plugin du cadre qui a envoyé le message (connu de l'hôte) et le fournisseur reçoit `caller` écrit par le moteur | tests Vitest (garde, routeur, appel complet avec le vrai SDK) | ✅ |
| 18 | **Appel sans autorisation** : appeler un service, une fonction ou un niveau d'accès non permis, ou en contrat ^1 | permission `appelle:<service>:<accès>` par service et par niveau, fonction déclarée par le fournisseur (`functions`), dépendance déclarée ; refus sans révéler si le fournisseur est installé | tests Vitest (routeur) | ✅ |
| 19 | **Amplification** : A appelle B qui appelle C… (boucle, cascade) ; un appel qui en déclenche des centaines | profondeur 1 : le cadre de service d'un fournisseur ne peut émettre aucun appel (`profondeur_max`) ; plafonds de 8 appels en attente par appelant et 20 par fournisseur (`occupe`) ; 4 Mo par appel | tests Vitest | ✅ · plafonds fixes, pas encore réglables |
| 20 | **Déni de service** : un fournisseur qui ne répond jamais, ou qui répond sans fin ; un appelant qui inonde la file | délai de 5 s par défaut (10 s au plus) file d'attente comprise, cadre détruit à l'échéance, la file avance (filet du routeur si l'exécuteur ne rend pas la main) ; réponse bornée à 4 Mo | tests Vitest (délais simulés) | ✅ · un fournisseur qui boucle fige seulement son cadre (voir §4, calcul sans fin) |
| 21 | **Fournisseur hostile** : réponse mal formée, code d'erreur inventé (`service_absent`…), message géant, fenêtre ou notification depuis le cadre invisible | réponse revalidée par le garde (forme, taille, codes permis au fournisseur) ; cadre de service limité à `pluginData`, `provide`, `ready`, `height`, `serviceReady`, `serviceResult` ; mêmes `sandbox`, origine et CSP que les mini-apps | tests Vitest | ✅ · cadre invisible essayé dans Chromium (isolation identique à la mini-app), pas dans WebView2 ni Android |
| 22 | **Plugin absent, désinstallé, désactivé, trop ancien** pendant un appel | réponse typée (`service_absent`, `contrat_incompatible`), jamais d'exception ; l'appelant garde sa vérité et rejoue | tests Vitest | ✅ |
| 23 | **Écriture appliquée mais réponse perdue** (délai expiré pendant l'exécution) | idempotence par `cle` côté fournisseur (docs/24, A.1.3) | à tester dans chaque fournisseur | ⚠️ à la charge du fournisseur |
| 24 | **Rappels détournés** : un plugin programme des notifications trompeuses, en grand nombre, ou efface celles d'un autre | permission `notifications` montrée à l'installation ; le moteur ne remplace que la liste DU plugin demandeur (jamais celle d'un autre) ; 200 rappels, textes bornés, 60 jours d'horizon ; seules des notifications (jamais d'alarme) ; l'Agenda, seul fournisseur du service `rappels`, filtre et borne ce que lui confient les autres | `lib/mobile/rappels.test.ts`, `garde.test.ts` | ⚠️ un plugin qui détient la permission peut afficher le texte qu'il veut dans une notification : à lire à l'installation |

## 4. Limites connues et ce qu'il reste à faire

- **Version web « Établi seul » (hors serveur) et Android local** : constat fait dans Chromium (`npm run essais:web`, §7). Avant
  correctif, le cadre gardait l'origine de l'application (`allow-same-origin`) : une sonde hostile lisait `parent.document`,
  `parent.localStorage`, les cookies, l'IndexedDB `etabli` (tous les calculs) et le stockage d'une autre sonde. Correctif :
  au démarrage, `pluginsList()` envoie une sonde (`fond/sondeCors.ts`) ; si l'hébergement envoie `Access-Control-Allow-Origin`
  sous `plugins/`, les mini-apps passent en **origine opaque** (`sandbox="allow-scripts"`), comme avec le serveur. Les pages
  de plugins reçoivent aussi une CSP sans réseau par `<meta>` (`scripts/construire-web.mjs`).
  **Android, limite levée** (branche `android-origine-par-plugin`) : la WebView de Capacitor n'envoie pas l'en-tête CORS, mais
  elle laisse l'application **intercepter les requêtes** (`shouldInterceptRequest`). `OriginesPlugins.java` sert chaque plugin sur
  sa propre origine `https://<id>.plugins.localhost`, depuis les ressources embarquées (`public/plugins/<id>/`), sans aucun accès
  réseau : mêmes règles d'identifiant et de chemin que le serveur (`CheminsPlugins.java`, testé par JUnit et par
  `scripts/android-origines.test.mjs`), mêmes types de fichiers, même CSP sans réseau (+ `frame-ancestors` limité à l'application),
  `nosniff`, `Referrer-Policy: no-referrer`, `Origin-Agent-Cluster` (pas de `document.domain`). Tout ce qui vise le domaine des
  plugins sans être une demande valide reçoit un 404 local (hôte étranger, sous-domaine, port, identifiants, `..`, `%2e`, `%2f`,
  double encodage, fichier caché, dossier). Côté interface, `fond/web.ts` interroge le plugin Capacitor local `EtabliOrigines`
  (`mobile/origines.ts`) ; s'il confirme, `MiniAppFrame` utilise cette origine avec `sandbox="allow-scripts allow-same-origin"`
  (comme en mode serveur), sans sonde CORS. S'il ne répond pas (ancienne application, pont natif retiré), le repli ci-dessous
  s'applique.
  **Pont natif (alarmes, notifications)**, lu dans `@capacitor/android` 7.6.9 : le pont `androidBridge` est enregistré par
  `addWebMessageListener` avec des règles d'origine (`https://localhost` seulement) et refuse les sous-cadres (`isMainFrame`) :
  un cadre de mini-app ne l'atteint pas. **Mais** (1) si la WebView n'a pas cette fonction, ou si l'enregistrement échoue,
  Capacitor se rabat sur `addJavascriptInterface("androidBridge")`, visible de **tous** les cadres ; (2) `CapacitorHttp` et
  `CapacitorCookies` ajoutent toujours `CapacitorHttpAndroidInterface` et `CapacitorCookiesAndroidInterface` de la même façon
  (`CapacitorCookies.setCookie` écrit un cookie pour une adresse quelconque). Correctif : `MainActivity` retire ces trois
  interfaces JavaScript juste après la création du pont. Le pont à règles d'origine n'en est pas affecté ; dans le cas de repli,
  les fonctions natives cessent de répondre (échec fermé) au lieu d'être offertes aux mini-apps. **Non vérifié sur un appareil** :
  la sonde `tools/sonde-pont-android` (APK de sonde, procédure dans son README) le fait en deux minutes.
  **Reste ouvert** : (a) un hébergement statique **sans** CORS ; (b) **hors ligne** sur le web (la sonde échoue, et les
  sous-ressources d'un cadre opaque ne passent pas par le service worker) : dans ces cas la version web retombe sur la
  même origine, sans isolation. Acceptable tant que seuls les plugins officiels, construits avec l'application, y vivent
  (aucune installation possible) ; **inacceptable** si un tiers y apparaît. Piste : charger les modules du plugin
  depuis l'hôte (`fetch` + import map de `data:`), ou un serveur local qui envoie l'en-tête. La CSP en `<meta>` ne protège que
  les pages construites par nous : elle n'arrête pas un plugin hostile qui livrerait sa propre page.
  Limites propres à Android : la version web de l'application n'a **pas** de CSP (`frame-src` n'y limite donc rien : un cadre peut
  naviguer vers un site extérieur, où il reste confiné par son `sandbox`) ; les cookies `Domain=plugins.localhost` seraient
  partagés entre plugins (comme avec un serveur dont les plugins partagent un domaine) ; les requêtes `Range` ne sont pas gérées.
- **Contrat ^1** (anciens plugins) : permissions non contrôlées, mais les plafonds et la forme des messages le sont. Le moteur
  signale ces plugins à l'installation. **Mécanisme d'arrêt codé** : le catalogue signé porte `contrats` (par version majeure : `avertir_des`, `refuser_des`, `message`). À partir de `avertir_des`, l'installation d'un plugin ^1 affiche l'avertissement ; à partir de `refuser_des`, le moteur refuse d'installer ou de mettre à jour un plugin ^1 depuis le catalogue (les plugins déjà installés continuent, un fichier `.etabli-plugin` choisi par l'utilisateur reste permis). Sans entrée, rien n'est jamais refusé : **aucune date n'est fixée** (question ouverte, docs/20). Procédure : [14](14-publier-une-version.md), `scripts/arret-contrat.mjs`. **Retiré du moteur le 6 octobre 2026** avec le catalogue (étiquette Git `legacy/store-before-cut`) : il n'y a plus d'arrêt de contrat côté Etable.
- **Origine par plugin** : exige un enregistrement DNS générique (`*.plugins.exemple.fr`) et, en HTTPS, un certificat générique.
  Sans cela, les mini-apps fonctionnent en cadre opaque, **en ligne seulement**. Sur une machine seule, `*.localhost` suffit.
- **Fiche imprimée** : le HTML du plugin est inséré dans un cadre sans script mais de l'origine de l'application. Une politique
  CSP propre à ce cadre (aucune ressource externe) reste à ajouter et à tester en conditions réelles.
- **Services entre plugins** : un plugin qui publie (`provide`) peut mentir ; les consommateurs doivent traiter ces données comme
  non fiables (validation, bornes). Une validation de schéma par service est à prévoir.
- **Appels entre plugins** (fait, docs/06) : le cadre invisible d'un fournisseur et la file par fournisseur sont codés et testés
  (garde, routeur, appel complet avec le vrai SDK), et **essayés dans Chromium** (`node scripts/essai-appels.mjs` : 45 essais, voir [02](02-environnement.md)), mais **pas dans WebView2 ni sur
  Android** (cadre sans taille, minuteries et `MessageChannel` hors écran). Plafonds fixes (20 en attente par fournisseur, 8 par appelant, 5 s par défaut). Le moteur ne
  vérifie pas les arguments : validation par schéma (`functions.*.schema`, docs/24 M12) et contrôle de propriété restent à la charge du
  fournisseur. La révocation d'un plugin (docs/20) n'est pas encore branchée sur « fournisseur actif ». Un fournisseur lent bloque
  seulement sa propre file.
- **Calcul sans fin / mémoire** : le cadre peut figer sa propre mini-app. Piste : un chien de garde qui demande un signe de vie
  régulier et recharge le cadre sinon.
- **Tests dans la CI** : l'essai `scripts/essais-isolation.mjs` (workflow `.github/workflows/isolation.yml`, Ubuntu, sur chaque
  demande de fusion qui touche `crates/`, `packages/`, `apps/desktop/src`, `plugins/` ou `scripts/`) est automatique. Il génère une
  clé de signature temporaire, empaquette `maths` et `tolerie`, lance le binaire `etabli-serveur` (origine par plugin
  `http://{id}.localhost:4321`), crée l'administrateur et installe les plugins par l'API, puis pilote Chromium (Playwright) :
  `parent.document`, `parent.localStorage` et `top.document` : `SecurityError` ; `fetch`, XHR, WebSocket, image, formulaire et
  `window.open` bloqués (CSP et `sandbox`), aucune requête partie vers l'extérieur ; `localStorage`, cookie et cache de `maths`
  invisibles depuis `tolerie` ; hôtes étrangers et évasions de chemin : 404 ; 18 messages hostiles envoyés par le port privé du
  cadre (type inconnu, `__proto__`, référence circulaire, 5 Mo, `.exe`, service non déclaré, permission absente…), tous refusés
  par le garde, qui borne ensuite une hauteur démesurée. Lancer chez soi : `node scripts/essais-isolation.mjs`
  (`--sans-build` pour réutiliser les builds, `--pause` pour garder le serveur ouvert ; `ETABLI_CHROMIUM` désigne un Chromium
  déjà installé). Il n'y a pas encore de plugin de test *volontairement hostile* : les essais se font avec les vrais plugins,
  depuis leur cadre, ce qui suffit pour l'isolation mais pas pour tester un plugin qui détournerait le SDK. Hors de portée de
  l'essai : l'application de bureau (Tauri/WebView2), la version web « Établi seul » et la fiche imprimée.

## 5. Chaîne d'approvisionnement

- Perte ou vol de la clé de signature : voir [14](14-publier-une-version.md). Prévoir la **rotation de clé** et la **révocation**
  d'un plugin (liste signée de versions interdites) dans l'étape « mise à jour et registre » de [18](18-spec-plateforme-comptes-licences.md).
- Une mise à jour qui demande **de nouvelles permissions** est présentée à l'utilisateur avant d'être installée (fait).

## 6. Permissions v1

Déclarées dans `permissions` du manifeste ; un plugin de contrat `"apiVersion": "^2"` est contrôlé strictement.

| Permission | Autorise | Message du SDK |
| --- | --- | --- |
| `fichiers` | « Enregistrer sous » (formats de données seulement) | `saveFile` |
| `presse-papiers` | copier du texte | `copy` |
| `envoi` | envoyer des données à une autre mini-app | `send` |
| `reglages` | ouvrir les réglages d'un autre plugin | `openSettings` |
| `notifications` | programmer des rappels (notifications) sur le téléphone | `reminders` |
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

## 7. Essai de la version web (sans serveur)

`npm run essais:web` (`scripts/essais-origines-web.mjs`, après `npm run build:web`) sert la version construite, y ajoute deux
plugins « sondes » hostiles et joue 14 essais dans Chromium (Playwright, `ETABLI_CHROMIUM` ou `/opt/pw-browsers/chromium`) :
hébergement avec CORS (cadre opaque : ni `parent`, ni cookies, ni IndexedDB de l'hôte, ni stockage de l'autre sonde, aucune
requête vers un site extérieur, un vrai plugin s'affiche) et hébergement sans CORS (repli sur la même origine, les failles
sont **listées** comme limites, non bloquantes). Les décisions pures sont testées par Vitest (`sondeCors.test.ts`,
`web.test.ts`) et `scripts/construire-web.test.mjs`. Non automatisé en CI (Playwright n'est pas une dépendance du dépôt).
Non vérifié : Android réel (Java compilé par la CI seulement ; sonde `tools/sonde-pont-android`), Safari/Firefox, mode hors ligne.
