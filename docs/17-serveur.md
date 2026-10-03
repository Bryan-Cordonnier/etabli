# 17 — Le serveur facultatif (`etabli-serveur`)

Établi fonctionne sans serveur, comme avant : tout reste sur l'ordinateur. Le serveur est pour qui veut
**plusieurs comptes**, ses **calculs au même endroit** sur plusieurs appareils, ou un **administrateur** qui choisit les plugins
(un atelier, une classe, une maison). Il s'héberge soi-même : aucune donnée ne quitte la machine choisie.
Conception et décisions : [16-spec-serveur-utilisateurs-mobile.md](16-spec-serveur-utilisateurs-mobile.md).

> **État (E3)** : le serveur existe et est testé (API, sécurité, base). L'application ne sait pas encore s'y connecter : l'écran de
> connexion, le choix du mode et le cache hors ligne arrivent à l'étape E4.

## Principes

- **Un mode par installation** : local (fichiers) ou serveur. Pas de mélange, pas de synchronisation dynamique entre les deux.
- **Un seul administrateur** (garanti par un index unique en base) ; il crée les comptes, installe les plugins, active chaque
  plugin pour tous ou pour certains utilisateurs. Les autres utilisateurs ne gèrent rien de cela.
- **Chaque utilisateur ne voit que ses données.** Les requêtes portent l'identifiant de la session, jamais une valeur envoyée
  par le client ; le calcul d'un autre est « introuvable » (404), jamais « interdit ».
- Les mini-apps n'ont toujours **aucun accès au réseau** : seul l'hôte parle au serveur.

## Lancer

```bash
cargo build -p etabli-serveur --release        # binaire de ~3,5 Mo : target/release/etabli-serveur
etabli-serveur --donnees ./donnees --application apps/desktop/dist-web
```

| Option (variable) | Rôle | Défaut |
| --- | --- | --- |
| `--donnees` (`ETABLI_DONNEES`) | dossier de la base `etabli.sqlite` et des `plugins/` — **à sauvegarder** | `donnees` |
| `--ecoute` (`ETABLI_ECOUTE`) | adresse d'écoute | `127.0.0.1:4300` (cette machine seulement) |
| `--application` (`ETABLI_APPLICATION`) | dossier de la version web (`npm run build:web`) servi à la racine | aucun |
| `--cle-publique` (`ETABLI_CLE_PUBLIQUE`) | clé minisign qui signe les plugins acceptés | celle d'Établi (`tauri.conf.json`) |
| `--origine` | autre site autorisé à appeler l'API (répétable) | aucun (même origine seulement) |
| `--ecoute-plugins` (`ETABLI_ECOUTE_PLUGINS`) | second port réservé aux fichiers des plugins (origine dédiée, requise pour les mini-apps hors ligne) | aucun |
| `--url-plugins` (`ETABLI_URL_PLUGINS`) | adresse publique de cette origine, annoncée aux clients (ex. `https://plugins.maison.fr`) | aucune |
| `--proxy-de-confiance` | lire l'adresse du client dans `X-Forwarded-For` | non |
| `--quota-mo` (`ETABLI_QUOTA_MO`) | place maximale des calculs d'un utilisateur | 500 |

**Premier lancement** : la console affiche un *code d'installation*. Il sert une seule fois, avec `POST /api/installation`, à
créer l'administrateur (3 à 5 essais ratés bloquent 15 minutes). Seule son empreinte est gardée en base.

### Rendre le serveur accessible

Le serveur parle HTTP et n'écoute que sur la machine locale. Pour l'ouvrir à d'autres appareils, **ne l'exposez jamais en HTTP
brut** : les mots de passe et les jetons circuleraient en clair. Deux solutions simples :

- **VPN** (Tailscale, WireGuard) : `--ecoute` sur l'adresse du VPN, rien d'ouvert sur Internet. Recommandé pour une maison.
- **Proxy inverse HTTPS** devant le serveur, par exemple Caddy (certificat automatique) :

```caddyfile
etabli.exemple.fr {
    reverse_proxy 127.0.0.1:4300
}
```

avec `--proxy-de-confiance` (sinon toutes les connexions semblent venir du proxy et partagent le même blocage par adresse).
HTTPS est aussi requis pour installer la version web sur un téléphone.

### Sauvegarde

`GET /api/admin/export` (administrateur) renvoie une copie cohérente de la base (`VACUUM INTO`). À programmer chaque nuit ; copier
aussi `plugins/` (réinstallable depuis les paquets signés). Chaque utilisateur peut récupérer ses propres données
(`GET /api/moi/export`) pour repasser en mode local.

## API

Toutes les réponses d'erreur sont `{ "erreur": "phrase en français" }`. Authentification : `Authorization: Bearer <jeton>`.

