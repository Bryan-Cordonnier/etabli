# Spécification — Établi : mode serveur facultatif, utilisateurs, mobile

Statut : **réponses de Bryan intégrées (3 oct. 2026), en attente de validation finale** (règle d'`AGENTS.md` : pas de gros développement sans spécification validée).
Cible : le dépôt `Bryan-Cordonnier/etabli` (moteur). Cette spécification est écrite ici faute d'accès en écriture à ce dépôt ;
elle sera déplacée dans `docs/` d'Établi à la validation.

---

## 1. Principes (décidés)

1. **Un seul moteur**, public, qui reste fidèle à « zéro collecte, local d'abord ». Le serveur est **facultatif**.
2. **Deux modes, exclusifs, par installation** : *local* (aujourd'hui) ou *serveur*. Pas de mode mixte où certaines
   données seraient locales et d'autres sur le serveur, pas de synchronisation dynamique entre les deux.
3. **Pas de serveur ⇒ pas de base de données ⇒ pas d'utilisateurs.** Fichiers comme aujourd'hui ; l'utilisateur est
   son propre administrateur et gère ses plugins lui-même.
4. **Avec serveur** : un **seul administrateur** ; il crée les utilisateurs et décide des plugins installés. Les
   utilisateurs ne gèrent ni plugins ni comptes.
5. **Auto-hébergé** : le serveur tourne chez l'utilisateur ou dans l'entreprise (PC, NAS, Proxmox). Aucune donnée ne
   quitte le réseau choisi.
6. **Migration à sens unique** : du local vers un serveur (import). Le retour est un export, pas une synchronisation.
7. **Mobile dans le moteur de base** (Android, iPhone), pas dans un fork.
8. **Le fork vient après** : même base, autre nom, plugins propres (voir §10).

## 2. Architecture

```
            ┌────────────── Interface hôte (Svelte) : inchangée, parle à une interface « Fond » ──────────────┐
            │                                   Fond (TypeScript)                                              │
            ├─────────────────────┬──────────────────────────┬─────────────────────────────────────────────┤
            │  FondTauri (local)  │  FondWeb (local, mobile) │  FondServeur (HTTP, connecté)               │
            │  invoke(...) Rust   │  IndexedDB               │  API REST du serveur                         │
            └─────────────────────┴──────────────────────────┴─────────────────────────────────────────────┘
```

- **`Fond`** remplace `apps/desktop/src/lib/api.ts` : documents, réglages, données de plugin, services, liste des
  plugins, informations système. L'hôte ne sait plus s'il est local ou connecté.
- **Crate partagée `etabli-noyau`** (Rust) : format `.etabli`, validation des noms et chemins (`safe_join`), manifestes,
  signatures minisign. Utilisée par l'application Tauri **et** par le serveur.
- **Serveur `etabli-serveur`** : binaire Rust unique, SQLite (documents, utilisateurs, sessions, journal), fichiers de
  plugins sur disque. Seul endroit où une base de données apparaît.
- Les mini-apps ne changent pas (SDK et protocole inchangés, `PROTOCOL_VERSION` 1).

## 3. Mode serveur

### 3.1 Utilisateurs et rôles

| Rôle | Peut |
| --- | --- |
| **admin** (un seul) | tout ; créer, désactiver, réinitialiser le mot de passe d'un utilisateur ; installer, activer, désactiver, retirer un plugin ; exporter la base |
| **utilisateur** | ouvrir les plugins activés pour lui ; créer, modifier, supprimer **ses** calculs et réglages |

- Connexion par identifiant et mot de passe (Argon2id). Session par jeton à durée limitée, renouvelé, révocable.
- Premier lancement du serveur : création de l'admin (mot de passe choisi par la personne, jamais généré en clair dans un journal).
- Un utilisateur ne voit jamais les données d'un autre, sauf dans un **espace partagé** (§3.6).

### 3.2 Plugins

- L'admin dépose ou installe depuis le catalogue (même mécanisme signé minisign qu'aujourd'hui) ; le serveur stocke les
  paquets et **sert les fichiers** des plugins aux clients (remplace le protocole `plugins://`).
- Activation **globale** ou **par utilisateur**, décidée par l'admin.
- Dépendances et services entre plugins : inchangés, évalués côté serveur pour la liste des plugins actifs.

### 3.3 Données

- Un calcul = un enregistrement JSON (même format que le `.etabli`), avec `version` (entier) pour détecter les conflits.
- Écriture : `PUT` avec la version attendue ; si elle a changé, réponse **409** et l'interface propose de recharger ou
  d'écraser. Pas de fusion automatique.
- Réglages de plugin et services publiés (`provide`) : même schéma, par utilisateur.
- **Hors ligne, sur PC comme sur mobile** (décidé) : le client garde une copie locale en lecture et une file d'écritures
  à rejouer à la reconnexion. C'est du cache, pas un second mode de stockage : la source de vérité reste le serveur.
  L'interface indique l'état (connecté, hors ligne, N modifications en attente) et le résultat de la reconnexion.

### 3.6 Espaces partagés (décidé : dans cette série d'étapes)

- Un **espace** est un groupe nommé (un foyer, un atelier, un projet) avec des membres. Créé par l'admin.
- Rôle dans un espace : **lecteur** ou **éditeur**. Chaque calcul, réglage ou donnée appartient soit à un utilisateur
  (privé), soit à un espace.
- Un plugin déclare, dans son manifeste, quelles données peuvent être partagées (ex. dépenses communes : oui ; revenus :
  jamais). Le moteur n'expose à un espace que ce que le plugin autorise.
- Un utilisateur n'a accès à un espace que s'il en est membre ; la liste est vérifiée côté serveur à chaque requête.
- Le « Projets » prévu dans la feuille de route d'Établi s'appuie sur ce mécanisme.

### 3.4 API (esquisse)

```
POST /api/session            connexion → jeton
DELETE /api/session          déconnexion
GET  /api/moi                utilisateur, rôle, plugins actifs
GET  /api/plugins            liste (manifestes) ; GET /plugins/<id>/<chemin> : fichiers
GET/PUT/DELETE /api/documents/<plugin>/<id>
GET  /api/documents?plugin=…&depuis=…       liste (métadonnées), incrémentale
GET/PUT /api/donnees/<nom>   réglages de plugin et services
GET/PUT/DELETE /api/espaces/<id>/documents/<plugin>/<id>   (si membre)
-- admin --
GET/POST/PATCH /api/admin/espaces            création, membres, rôles
GET/POST/PATCH /api/admin/utilisateurs
POST/PATCH/DELETE /api/admin/plugins
GET /api/admin/export        archive de la base
```

### 3.5 Sécurité (non négociable)

- Mots de passe : Argon2id ; limitation des essais par compte et par adresse ; jetons à durée limitée.
- **TLS** : le serveur écoute en HTTP sur une interface choisie ; HTTPS par proxy inverse (Caddy, Nginx) ou VPN
  (Tailscale, WireGuard), documenté pas à pas. Option HTTPS intégré (rustls) en version ultérieure.
- Noms de plugin et de fichier validés comme aujourd'hui ; aucune écriture hors du dossier de données ; taille des
  requêtes bornée.
- Paquets de plugins : signature minisign vérifiée avant installation.
- CSP des mini-apps inchangée : **elles n'ont toujours aucun accès au réseau** ; seul l'hôte parle au serveur.
- Journal d'audit des actions d'administration.
- Revue de sécurité (`/security-review`) avant toute publication d'une version serveur.

## 4. Mode local (inchangé)

Aucun serveur, aucune base : `Documents\Etabli`, `%APPDATA%\Etabli`. L'utilisateur gère ses plugins. Aucune notion
de compte.

## 5. Choix du mode et migration

- Premier lancement : « Utiliser Établi seul sur cet ordinateur » ou « Me connecter à un serveur » (adresse,
  identifiant, mot de passe). Réglable ensuite dans Paramètres.
- **Local → serveur** : assistant « Importer mes données » : envoie documents, réglages et données de plugin vers le
  compte de l'utilisateur, avec un résumé et une confirmation. Les fichiers locaux restent sur le disque (sauvegarde),
  non utilisés tant que l'installation est en mode serveur.
- **Serveur → local** : export d'une archive (admin ou utilisateur), importable en mode local. Pas de bascule dynamique.

## 6. Mobile

- **Mode local sur mobile en v1 (décidé)** : l'application contient des plugins embarqués et stocke dans IndexedDB ; aucun
  serveur requis. **Le mode serveur mobile suit immédiatement** (c'est l'usage principal de Bryan) et ne doit pas être repoussé.
- **Android** : build web de l'hôte emballé par **Capacitor**. **iPhone** : **PWA** (« Sur l'écran d'accueil »), sans compte
  Apple Developer.
- L'hôte devient adaptatif (barre de navigation basse sous 760 px, cibles tactiles) ; l'aperçu rapide, la zone de
  notification et le raccourci global restent propres au bureau.
- **Plugins sur mobile local** : ceux fournis avec le build. Pas d'installation depuis le catalogue sur mobile en local
  (politique des magasins et simplicité) ; en mode serveur, l'admin les distribue.
- **Test préalable** (maquette jetable, avant d'investir) : une alarme locale exacte Android 17 sonne-t-elle application
  fermée avec Capacitor ? Si non, repli sur Tauri mobile.

## 7. Capacités facultatives pour les plugins (permissions du manifeste)

Le manifeste a déjà un champ `permissions`. Deux nouvelles, **refusées par défaut** et accordées par l'admin (ou
l'utilisateur en mode local) :

- `notifications` : message SDK `schedule({ id, at, titre, texte })` et `cancel(id)`. Exécutés par l'hôte (Rust sur PC
  avec zone de notification, Capacitor sur mobile). Rejoués au démarrage depuis les données du plugin.
- `reseau` : message SDK `fetch({ adresse, … })` exécuté **par l'hôte**, uniquement vers des adresses déclarées dans le
  manifeste et acceptées par l'admin (ex. calcul d'itinéraire auto-hébergé).

Utilité générique : rappels d'échéance, imports de données, mises à jour de prix, etc.

## 8. Livraison par étapes (chacune utilisable seule)

| Étape | Contenu | Test |
| --- | --- | --- |
| E1 | Interface `Fond` + `FondTauri` : refonte de `api.ts` sans changement de comportement. `etabli-noyau` extraite. | tests existants, CI Windows |
| E2 | Build web de l'hôte (`FondWeb`, IndexedDB), plugins servis en statique, hôte adaptatif ; cache hors ligne commun à tous les fonds. | Playwright, PWA installable |
| E3 | `etabli-serveur` : utilisateurs, sessions, documents, réglages, services, plugins, export. | `cargo test`, tests d'API, revue de sécurité |
| E4 | `FondServeur` (cache + file d'écritures), écran de connexion, choix du mode, pages d'administration (utilisateurs, plugins), import local → serveur. | parcours Playwright + essai par Bryan |
| E5 | **Mobile** : Capacitor Android (local, puis serveur) et PWA iPhone. Test d'alarme Android en premier. | essai sur le téléphone de Bryan |
| E6 | Espaces partagés (§3.6) et pages d'administration associées. | tests d'API (droits), Playwright |
| E7 | Permissions `notifications` et `reseau`. | essai sur appareil |
| E8 | Habillage (nom, icône, plugins par défaut) paramétrable → base du fork. | build des deux produits |

Tenu à jour à chaque étape : `CHANGELOG.md`, documentation `docs/`, tests. Aucune étape ne casse la lecture des
`.etabli` existants.

## 9. Décisions et points restants

Décidés : hors ligne PC et mobile (cache + file d'écritures) ; serveur Rust + SQLite, TLS par proxy ou VPN ; partage
d'espaces dans cette série ; mode local possible sur mobile en v1, mode serveur mobile juste après.

Restants :
1. **Choix par plugin** (stockage serveur ou local au poste, fixé par l'admin) : proposé **non en v1** ; à reprendre plus tard si besoin.
2. **Accès au dépôt** : l'application GitHub Claude doit être installée sur `Bryan-Cordonnier/etabli` pour que j'y pousse
   (aujourd'hui : lecture seule). Branche proposée : `moteur-serveur`, sans demande de fusion tant que Bryan ne la demande pas.

## 10. Fork (après E7)

Même dépôt de base copié sous un autre nom : identité (nom, icône, identifiants de bundle, dossier de données), plugins
par défaut propres (agenda, travail, budget), dépôt privé. Les correctifs du moteur sont repris depuis Établi par
fusion régulière ; le moteur ne contient aucune référence au produit dérivé.
