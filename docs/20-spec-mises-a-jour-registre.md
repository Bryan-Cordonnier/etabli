# 20 — Spécification : mises à jour et registre des plugins « en béton » (brouillon)

> **Statut : brouillon.** Le noyau de vérification (catalogue signé, séquence, expiration, révocation, anti-retour-en-arrière) est
> codé et testé dans `crates/noyau/src/catalogue.rs`. **Rien n'est encore branché** dans l'application ni dans la chaîne de
> publication : ces branchements se font à partir de cette spec, une fois validée par Bryan.

## 1. Ce qui existe

- **Application** : mise à jour signée (minisign) par le plugin Tauri, depuis `releases/latest/download/latest.json` sur GitHub.
- **Plugins** : un paquet `.etabli-plugin` signé par plugin, plus `catalogue.json` dans la Release « catalogue » ; installation sans
  redémarrage ; signature vérifiée avant toute écriture.
- Les adresses sont **écrites dans le code** (`catalogue.rs`, `tauri.conf.json`).

## 2. Ce qui n'est pas « en béton »

| Risque | Aujourd'hui |
| --- | --- |
| Panne, limite de débit ou perte du compte GitHub | plus aucune mise à jour ni installation ; les adresses sont dans le code, donc changer d'hébergeur exige une nouvelle version… que personne ne peut recevoir |
| **Retour en arrière** : on sert un vieux catalogue (ou un vieux paquet, signé donc accepté) qui renvoie vers une version vulnérable | possible : le catalogue n'est pas signé et rien n'interdit d'installer une version plus ancienne |
| Cacher une révocation | pas de révocation |
| Une mise à jour casse un plugin | pas de retour à la version précédente |
| Clé de signature perdue ou volée | une seule clé, aucune procédure de rotation |
| Mauvaise version publiée à tout le monde d'un coup | pas de déploiement progressif, pas de canal « bêta » |

## 3. Conception

### 3.1 Catalogue signé (fait côté noyau)
`catalogue.json` au format 2, accompagné de `catalogue.json.minisig` :
```json
{ "format": 2, "sequence": 41, "expire": 1793000000,
  "plugins": [ { "id": "maths", "version": "1.1.0", "url": "…", "sha256": "…", "permissions": ["presse-papiers"] } ],
  "revocations": [ { "id": "tracage", "avant": "1.2.0", "raison": "faille corrigée" } ] }
```
- **Signature d'abord** : on n'analyse rien d'inauthentique.
- **`sequence`** : le client garde la plus grande vue et refuse un catalogue de séquence inférieure → on ne peut pas lui servir un vieux catalogue.
- **`expire`** : un catalogue périmé est refusé (durée courte, par exemple 30 jours, renouvelée à chaque publication et par un renouvellement automatique mensuel).
  Si l'hébergeur est injoignable, le client **continue avec les plugins installés** mais ne peut plus rien installer de neuf : jamais de plugin révoqué ignoré en silence.
- **Révocation** : par plugin, « toutes les versions avant X » ou une liste de versions. Un plugin révoqué est **désactivé** au prochain démarrage et à chaque lecture du catalogue ;
  l'utilisateur voit pourquoi.
- **Anti-retour-en-arrière** : une version identique ou plus ancienne que celle installée est refusée, sauf « retour en arrière » demandé par l'utilisateur ; une version révoquée n'est jamais installée.
- **Empreinte** (`sha256`) de chaque paquet dans le catalogue, vérifiée avant la signature du paquet (défense en profondeur, détecte aussi un téléchargement tronqué).

### 3.2 Adresses configurables, plusieurs sources
Le moteur lit une liste ordonnée de **sources** (réglage avancé + valeurs par défaut) : première source répondant avec un catalogue valide et de séquence ≥ celle déjà vue.
Valeur par défaut : ton futur domaine, **puis** GitHub en secours. Le plugin de mise à jour de Tauri accepte déjà plusieurs adresses (`endpoints`).
Un atelier fermé peut pointer vers son **registre privé** et fournir sa propre clé de confiance (voir 3.5). **Aucun domaine n'est requis tant que GitHub est la seule source.**

### 3.3 Canaux
`stable` (par défaut) et `beta`, un catalogue chacun. Choix dans Paramètres › Mises à jour. Un plugin ou l'application peut exister dans les deux canaux.

### 3.4 Retour arrière et déploiement progressif
- Le moteur **garde la version précédente** de chaque plugin (une seule copie) ; bouton « Revenir à la version précédente » ; retour automatique si l'installation échoue en cours de route.
- Application : le plugin de mise à jour de Tauri ne rétrograde pas ; on garde l'installateur précédent téléchargeable et on documente la procédure.
- Déploiement progressif (plus tard) : `deploiement: { pourcent }` ; chaque installation tire un nombre local aléatoire (aucun identifiant envoyé).

### 3.5 Clés
- **Clé racine** (hors ligne, jamais sur GitHub) : signe uniquement la liste des **clés de publication** valides (avec dates).
- **Clé de publication** (dans la chaîne de publication) : signe le catalogue et les paquets. Rotation = nouvelle clé de publication signée par la racine, livrée dans le catalogue ; l'ancienne reste valable jusqu'à une date.
- Le moteur embarque la clé racine (et la prochaine, pour pouvoir la changer). Compromission d'une clé de publication = rotation + révocation, sans nouvelle version du moteur.
- Aujourd'hui une seule clé fait tout : la séparer est la dernière étape, car elle demande une procédure d'exploitation écrite et répétée.

### 3.6 Hors ligne et réseaux fermés
Importer un **paquet signé** et un **instantané de catalogue signé** depuis une clé USB reste possible (le catalogue importé obéit à la même règle de séquence et d'expiration).

## 4. Étapes proposées

1. ✅ Noyau : vérification d'un catalogue signé, comparaison de versions, révocations, anti-retour-en-arrière (fait, 10 tests).
2. Publication : `paquet-plugin.mjs` produit le format 2 (séquence, expiration, empreintes, permissions) et le signe ; le workflow de publication le dépose. Migration : le client lit les deux formats pendant une version, puis refuse le format 1.
3. Client (Rust) : l'application utilise le noyau (supprime la copie de `ouvrir_paquet` et des contrôles de chemin de `catalogue.rs`), garde la dernière séquence vue, désactive les plugins révoqués. **À valider en CI Windows.**
4. Interface : source(s) configurables, canal, bouton de retour arrière, message de révocation.
5. Rotation de clés : clé racine, liste de clés de publication, procédure écrite et répétée à blanc.
6. Déploiement progressif, canal bêta de l'application.

## 5. Questions ouvertes

1. Durée de validité d'un catalogue : 30 jours (proposé) ?
2. Canal « bêta » : utile dès maintenant, ou seulement avec de vrais clients ?
3. Un domaine à toi (≈ 10 €/an) comme première source dès que tu en as un : oui ? (sans lui, GitHub reste la seule source.)
4. Conserver la version précédente d'un plugin : une seule, ou deux ?