| Route | Rôle |
| --- | --- |
| `POST /api/installation` | crée l'administrateur (code d'installation, une seule fois) |
| `POST /api/session` · `DELETE /api/session` | connexion → jeton · déconnexion |
| `GET /api/moi` · `POST /api/moi/mot-de-passe` · `GET /api/moi/export` | compte, changement de mot de passe, export de ses données |
| `GET /api/documents?plugin=&app=&limite=` · `GET/DELETE /api/documents/{id}` · `PUT /api/documents` | calculs ; `PUT` avec `versionAttendue` → 409 si le calcul a changé ailleurs |
| `GET/PUT /api/donnees/{nom}` · `GET/PUT /api/reglages` | réglages de plugin et services publiés · réglages de l'application |
| `GET /api/plugins` · `GET /plugins/{id}/{chemin}` | plugins accessibles à l'utilisateur · leurs fichiers (publics, politique sans réseau) |
| `…/api/admin/utilisateurs` (GET, POST, PATCH, DELETE) | comptes (jamais de second administrateur ; suppression avec `?confirmer=`) |
| `…/api/admin/plugins` (GET, POST, PATCH, DELETE) | `POST` = paquet `.etabli-plugin` tel quel ; `PATCH` = `actifGlobal`, `utilisateurs` |
| `GET /api/admin/journal` · `GET /api/admin/export` | journal d'audit · copie de la base |

Les formats de calcul sont ceux des fichiers `.etabli` ([08](08-documents-donnees.md)), plus un champ `version`.

## Sécurité : ce qui est en place

- **Mots de passe** : Argon2id, 10 à 128 caractères, jamais stockés ni journalisés en clair ; au plus 4 hachages en même temps.
- **Sessions** : jeton de 32 octets aléatoires, **seule son empreinte SHA-256 est en base** ; 30 jours au plus, 14 jours sans activité ;
  arrêt immédiat à la désactivation du compte, à la réinitialisation ou au changement du mot de passe.
- **Connexion** : message unique « Identifiant ou mot de passe incorrect » (on ne révèle pas si le compte existe, vérification
  factice de même durée) ; blocage après 5 échecs par identifiant (10 min) et 30 par adresse.
- **Plugins** : signature minisign vérifiée **avant** toute écriture ; chemins du zip contrôlés (`..`, `/`, `\`, `:`), 5000 fichiers et
  256 Mo décompressés au plus ; mise en place atomique (l'ancienne version revient si quelque chose échoue) ; service des fichiers
  avec chemins simples seulement et contrôle après résolution des liens symboliques, et une politique `sandbox allow-scripts` qui
  impose une origine opaque même si la page est ouverte directement dans un onglet.
- **En-têtes** : `nosniff`, `no-referrer`, `no-store` sur l'API ; pages de l'application avec une politique `default-src 'self'` et
  `frame-ancestors 'none'` ; pas de CORS sans `--origine`.
- **Limites** : corps de requête borné (256 Ko, 1 Mo pour les réglages, 5 Mo pour un calcul, 70 Mo pour un paquet), 10 000 calculs et
  500 Mo par utilisateur.
- **Audit** : connexions refusées, comptes, plugins, exports sont inscrits dans le journal.

### Limites connues (à savoir)

- Le **TLS n'est pas intégré** : voir plus haut (VPN ou proxy).
- **L'administrateur du serveur peut lire la base** (donc les calculs de tous). Un chiffrement par utilisateur est prévu plus tard ;
  d'ici là, ne mettez dans un serveur partagé que ce que l'administrateur peut voir.
- Le blocage par identifiant permet à quelqu'un qui connaît un identifiant de **bloquer ce compte 10 minutes** en échouant 5 fois : c'est
  le prix d'une protection contre les essais en série. Il ne donne aucun accès.
- Les **fichiers d'un plugin sont publics** (sans compte) : ils ne contiennent aucune donnée d'utilisateur, mais ne mettez pas de secret dans un plugin.
- **Mini-apps hors ligne** : elles exigent l'origine dédiée (`--ecoute-plugins` + `--url-plugins`, hôte ou port différent de l'application). Sans
  elle, calculs et réglages marchent hors ligne mais les mini-apps ont besoin du réseau. Tous les plugins partagent cette origine (aucune donnée
  d'utilisateur n'y vit). L'application de bureau (Tauri) ne sait pas encore se connecter à un serveur.
- Un seul serveur, une seule base SQLite : adapté à une classe ou à une maison, pas à des milliers d'utilisateurs.

## Code

`crates/noyau` (règles communes, sans entrée-sortie : identifiants, format des calculs, paquets signés) et `crates/serveur`
(`lib.rs` routeur et en-têtes, `base.rs` + `schema_1.sql` base et migrations, `securite.rs`, `auth.rs`, `routes_*.rs`).
Espace de travail Cargo à la racine ; `apps/desktop/src-tauri` reste à part (son propre `Cargo.lock`).
Tests : `cargo test --workspace` (unitaires + `crates/serveur/tests/api.rs`, qui traverse le vrai routeur et une vraie base).
