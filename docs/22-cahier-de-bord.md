# Cahier de bord

Journal du projet pour Bryan : où on en est, ce qui est décidé, ce qui reste à faire **à la main** (ce qu'un agent ne peut pas faire à ta place), et ce qui reste à faire côté code.
À tenir à jour à chaque étape. Les cases cochées sont faites.

Dernière mise à jour : 4 octobre 2026.

**Règle de lecture :** « poussé » = sur GitHub dans une branche, sans demande de fusion (PR). « Non vérifié » = jamais essayé sur un vrai appareil ou dans l'application ; seule la CI ou tes essais le diront.

## 1. À faire à la main (Bryan)

### 1.1 Fusions sur GitHub — ordre conseillé
Les PR ouvertes ont une CI verte. Les autres branches sont poussées sans PR : demande-moi de les ouvrir (je résous les conflits sur `CHANGELOG.md` et les docs).

| Ordre | Branche | État |
| --- | --- | --- |
| 1 | `retour-arriere-revocation` — [PR #23](https://github.com/Bryan-Cordonnier/etabli/pull/23) | CI verte |
| 2 | `docs-etat` — [PR #24](https://github.com/Bryan-Cordonnier/etabli/pull/24) | CI verte |
| 3 | `essai-isolation` — [PR #25](https://github.com/Bryan-Cordonnier/etabli/pull/25) | CI verte (62 essais) |
| 4 | `cahier` (ce document) | sans PR |
| 5 | `sdk-source` | sans PR, testé en local |
| 6 | `cle-rotation` → `sources-configurables` → `contrat-v1-arret` (empilées, dans cet ordre) | sans PR ; **Rust Tauri jamais compilé** |
| 7 | `web-origines-locales` puis `android-origine-par-plugin` | sans PR ; Java jamais compilé |
| 8 | `spec-distributions`, `spec-budget` | documentation seulement |
| 9 | `appels-entre-plugins` → `essai-appels-navigateur` → `outils-money-civil` → `plugin-finances` (empilées, dépendent de `spec-budget`) | sans PR ; voir §6 |

- [ ] Fusionner dans cet ordre (squash uniquement, c'est le réglage du dépôt).
- [ ] Fermer la PR #13 (Capacitor 8, Dependabot) : à reprendre avec le mobile.
- [ ] Regarder l'alerte Dependabot « modérée » sur `main` (Sécurité › Dependabot, alerte n° 1).

### 1.2 Publication
- [ ] Lancer **une fois** le workflow « Catalogue (renouvellement) » (Actions) pour passer au catalogue signé.
- [ ] Publier les nouvelles versions des plugins (manifestes `apiVersion` ^2 + permissions) et de l'application (tag de version) : seul toi peux pousser un tag.
- [ ] Rotation des clés : créer la clé racine **toi-même** (procédure dans [docs/14](14-publier-une-version.md)), puis faire une répétition à blanc. Tant que ce n'est pas fait, le comportement actuel est inchangé.

### 1.3 Essais à faire toi-même (jamais vus par un agent)
- [ ] Application PC : fenêtre des permissions à l'installation, retour arrière d'un plugin, plugin révoqué, boîte « Source du catalogue » (Paramètres › Mises à jour).
- [ ] Application PC sous WebView2 : les mini-apps, le cadre invisible des appels entre plugins.
- [ ] Android : lancer « Android (APK de test) » avec « APK de sonde du pont », installer `etabli-sonde-pont.apk`, m'envoyer une capture (procédure : `tools/sonde-pont-android/README.md`). Puis l'APK normal : mini-apps et essai d'alarme.

### 1.4 Décisions à prendre
- [ ] **Les 14 questions de `docs/23` §12** (distributions : noms, identifiants, clé racine commune ou par produit, hébergement des paquets privés…).
- [ ] **Les questions de [docs/20](20-spec-mises-a-jour-registre.md)** : clé d'origine dans la première liste de clés, durée de vie d'une clé, repli vers GitHub si la source personnalisée est injoignable, révocations d'une source personnalisée, dates d'arrêt du contrat ^1 (proposition : avertir tout de suite, refuser dans six mois), canal bêta.
- [ ] **Questions de [docs/21](21-spec-licences-baux.md)** et validation de la spec [docs/18](18-spec-plateforme-comptes-licences.md) : le service de licences n'est pas codé sans cela.
- [ ] **Profondeur des appels entre plugins** : aujourd'hui un plugin qui répond à un appel ne peut pas en émettre un autre. Ton exemple « `finances` ajoute un rappel dans l'`agenda` pendant qu'`paie` l'appelle » demande une profondeur de 2. À trancher : accepter 2, ou faire appeler l'agenda par `paie` elle-même.
- [ ] **Taux de paie** à confirmer avec un contrat ou un bulletin (heures supplémentaires : majorations légales, pas « au taux de la mission »).
- [ ] **Isolation sur Android** : l'origine par plugin est faite (branche `android-origine-par-plugin`), à valider par les essais du §1.3.
- [ ] **Offre gratuite** : existe-t-elle, avec quelles limites ?
- [ ] **Nom commercial** du moteur (voir §3). Vérifier INPI, TMview et les domaines toi-même.
- [ ] Plugin volontairement hostile dans l'essai d'isolation : un contrôle de sécurité a interrompu l'agent qui l'écrivait. À écrire toi-même ou à abandonner (les 62 essais actuels utilisent les vrais plugins).

### 1.5 Plus tard
- [ ] Domaine, hébergement (VPS), courriels : après le nom ; homelab pour les essais.
- [ ] Dépôt de marque (INPI) du nom choisi.
- [ ] Comptes développeur Apple (iPhone) quand le mobile arrivera.
- [ ] Dépôt `orga/` de l'ERP : non lu (pas dans la session). Il contient les règles métier (centimes, calculs figés, livre de police, numérotation légale, URSSAF) à reprendre dans l'ERP-moteur.

## 2. Décisions prises

| Sujet | Décision |
| --- | --- |
| Moteur | Open source, licence **Apache-2.0** ; marque protégée à part |
| Plugins | Dépôts privés (un par plugin) ; la logique s'exécute toujours **en local**, jamais sur le serveur |
| Serveur | Comptes, droits et données seulement |
| Licences | **Bail de 48 h** (réglable par offre) ; **sièges nominatifs d'abord**, flottants ensuite ; licence personnelle gratuite pour Bryan |
| Données | Jamais supprimées : export et lecture restent possibles après expiration |
| Horloge | L'horloge locale n'est jamais crue |
| Vente | France uniquement pour l'instant ; traduction dès le départ, français seul |
| Commissions | Acceptées sur les plugins tiers (à construire plus tard) |
| IA | Pas de plugins d'IA pour l'instant |
| Plateformes | **PC d'abord** ; mobile ensuite ; iPhone prévu (application de compte, sans achat intégré) ; Linux repoussé |
| Hébergement du code | Reste sur GitHub ; adresses configurables plus tard |
| **Produits** | **Distributions** à la manière d'une distribution Linux : moteur = noyau, plugins = paquets, catalogues = dépôts, distribution = sélection de paquets + nom + logo + dépôts par défaut. **Pas de profils**, pas de forks. Établi, ERP, budget sont des distributions du même moteur |
| ERP | Une **distribution du moteur Établi** (pas l'application PHP `retux-panel`, dont la pile et les règles sont mises de côté) |
| Mises à jour | Chaque plugin se met à jour **indépendamment**, même dans un pack ; une dépendance = besoin de la fonction d'un autre plugin |
| Plugins budget | `agenda` (rappels pour les autres), `finances` (l'argent réel, appelable pour ajouter/retirer, aussi pour l'ERP), `paie` (particuliers : missions d'intérim, CDI, CDD, revenus récurrents programmables ; un seul plugin à modules internes), `budget` (prévisions, virements, courbes). `paie` ne calcule pas de gain net : `budget` estime ce qui reste |
| Rappels | **Notifications seulement, pas d'alarmes, téléphone seulement** (pas de rappel sur PC) |
| Application budget | S'appelle **Quotidien** (usage personnel, non commercial), **PC d'abord** |
| Ordre de développement | Fondations d'abord (outils communs, appel de fonction entre plugins, `finances`, `agenda`), puis `paie`, puis `budget` |
| Réemploi de l'ancien cœur Rust | Recommandation (à confirmer) : réécriture en TypeScript, les 18 tests Rust rejoués comme « vecteurs d'or » ; mutualiser `money` et `civil` dans `@etabli/ui` |

## 3. Nom commercial du moteur (recherche, non tranché)

- Écartés ou risqués : Atelio, Brik/Briks, Haya, Fabriko, Gabari (pris), Tree, linked.app, Anticip, BeFast, **Kotidien** (un logiciel libre de finances personnelles porte déjà ce nom).
- Gabario : rappelle l'image de Mario. Tablier : possible mais commun.
- **Maillon** : le meilleur jusqu'ici ; `maillon.fr` est pris (pièces de cycles), Maillon.io (SaaS) est fermé.
- Non testés : Citius, Celero, Rask, Anello, Ligilo, Vinco, Syndes, Primeur, Anticipo, Praesto, Adelanto, Burin, Tenon, Ouvra, Arca, Kelvo, Nodo, Forja.
- Critères : général, original, clair, simple, mémorisable ; un mot courant ne gêne pas.

## 4. Journal des avancées

### 4.1 Fusionné dans `main`
- Serveur facultatif `etabli-serveur` (axum, SQLite, Argon2id) et crate commune `etabli-noyau` : [docs/17](17-serveur.md).
- Interface « Fond » (Tauri, web IndexedDB, serveur avec cache hors ligne) ; version web et PWA ; emballage Android (Capacitor, APK de test par la CI).
- Isolation : un domaine par plugin sur le serveur, service worker par plugin, garde des messages, **permissions v1** (`apiVersion` ^2) ; 7 plugins officiels migrés : [docs/19](19-modele-de-menace-plugins.md).
- **Catalogue signé** (séquence, expiration à 30 jours, révocations, anti-retour-arrière, renouvellement mensuel) : [docs/20](20-spec-mises-a-jour-registre.md).
- Essai d'alarme Android natif (vérifié par Bryan).
- Spécifications : docs 18 à 21.

### 4.2 Poussé, en attente de fusion (voir §1.1)
- **PR #23** retour arrière d'un plugin, plugins révoqués. **PR #25** essai d'isolation en CI (62 vérifications dans Chromium). **PR #24** documentation d'état.
- **`sdk-source`** : le SDK n'accepte la liaison avec le moteur que depuis la fenêtre parente (une mini-app voisine ne peut plus s'interposer). Testé : essai d'isolation 62/62.
- **`cle-rotation`** : liste de clés de publication signée par une clé racine, plusieurs racines possibles, clé retirée refusée ; script `scripts/cles-rotation.mjs` ; procédure dans docs/14. Comportement inchangé tant que la racine n'est pas créée.
- **`sources-configurables`** : adresse du catalogue réglable (https, signature obligatoire pour une source personnalisée), canal bêta préparé mais refusé tant qu'aucun catalogue bêta n'existe.
- **`contrat-v1-arret`** : dates d'avertissement/refus du contrat ^1 portées par le catalogue signé (`scripts/arret-contrat.mjs`) ; aucune date fixée.
- **`web-origines-locales`** : **faille trouvée et corrigée** dans la version web sans serveur (un plugin pouvait lire l'application et l'IndexedDB). Sonde CORS + sandbox sans origine ; essai automatisé 14/14.
- **`android-origine-par-plugin`** : origine `https://<id>.plugins.localhost` par plugin sur Android, et retrait de trois interfaces natives de Capacitor visibles de tous les cadres. Sonde `tools/sonde-pont-android/`. **Java jamais compilé avec le vrai SDK.**
- **`spec-distributions`** (`docs/23`) et **`spec-budget`** (`docs/24`) : spécifications seulement.
- **`appels-entre-plugins`** : un plugin appelle la fonction d'un autre (manifeste `functions`/`serviceEntry`, permission `appelle:<service>:<accès>`, SDK `services.call`, routeur dans le moteur, cadre invisible, identité de l'appelant imposée, file par fournisseur, délais et plafonds). 186 tests Vitest ; les 7 plugins officiels restent compatibles. **Cadre invisible jamais essayé dans un vrai moteur.**
- **`essai-appels-navigateur`**, **`outils-money-civil`**, **`plugin-finances`** : voir §6.

### 4.3 Modifications de l'application de base
- Fenêtre d'installation d'un plugin : permissions demandées (et, sur `appels-entre-plugins`, une phrase par permission d'appel).
- Page Catalogue : pastille « Révoqué », bouton « Revenir à la … ».
- Réglages : plugins épinglés, plugin révoqué toujours désactivé ; (en attente) boîte « Source du catalogue ».
- Export de fichiers : 8 extensions autorisées, 20 Mo ; documents et données de plugin plafonnés à 5 Mio.
- Scripts : `paquet-plugin.mjs`, `valider-plugin.mjs`, `nouveau-plugin.mjs`, `catalogue-signe.mjs`.

## 5. Reste à faire côté code (agent)
- Service de licences ([docs/21](21-spec-licences-baux.md)) — **après** ta validation.
- Distributions (`docs/23`) — après tes réponses (étape 1 de la migration : config générée identique à l'actuelle).
- Plugins `agenda` (avec permission `notifications`, rappels téléphone), `paie`, `budget` ; import de fichier, extension `.ics` à l'export, point d'entrée au démarrage, schémas de fonctions vérifiés par le moteur, simulateur de service pour les tests (`docs/24` annexe, manques M5 à M16).
- Application mobile complète (en dernier).
- Plugin hostile dans l'essai d'isolation (voir §1.4).

## 6. Fondations pour Quotidien (poussées, empilées sur `appels-entre-plugins`)

- **`essai-appels-navigateur`** (`c1d84fe`) : `scripts/essai-appels.mjs` joue les appels entre plugins dans un vrai Chromium (succès, rejeu, argument invalide, permission manquante, fournisseur absent, contrat incompatible, appels simultanés en file, délai, plafond, isolation du cadre de service) : 59 essais sur 59. **Défaut trouvé et corrigé** : les arguments d'un appel arrivaient en proxys Svelte que `postMessage` refuse de copier (seuls les appels sans argument passaient) ; les tests unitaires ne pouvaient pas le voir. Playwright n'est pas une dépendance : `PLAYWRIGHT_PATH` et `ETABLI_CHROMIUM` (docs/02).
- **`outils-money-civil`** (`24da3a7`) : `money` (centimes entiers, produits en BigInt, arrondi « demi-haut ») et `civil` (jours civils, fin de mois, UTC ↔ Europe/Paris, changements d'heure 2026-2027) dans `@etabli/ui` : 179 tests dont le vecteur d'or de paie (net 429,43 €).
- **`plugin-finances`** (`455ccbe`) : plugin `finances` (argent réel, registre en ajout seulement, annulation par écriture inverse), service `finances@1` (10 fonctions, clé d'idempotence, erreurs typées), tableau de bord (solde, courbe, dépenses du mois, dernières écritures, saisie rapide), composants `LineChart`/`DonutChart` dans `@etabli/ui`, 46 tests. Limite : 3,5 Mo (~9 000 écritures), avertissement dès 2,8 Mo, erreur claire au-delà (aucune perte silencieuse). **Hors catalogue officiel** (privé par défaut). Pas d'appel à `agenda`.
- Hors périmètre corrigé : `scripts/nouveau-plugin.mjs` générait des versions de dépendances qui faisaient échouer `npm install`.

### À valider (choix de conception de `finances`)
1. L'annulation reprend le même instant que l'écriture annulée (les soldes de toutes les dates redeviennent ceux d'avant l'erreur).
2. Pas d'écriture à plus de 24 h dans le futur (le prévu va dans `budget`) ; pas d'écriture avant l'ouverture du compte ; une catégorie « dépense » refuse une entrée d'argent.
3. Un plugin n'annule que ses propres écritures ; l'interface de Finances peut tout annuler.
4. Arguments stricts : un champ inconnu est refusé (un appelant plus récent que le fournisseur est refusé, pas ignoré).
5. Les réponses d'écriture ajoutent `rejoue: true/false` (contrat à figer).
6. **Piège du moteur à corriger avant usage réel** : si la lecture des réglages échoue, `pluginData.load` renvoie `null`, comme pour « rien d'enregistré » ; un `comptes.creer` suivant écraserait le vrai registre. Il faut distinguer l'erreur de l'absence côté moteur (noté dans docs/10).

### Pas fait
Export, import, clôture d'année ; mini-apps Écritures, Comptes et catégories, Courbes ; plugins `agenda`, `paie`, `budget`.

## 7. Ce qui n'a pas été vérifié
- Rien sous WebView2 ni dans l'application Tauri : les essais automatiques tournent sur Chromium (Linux).
- Le Rust de l'application n'est compilé que par la CI Windows. Les branches `cle-rotation`, `sources-configurables`, `contrat-v1-arret` en ajoutent beaucoup : des corrections sont possibles à l'ouverture des PR.
- Le Java d'Android (`android-origine-par-plugin`) : jamais compilé avec le vrai SDK ; la CI de l'APK fera foi.
- Rien de l'interface n'a été vu à l'écran.
- Le cadre invisible des appels entre plugins n'a tourné que dans Chromium (59 essais) : jamais sous WebView2 ni Android.
- Le tableau de bord de `finances` n'a été vu que sur une capture Chromium à 1280 px (pas le thème sombre, pas le mobile, pas la saisie à la souris) ; couleurs du donut non validées pour le contraste.
- `npm ci` du lockfile avec `plugins/finances` non rejoué en CI (entrées ajoutées à la main).
