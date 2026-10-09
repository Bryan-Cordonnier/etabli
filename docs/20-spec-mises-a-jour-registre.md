# 20 — Spécification : mises à jour et registre des plugins « en béton » (brouillon)

> **Déplacé vers Etablink (6 octobre 2026).** Le moteur Etable n'a plus ni catalogue, ni licences, ni magasin ; ce document décrit la future distribution fermée Etablink. Le code existant (catalogue signé, rotation de clés, révocation, retour arrière) est sous l'étiquette Git `legacy/store-before-cut`.

> **Statut : brouillon.** Le noyau de vérification (catalogue signé, séquence, expiration, révocation, anti-retour-en-arrière) est
> codé et testé dans `crates/noyau/src/catalogue.rs`. **Rien n'est encore branché** dans l'application ni dans la chaîne de
> publication : ces branchements se font à partir de cette spec, une fois validée par Bryan.

## 1. Ce qui existe

- **Application** : mise à jour signée (minisign) par le plugin Tauri, depuis `releases/latest/download/latest.json` sur GitHub.
- **Plugins** : un paquet `.etapl` signé par plugin, plus `catalogue.json` dans la Release « catalogue » ; installation sans
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

### 3.5 bis Arrêt d'un contrat d'API
Le catalogue signé peut annoncer l'arrêt d'une version majeure du contrat des plugins : `"contrats": [{ "majeure": 1, "avertir_des": 1800000000, "refuser_des": 1815000000, "message": "…" }]` (secondes depuis 1970). Avertissement dans la fenêtre d'installation, puis refus d'installer ou de mettre à jour un plugin de ce contrat (`noyau::catalogue::statut_contrat`, copie dans l'interface `plugins/contrat-arret.ts`). Les dates sont dans le catalogue signé : on les change sans nouvelle version d'Établi. Plugins déjà installés : non touchés (pas de désactivation).

### 3.6 Hors ligne et réseaux fermés
Importer un **paquet signé** et un **instantané de catalogue signé** depuis une clé USB reste possible (le catalogue importé obéit à la même règle de séquence et d'expiration).

## 4. Étapes proposées

1. ✅ Noyau : vérification d'un catalogue signé, comparaison de versions, révocations, anti-retour-en-arrière (fait, 9 tests).
2. ✅ Publication : `paquet-plugin.mjs`, « Notes de version » et le workflow mensuel « Catalogue (renouvellement) » produisent le format 2 (séquence, expiration 30 jours, empreinte `sha256`, permissions) et le signent (`scripts/catalogue-signe.mjs`, 5 tests). Migration : le client lit les deux formats tant qu'aucun catalogue signé n'a été vu, puis refuse le non signé. **À faire par Bryan : lancer une première fois « Catalogue (renouvellement) » dans l'onglet Actions** pour passer au format signé.
3. ✅ (PR « Moteur PC 1/3 ») Client (Rust) : l'application utilise le noyau (supprime la copie de `ouvrir_paquet` et des contrôles de chemin de `catalogue.rs`), garde la dernière séquence vue, désactive les plugins révoqués. **À valider en CI Windows.**
4. ✅ (partiel) Interface : bouton de retour arrière (une version précédente gardée dans `<catalogue>/.precedent/<id>`, mises à jour automatiques suspendues ensuite), plugin révoqué désactivé avec sa raison. **Sources configurables** ✅ (branche `sources-configurables` : réglage « Source du catalogue » dans Paramètres › Mises à jour, `crates/noyau/src/source.rs`, mémoire de séquence par source) ; **canal bêta préparé seulement** (le champ existe, le moteur refuse `beta` tant qu'aucun catalogue bêta n'est publié). Pas de liste de plusieurs sources ni de repli automatique : une seule source à la fois (question 5).
5. ✅ (partiel) Rotation de clés : `crates/noyau/src/cles.rs` (liste de clés signée par la racine, séquence, dates, clés retirées refusées, plusieurs racines), script `scripts/cles-rotation.mjs`, procédure et plan de perte/compromission dans [docs/14](14-publier-une-version.md). Le moteur lit `cles.json` à côté du catalogue ; `CLES_RACINES` est **vide** tant que Bryan n'a pas créé la racine. **À valider en CI Windows ; reste : créer la vraie racine, répéter à blanc, publier une version qui l'embarque.**
6. Déploiement progressif, canal bêta de l'application.
7. ✅ (mécanisme) Arrêt du contrat ^1 : avertissement puis refus par dates du catalogue signé (`contrats`), tests noyau, interface et scripts. **Aucune date fixée** (question 7).

## 5. Questions ouvertes

0. Rotation : la clé d'origine (`tauri.conf.json`) devient-elle obligatoirement une entrée de la première `cles.json` (sinon elle est retirée dès la première liste) ? Proposé : oui, avec `jusqua` quelques mois après la première rotation. Et faut-il une durée de vie maximale d'une clé de publication (ex. 12 mois) ?

1. Durée de validité d'un catalogue : 30 jours (proposé) ?
2. Canal « bêta » : utile dès maintenant, ou seulement avec de vrais clients ?
3. Un domaine à toi (≈ 10 €/an) comme première source dès que tu en as un : oui ? (sans lui, GitHub reste la seule source.)
4. Conserver la version précédente d'un plugin : une seule, ou deux ?
5. Sources : la spec 3.2 parle d'une liste ordonnée avec repli (domaine puis GitHub). Seule une source choisie est codée ; faut-il le repli automatique vers GitHub quand la source personnalisée est injoignable ? (Proposé : non, pour un registre privé on ne veut pas basculer sur le public sans le dire.)
6. Source personnalisée : les révocations qu'elle publie ne désactivent pas encore un plugin déjà installé (seule la source officielle alimente `plugins_list`) ; elles bloquent seulement l'installation. À étendre ?
7. Arrêt du contrat ^1 : quelles dates ? Proposé : avertissement dès que tous les plugins officiels sont en ^2 (c'est le cas), refus six mois plus tard ; et faut-il aussi désactiver les plugins ^1 déjà installés au-delà de la date de refus (non codé) ?
