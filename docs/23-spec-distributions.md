# 23 — Spécification : distributions (plusieurs applications, un seul moteur) — brouillon

> **Note du 6 octobre 2026.** `catalogue.rs`, `CLES_RACINES` et le registre ont été retirés du moteur (étiquette Git `legacy/store-before-cut`) ; l'installation est dans `installation.rs`, avec la seule clé de `tauri.conf.json`. Le reste de ce brouillon est à relire avec le nouveau plan (docs/22, section 9).

> **Statut : brouillon, documentation seulement.** Aucun code n'est écrit. Ce document détaille l'étape 4 de
> [18](18-spec-plateforme-comptes-licences.md) (« Distributions »). Il propose une architecture ; les choix qui engagent Bryan
> sont en **questions ouvertes** (section 12). Aucune étape de code ne démarre avant sa validation.
> Deux branches de code non fusionnées touchent au même terrain : `cle-rotation` (clés de signature, docs/20 §3.5) et
> `sources-configurables` (source de catalogue réglable, docs/20 §3.2). Ce document les suppose fusionnées ; si elles ne le sont
> pas, les sections 5.3 et 5.4 sont à relire.

## 1. Le besoin

Bryan veut, à partir du **même moteur**, produire plusieurs applications :

| Distribution (nom de travail) | Public | Particularités connues |
| --- | --- | --- |
| **Établi** | élèves, ateliers (aujourd'hui) | catalogue public, plugins de chaudronnerie |
| **Établi d'essai** | personnes qui testent avant d'acheter | à définir (section 12, Q3) |
| **ERP de l'entreprise de Bryan** | les employés | une **version du moteur Établi** : même architecture (serveur, application, mises à jour, plugins) ; son contenu métier est à spécifier par Bryan |
| **Budget / agenda personnel** | usage personnel, Android et Windows | alarmes natives (branche `alarme-natif`), données privées |

Décision déjà prise ([18](18-spec-plateforme-comptes-licences.md) §1) : *un moteur, plusieurs produits ; seuls le nom, le logo, les
plugins embarqués et le registre changent ; configuration de build, pas de copie du code.* Ce document en fait une conception.

## 2. Principe

Une **distribution** est un **dossier de configuration** (`distributions/<id>/`) qui décrit un produit. Le moteur (dépôt actuel)
ne contient aucune règle propre à un produit : tout ce qui diffère est lu dans cette configuration, **au build** pour ce qui engage
la confiance (identité, clés, adresses de mise à jour), **à l'exécution** seulement pour ce qui est cosmétique ou réglable par
l'utilisateur. Construire un produit = `npm run distribution -- <id>` puis le build habituel.

Règle de sécurité : **ce qui décide de la confiance (clés publiques, adresses officielles de mise à jour et de catalogue) est figé au
build et jamais modifiable par un plugin, un document ou un fichier de données.** L'utilisateur avancé peut ajouter une source
(`sources-configurables`), pas retirer les clés de la distribution.

## 3. Inventaire : ce qui est écrit en dur aujourd'hui

À lire ou à rechercher avant de coder (relevé fait dans le dépôt, non exhaustif) :

| Élément | Où | Devient |
| --- | --- | --- |
| Nom du produit (`Etabli`), titre des fenêtres (`Établi`, `Aperçu rapide — Établi`) | `apps/desktop/src-tauri/tauri.conf.json` | `nom`, `nomCourt` |
| Identifiant d'application `fr.etabli.desktop` | `tauri.conf.json` | `identifiant` |
| Clé publique de mise à jour et adresse `latest.json` du dépôt GitHub | `tauri.conf.json` (`plugins.updater`) | `miseAJour` |
| Adresse du catalogue, du dépôt, clés de confiance (`CLES_RACINES`) | `src-tauri/src/catalogue.rs`, `crates/noyau` | `registre` |
| Liens vers le dépôt (aide, signaler un problème) | `SettingsPage.svelte`, README, SUPPORT | `liens` |
| Clé publique par défaut du serveur (« celle d'Établi ») | `crates/serveur`, option `--cle-publique` | `registre.cles` |
| Dossiers `%APPDATA%\Etabli`, `Documents\Etabli`, variable `ETABLI_DATA_DIR` | `paths.rs` | dérivés de `identifiant` |
| Base IndexedDB `etabli`, préfixe `etabli.` (localStorage), cache du service worker `etabli-…` | `fond/web.ts`, `storage.ts`, `scripts/construire-web.mjs` | dérivés de `identifiant` |
| Extensions `.etabli`, `.etabli-plugin`, événements `etabli:*`, protocole `plugins://` | Rust et interface | **restent communs** (format du moteur, section 6) |
| Icônes (`src-tauri/icons`, `public-web`), thèmes, nom dans le manifeste PWA | dossiers d'icônes | `habillage` |
| Plugins livrés d'office, catalogue, installateur | CI, `build:plugins` | `plugins` |
| Scripts de publication (`notes-version`, `latest-json`, `paquet-plugin`, `nouveau-plugin`) citent le dépôt | `scripts/*.mjs` | lisent la distribution |

## 4. Ce qui varie, ce qui reste commun

| Varie selon la distribution | Reste commun (moteur) |
| --- | --- |
| nom, logo, icônes, thèmes par défaut, couleur d'accent | SDK, protocole, garde des messages, isolation des plugins ([19](19-modele-de-menace-plugins.md)) |
| identifiant d'application, dossiers de données | format des documents `.etabli`, migrations ([08](08-documents-donnees.md)) |
| plugins livrés d'office, catalogue et registre | format du paquet `.etabli-plugin`, signature minisign, catalogue signé, révocation |
| clés de confiance et de mise à jour, adresse de mise à jour | noyau Rust (`crates/noyau`), vérifications, anti-retour-en-arrière |
| serveur par défaut (adresse), mode par défaut (local ou serveur) | `etabli-serveur`, comptes, sessions, quotas |
| plateformes produites (Windows, Android, web) | interface hôte Svelte, kit `@etabli/ui` |
| fonctions activées (catalogue public oui/non, installation par fichier oui/non, essai limité) | permissions v1 et leur liste |

Un correctif de sécurité du moteur profite donc à **toutes** les distributions par une simple reconstruction.

## 5. Architecture proposée

### 5.1 Fichier de configuration : `distributions/<id>/distribution.json`

Un seul format, validé par un schéma (`distributions/schema.json`) et par `npm run distribution -- --verifier`.

```json
{
  "schema": 1,
  "id": "etabli",
  "nom": "Établi",
  "nomCourt": "Etabli",
  "identifiant": "fr.etabli.desktop",
  "description": "Boîte à outils de chaudronnerie",
  "habillage": { "icones": "icones/", "logo": "logo.svg", "theme": "clair", "couleur": "#2b63d9", "themesEnPlus": ["themes/atelier.json"] },
  "plateformes": ["windows", "android", "web"],
  "plugins": {
    "livresDOffice": ["maths", "tolerie"],
    "installationParFichier": true
  },
  "registre": {
    "catalogue": "https://github.com/etable-project/etable/releases/download/catalogue/catalogue.json",
    "canal": "stable",
    "clesRacines": ["<clé publique minisign>"],
    "sourcesPersonnalisees": true
  },
  "miseAJour": {
    "cle": "<clé publique minisign de mise à jour>",
    "adresses": ["https://github.com/etable-project/etable/releases/latest/download/latest.json"]
  },
  "serveur": { "mode": "local", "adresseParDefaut": null },
  "liens": { "depot": "https://github.com/etable-project/etable", "aide": "…" },
  "fonctions": { "catalogue": true, "essai": null }
}
```

Les valeurs ci-dessus sont celles d'Établi aujourd'hui ; les autres distributions ne sont que des exemples de forme. Rien n'y est
un secret : **les clés privées ne sont jamais dans le dépôt** (secrets GitHub par produit, voir 5.6).

### 5.2 Où elle est lue

| Moment | Qui lit | Comment | Pour quoi |
| --- | --- | --- | --- |
| **Build** (avant tout) | `scripts/distribution.mjs` | lit `distributions/<id>/`, vérifie le schéma, écrit des fichiers générés (non versionnés) | tout ce qui suit |
| Build Tauri | Tauri CLI | `tauri build --config <fichier généré>` : la fusion JSON de Tauri remplace `productName`, `identifier`, titres, `plugins.updater` ; icônes copiées dans `src-tauri/icons` | identité, clé et adresse de mise à jour |
| Compilation Rust | `build.rs` | lit le fichier généré, l'inclut dans le binaire (`include_str!`) ; module `distribution.rs` expose une structure constante | `paths.rs` (dossiers), `catalogue.rs` (registre, clés), nom des fenêtres |
| Interface (Vite) | `define` de Vite à partir du fichier généré | constante `DISTRIBUTION` importée par `lib/distribution.ts` ; la version desktop la relit par une commande `distribution_info` pour ne pas dupliquer la vérité | libellés, liens, thèmes, plugins d'office, noms de stockage web |
| Version web | `scripts/construire-web.mjs` | embarque la distribution dans `index.html`/manifeste PWA et filtre les plugins copiés | PWA, plugins du produit |
| Serveur | option `--distribution <fichier>` (ou compilé) | lit clé publique par défaut et plugins d'office | `crates/serveur` |
| **Exécution** | l'utilisateur | réglages classiques (thème, source supplémentaire) | uniquement ce que `fonctions` autorise |

Un point de lecture unique : `lib/distribution.ts` côté interface, `distribution.rs` côté Rust. **Aucun autre fichier ne contient le nom d'un produit.**

### 5.3 Identifiant d'application et données

Dossiers, IndexedDB, préfixes de stockage, cache du service worker, nom de la tâche de démarrage et raccourci global par défaut sont
**dérivés de `identifiant`** : deux produits s'installent côte à côte sans jamais lire les données de l'autre. Les formats de fichiers
restent ceux du moteur ; ouvrir un `.etabli` d'un produit dans l'autre est une décision de produit (Q8). La protection contre
deux instances (si elle existe) devient propre à chaque identifiant.

### 5.4 Catalogue, clés de confiance, sources (liens avec docs/20)

- Chaque distribution a **son catalogue signé** (`catalogue-<id>.json`) et **ses clés** : un plugin vendu pour l'ERP ne doit pas
  pouvoir être installé dans Établi par erreur, ni l'inverse. Les clés racines de `registre.clesRacines` remplacent `CLES_RACINES`
  (branche `cle-rotation`) ; la rotation de docs/20 §3.5 s'applique **par distribution**.
- La branche `sources-configurables` donne déjà « une source = adresse https + clé publique ». La distribution fournit la **source par
  défaut** ; `sourcesPersonnalisees: false` retire le réglage (ERP fermé : seule la source de l'entreprise).
- Une même organisation peut vouloir **plusieurs sources** (public et privé) : docs/20 Q5 (pas de repli automatique d'un registre privé
  vers le public) reste la règle.
- Un plugin déclare, dans son manifeste, le drapeau facultatif **`distributions`** (liste d'identifiants, absent = toutes) et
  `plateformes` ([18](18-spec-plateforme-comptes-licences.md) §8). Le drapeau est un **filtre d'affichage et d'installation**, jamais une
  garantie de sécurité : la garantie vient des catalogues et des clés séparés. `npm run valider` vérifie que le drapeau n'est pas
  contredit par le catalogue.

### 5.5 Mises à jour de l'application

Une clé de mise à jour **par produit** (`miseAJour.cle`), un `latest.json` par produit, donc un canal de mise à jour par produit. Un produit ne
peut pas recevoir la mise à jour d'un autre (clé publique différente). Corollaire : la perte d'une clé n'affecte qu'un produit, la
procédure de [14](14-publier-une-version.md) devient « par produit » (Q5 : une racine commune ou une racine par produit ?).

### 5.6 Dépôts de plugins privés (un par plugin) et CI par produit

- **Problème à ne pas sous-estimer** : une Release d'un dépôt GitHub **privé** n'est pas téléchargeable sans identifiant. L'application
  d'un utilisateur ne peut pas la lire. Les paquets d'un plugin privé doivent donc être **déposés par la CI du plugin** dans le registre
  du produit (hébergement statique, ou service de licences de [21](21-spec-licences-baux.md) avec paquets chiffrés remis contre un bail).
  Le dépôt privé garde le code ; le registre ne reçoit que le paquet signé.
- Chaîne proposée : dépôt du plugin (CI) → paquet signé par la clé de publication **du produit visé** → dépôt/hébergement du registre du
  produit → catalogue signé régénéré. La clé de publication est un **secret d'environnement GitHub** par produit (accès restreint).
- Moteur : un seul dépôt. `.github/workflows` lit `distributions/*/` pour produire une matrice (installateur Windows, APK, version
  web) ; étiquettes de version préfixées par produit (`etabli-v0.6.0`, `erp-v0.1.0`) ; notes de version et `latest.json` par produit.
  Les contrôles (`check`, `test`, Rust) tournent **une fois** sur le moteur, puis le build de chaque distribution les réutilise.
- Un nouveau produit = un dossier `distributions/<id>/` + ses secrets + ses étiquettes. Pas de nouveau dépôt de moteur.

### 5.7 Thèmes et habillage

Le moteur a quatre thèmes et des thèmes JSON importés ([00](00-contexte.md)). La distribution fixe le thème par défaut, la couleur d'accent,
le logo et les icônes (Windows, Android, PWA) et peut livrer des thèmes en plus. Les **jetons** de thème (`--…`) sont communs : une
distribution ne change que leurs valeurs, jamais la structure (sinon les plugins se casseraient).

### 5.8 Serveur par défaut

`serveur.mode` fixe le mode au premier lancement (local, ou serveur à l'adresse fournie : écran de connexion directement). Pour l'ERP et
le budget personnel, l'adresse par défaut est celle du serveur de l'organisation ou de la personne ; l'utilisateur ne la saisit pas. Le
serveur (`etabli-serveur`, [17](17-serveur.md)) reste le même programme ; sa distribution lui donne la clé publique des paquets acceptés
et les plugins d'office. Droits et licences : [18](18-spec-plateforme-comptes-licences.md) et [21](21-spec-licences-baux.md), inchangés.

## 6. Fork ou configuration : comparaison honnête

Bryan a écrit « fork ». Les deux voies peuvent donner trois applications ; elles ne coûtent pas la même chose dans la durée.

| Critère | **Distribution par configuration** (recommandée) | **Fork vrai** (un dépôt copié par produit) |
| --- | --- | --- |
| Mise en place | 1 à 3 semaines de travail sur le moteur avant la première distribution (section 8) | immédiate : on copie, on renomme |
| Correctifs de sécurité (isolation, signatures, serveur) | un seul correctif, reconstruction de chaque produit | à reporter à la main dans **chaque** fork ; oubli = faille silencieuse |
| Divergence | impossible par construction : la différence tient dans un dossier | inévitable : au bout de quelques mois les forks ne fusionnent plus sans conflits |
| Fonctions propres à un produit | un plugin (ou un drapeau de distribution) | n'importe quoi, y compris du code qui ne peut jamais revenir dans le moteur |
| Liberté de modifier le moteur pour un produit | limitée : tout changement du moteur concerne tous les produits | totale |
| Confidentialité du code d'un produit | le moteur est ouvert (Apache-2.0) ; le propre du produit vit dans des plugins privés | un fork privé garde tout, y compris les modifications du moteur |
| Tests et CI | une suite de tests, une matrice de builds | une CI par fork, tests à maintenir trois fois |
| Charge de maintenance pour une personne seule | faible et constante | croît à chaque fork ; la fusion perpétuelle devient un travail à part entière |
| Retour arrière | changer la distribution | changer de dépôt |

**Avis : configuration.** Bryan est seul, étudiant, et la sécurité des plugins est la promesse centrale : un fork multiplie les endroits
où un correctif peut manquer. Un fork n'est justifié que si un produit a besoin de **modifier le moteur lui-même** d'une façon qui ne peut pas
devenir un drapeau, une extension ou un plugin ; dans ce cas, le plus sûr est un fork **mince** (quelques fichiers) rebasé à chaque version du
moteur, avec une CI qui échoue si le fork a plus de N versions de retard. C'est la question Q1.

## 6 bis. Décision : distributions, pas de profils (4 octobre 2026)

Bryan a écarté l'idée d'une seule application à **profils** (regrouper des plugins par usage, un profil actif à la fois) et retient les **distributions** séparées : une application par produit (Établi, ERP, budget), même moteur, configuration propre.

Raisons retenues : le nom, le logo, les plugins livrés et la licence d'un produit vendu doivent être ceux de ce produit seul, sans sélecteur de profils ; deux distributions installées côte à côte (identifiants et dossiers de données distincts) s'ouvrent en même temps sans développement supplémentaire. Les mises à jour des plugins restent indépendantes dans tous les cas.

Les profils sont mis de côté pour l'instant. Modèle retenu, à la manière d'une distribution Linux : le moteur est le noyau, les plugins sont les paquets, les catalogues sont les dépôts, et une distribution est une sélection de paquets avec un nom, un logo et des dépôts par défaut.

## 7. Ce qu'il faut pour intégrer l'ERP

L'ERP est traité ici comme **une distribution du même moteur**, pas comme une application externe : même architecture (serveur,
application, mises à jour, plugins), mêmes règles d'isolation. Il n'y a **pas d'intégration par API avec une autre application**, et
rien n'est supposé sur le contenu d'un autre dépôt de Bryan. Ce que Bryan doit fournir (spécification, pas code) :

1. **Les modules métier** de l'ERP, sous forme de **plugins** : pour chacun, ce que l'utilisateur fait, les données manipulées, les
   écrans (maquette) — dans l'esprit de [13](13-specs-a-venir.md).
2. **Les données** : ce qui doit être stocké sur le serveur, volume, durée de conservation, besoin d'import de données existantes
   (si oui : de quelle source et sous quel format, à décrire par Bryan).
3. **Les utilisateurs et les droits** : qui voit quoi. Le moteur offre un administrateur et des utilisateurs par serveur
   ([17](17-serveur.md)) ; les rôles à l'intérieur d'une organisation (plusieurs administrateurs, droits par module) sont prévus par
   [18](18-spec-plateforme-comptes-licences.md) mais **pas codés** : l'ERP les rend nécessaires.
4. **Les contraintes de déploiement** : un serveur pour l'entreprise (où, sauvegardes, accès extérieur), Windows seulement ou aussi mobile.

Si Bryan veut **réutiliser des définitions** déjà écrites ailleurs (vocabulaire, listes, règles), il indique les fichiers à lire ; ils seront
lus alors, sans présupposé. Aucun plugin d'ERP n'est conçu avant ces éléments.

## 8. Étapes de migration

Chaque étape laisse Établi inchangé pour l'utilisateur (même nom, même identifiant, mêmes données, mêmes mises à jour).

| # | Étape | Critère de sortie |
| --- | --- | --- |
| 0 | Fusion de `cle-rotation` et `sources-configurables` ; décisions Q1 à Q6 | branches fusionnées, questions tranchées |
| 1 | Schéma `distribution.json` + `distributions/etabli/` reproduisant **exactement** les valeurs actuelles ; `scripts/distribution.mjs` (génération + vérification) ; test : la config générée est identique octet pour octet à l'actuelle | `tauri.conf.json` généré = actuel ; aucun changement visible |
| 2 | Interface : `lib/distribution.ts` ; noms de stockage et libellés dérivés ; **migration** : la clé de stockage d'Établi reste `etabli`, aucune donnée déplacée | tests Vitest ; données d'un utilisateur existant intactes |
| 3 | Rust : `distribution.rs`, `paths.rs` et `catalogue.rs` lisent la distribution ; fenêtres et titres | `cargo test` (CI Windows) ; installation par-dessus une version existante conserve tout |
| 4 | Serveur et version web : option `--distribution`, filtrage des plugins, manifeste PWA | tests API ; version web identique |
| 5 | CI : matrice par distribution, étiquettes préfixées, secrets par environnement, notes et `latest.json` par produit | publication à blanc d'une seconde distribution factice (« essai ») |
| 6 | Première vraie nouvelle distribution (Établi d'essai ou budget personnel) | installée côte à côte avec Établi sans interférence |
| 7 | ERP : spécification (section 7), puis plugins privés et registre privé | hors de ce document |

## 9. Risques

| Risque | Gravité | Parade |
| --- | --- | --- |
| Changer `identifiant` ou le nom du dossier de données d'Établi par erreur : **les utilisateurs perdent l'accès à leurs calculs** | haute | étape 1 : test d'égalité exact ; étape 3 : essai d'installation par-dessus l'ancienne version ; **jamais** de renommage de données sans migration écrite |
| Mauvaise clé de mise à jour embarquée : les utilisateurs ne reçoivent plus de mises à jour | haute | la clé est vérifiée par un test (la clé publique générée doit correspondre à celle déclarée) ; publication d'essai avant chaque nouvelle distribution |
| Un plugin d'un produit installé dans un autre | moyenne | catalogues et clés séparés ; le drapeau `distributions` n'est qu'un filtre |
| Fuite d'une clé de publication partagée entre produits | haute | une clé par produit, secrets d'environnement ; rotation de [14](14-publier-une-version.md) par produit |
| Plugins privés non téléchargeables (dépôts privés) | haute | déposer les paquets signés dans le registre (5.6), ne pas compter sur les Releases privées |
| Ajouter des drapeaux à tout (« if produit == … ») : le moteur devient illisible | moyenne | règle : un écart entre produits est soit une donnée de la distribution, soit un plugin ; jamais une branche de code sur l'identifiant du produit |
| Surcharge de la CI (N produits x N plateformes) | moyenne | contrôles une fois, builds en parallèle, produits construits seulement sur étiquette |
| Marque : Établi (Apache-2.0) autorise d'autres à produire des distributions | moyenne | la marque (nom, logo) est protégée à part ([18](18-spec-plateforme-comptes-licences.md) §1) ; fichier de règles d'usage de la marque |
| Dérive entre `distribution.json` et la documentation / les scripts | faible | `npm run liens` et un test qui compare les champs du schéma à la liste de l'inventaire |

## 10. Ce qui n'est pas dans ce document

Licences, baux, sièges et paquets chiffrés ([21](21-spec-licences-baux.md)) ; format du catalogue signé et rotation des clés
([20](20-spec-mises-a-jour-registre.md)) ; isolation ([19](19-modele-de-menace-plugins.md)) ; contenu métier de l'ERP et de l'application de
budget/agenda ; prix et offres.

## 11. Vérifications à faire avant de coder

- Relire `tauri.conf.json`, `paths.rs`, `catalogue.rs`, `fond/web.ts`, `storage.ts`, `scripts/*.mjs` pour confirmer l'inventaire de la
  section 3 (relevé par recherche de texte, pas par exécution).
- Vérifier que `tauri build --config <fichier>` fusionne bien le fichier généré avec `tauri.conf.json` (comportement documenté de Tauri 2,
  **non essayé ici**) et que les icônes et le plugin de mise à jour acceptent une clé et des adresses fournies ainsi.
- Vérifier qu'un seul `Cargo.lock` suffit pour plusieurs distributions (les dépendances sont les mêmes).

## 12. Questions ouvertes (pour Bryan)

1. **Fork ou configuration ?** Je recommande la configuration (section 6). Voulez-vous tout de même un vrai fork pour l'un des produits ?
   Si oui, lequel, et pour quelle modification du moteur qu'un plugin ou un drapeau ne permettrait pas ?
2. **Noms et identifiants** : noms définitifs des produits (Établi, Établi d'essai, ERP, budget/agenda) et identifiants d'application
   (`fr.etabli.desktop` reste inchangé pour Établi ?). Un identifiant publié est très difficile à changer ensuite.
3. **Établi d'essai** : qu'est-ce qui le distingue d'Établi ? Durée limitée, plugins limités, calculs non enregistrés, filigrane ?
   Le passage d'Établi d'essai à Établi garde-t-il les données ?
4. **Côte à côte** : un même poste doit-il pouvoir avoir plusieurs distributions installées (données séparées, section 5.3) ?
5. **Clés** : une clé racine commune à tous les produits (une seule à protéger, mais une compromission touche tout) ou une racine par
   produit (plus sûr, plus de travail) ? Et les clés de mise à jour : une par produit (proposé) ?
6. **Registre des plugins privés** : où héberger les paquets signés des plugins privés (GitHub public « sans liste » avec paquets chiffrés,
   hébergement statique à vous, ou le futur service de licences de docs/21) ?
7. **Plateformes par produit** : l'ERP est-il Windows seulement ? Le budget/agenda doit-il sortir d'abord sur Android ? (Le drapeau
   `plateformes` du manifeste en dépend.)
8. **Fichiers entre produits** : un `.etabli` créé dans un produit s'ouvre-t-il dans un autre, ou chaque produit garde-t-il ses fichiers ?
9. **Source personnalisée** (`sourcesPersonnalisees`) : autorisée pour Établi (comme aujourd'hui) ; interdite pour l'ERP ?
10. **Mode par défaut** : l'ERP et le budget personnel démarrent-ils directement sur l'écran de connexion d'un serveur ? Qui héberge le serveur
    du budget personnel (vous, le téléphone seul sans serveur) ?
11. **Marque** : quelles règles d'usage du nom et du logo d'Établi pour d'autres distributions (y compris les vôtres) ?
12. **ERP — contenu** : quels modules en premier, quels utilisateurs, quelles données, quelles contraintes d'hébergement (section 7) ? Et
    voulez-vous que je lise des fichiers précis d'un autre dépôt vous appartenant pour reprendre du vocabulaire (lesquels) ?
13. **Calendrier** : cette étape passe-t-elle avant ou après l'hôte mobile (étape 5 de docs/18) ? Le budget/agenda personnel dépend de
    l'hôte mobile et des alarmes natives.
14. **Version minimale du moteur** : une distribution peut-elle rester sur une ancienne version du moteur (verrouillée) ou suit-elle toujours la
    dernière ? (Impact direct sur la charge de maintenance, section 6.)
