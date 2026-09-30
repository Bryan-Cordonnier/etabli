# 15 — Gérer le dépôt

Guide des mainteneurs : réglages GitHub à activer, relecture des demandes de fusion et des plugins d'autres auteurs, tri des
tickets, publication. Le côté contributeur est dans [CONTRIBUTING.md](../CONTRIBUTING.md).

## 1. Réglages GitHub à activer (une fois, à la main)

Ces réglages ne se font pas par des fichiers du dépôt : ils sont dans **Settings** sur GitHub. Cocher chaque case ci-dessous.

**Présentation** (Settings → General)
- [ ] *Description* : « La boîte à outils de l'atelier : débit de tubes, calepinage de tôles, développés de pliage et de traçage.
  Application Windows libre, 100 % locale, extensible par plugins. »
- [ ] *Website* : l'adresse de la [dernière version](https://github.com/Bryan-Cordonnier/etabli/releases/latest) (ou du site, quand il existera).
- [ ] *Topics* : `chaudronnerie`, `tolerie`, `atelier`, `calculs`, `plugins`, `tauri`, `svelte`, `rust`, `windows`, `francais`.
- [ ] *Social preview* : une image 1280 × 640 (capture de l'accueil, titre « Établi »).

**Fonctions** (Settings → General → Features)
- [ ] *Issues* activées ; *Wiki* désactivé (la documentation est dans `docs/`).
- [ ] *Discussions* activées, avec les catégories **Annonces** (mainteneurs seulement), **Questions** (format question-réponse),
  **Idées**, **Plugins** (écrire un plugin), **Montrez vos plugins** (partager ce que vous avez fait).
- [ ] *Preserve this repository* facultatif.

**Fusion** (Settings → General → Pull Requests)
- [ ] Autoriser **Squash merging** seulement (un commit propre par demande) ; message par défaut : titre de la demande.
- [ ] *Automatically delete head branches*.
- [ ] *Always suggest updating pull request branches*.

**Sécurité** (Settings → Code security)
- [ ] **Private vulnerability reporting** : activé (c'est ce que [SECURITY.md](../SECURITY.md) et les tickets annoncent).
- [ ] **Dependabot alerts** et **Dependabot security updates** : activés (les mises à jour de version sont réglées par `.github/dependabot.yml`).
- [ ] **Code scanning** : *Set up → Default* (CodeQL, JavaScript/TypeScript, Rust si proposé).
- [ ] **Secret scanning** et **Push protection** : activés.

**Branche `main`** (Settings → Rules → Rulesets → New branch ruleset, cible `main`)
- [ ] *Require a pull request before merging* (1 approbation ; « Dismiss stale approvals » ; *Require review from Code Owners*).
- [ ] *Require status checks to pass* : `Windows` (le travail du workflow « Vérification »), branche à jour.
- [ ] *Require conversation resolution before merging*.
- [ ] *Block force pushes* et *Restrict deletions* ; *Require linear history*.
- [ ] Tant que vous êtes seul, laissez-vous le droit de contourner (*Bypass list* : vous) pour pouvoir publier ; retirez-le quand
  d'autres mainteneurs arrivent.

**Étiquettes de publication** (Rulesets → New tag ruleset, motifs `v*` et `plugin-*`)
- [ ] *Restrict creations*, *Restrict updates*, *Restrict deletions* : seuls les mainteneurs créent une étiquette. C'est
  **elle** qui déclenche la publication et l'usage de la clé de signature : à protéger comme un mot de passe.

**Actions** (Settings → Actions → General)
- [ ] *Fork pull request workflows from outside collaborators* : **Require approval for all outside collaborators** (une demande venue
  d'un fork ne lance la CI qu'après votre accord : elle ne voit de toute façon aucun secret).
- [ ] *Workflow permissions* : **Read repository contents and packages permissions** par défaut (chaque workflow demande le
  supplément dont il a besoin, c'est déjà écrit).
- [ ] Secrets (Settings → Secrets and variables → Actions) : `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` ;
  plus tard `SIGNPATH_API_TOKEN` et les variables SignPath ([docs/14](14-publier-une-version.md#signpath-signature-windows-gratuite-pour-les-projets-libres)).
  **Sauvegarder la clé de mise à jour** hors de GitHub : sans elle, plus aucune mise à jour possible.

**Compte** : authentification à deux facteurs sur GitHub (et SignPath).

**Vérification** : *Insights → Community standards* doit afficher toutes les rubriques (description, README, code de conduite,
guide de contribution, licence, politique de sécurité, modèles de tickets et de demandes de fusion).

## 2. Relire une demande de fusion

1. La CI est **verte** (vérification, tests, validation des plugins, Rust). Sinon, on n'ouvre même pas le fond.
2. Le **pourquoi** est clair et relié à un ticket. Un gros changement sans discussion préalable : on redirige vers un ticket.
3. **Un seul sujet.** Sinon, demander de séparer.
4. Les **tests** couvrent le changement ; la **documentation** et le **`CHANGELOG.md`** (section « Non publié », écrite pour l'utilisateur)
   sont à jour.
5. Le code **ressemble au code autour** (nommage, commentaires en français, un composant par fichier…) et respecte
   [docs/11-conventions.md](11-conventions.md), y compris les décisions d'interface : on n'y touche pas sans en discuter.
6. **Sécurité** : rien n'ouvre le réseau ni le disque à un plugin, aucune donnée n'est collectée, aucun chemin fourni de l'extérieur n'est
   utilisé sans être vérifié (`safe_join`, noms de fichiers), aucune dépendance nouvelle sans raison.
7. **Fusionner en squash**, avec un titre au format Conventional Commits en français.

## 3. Relire un plugin d'un autre auteur

Un plugin du catalogue officiel s'exécute chez des centaines de personnes : c'est la relecture qui protège, pas seulement le cadre isolé.

1. **`npm run valider -- <id>`** passe sans erreur (le workflow le refait avant de publier). Lire aussi ses avertissements.
2. **Ce que le plugin dit faire** : le nom, la description et les mini-apps correspondent à ce qu'il fait. Rien de caché.
3. **Formules et sources** : chaque formule est sourcée (norme avec l'article, catalogue, ouvrage) ; les tables recopiées ont une
   **licence compatible** (une norme ISO ou NF est protégée : on ne recopie pas le texte, on calcule avec des valeurs publiques et sourcées).
   Refaire **deux ou trois calculs à la main** et comparer aux tests.
4. **Tests** : au moins trois cas vérifiés par formule, plus les cas limites ; jamais de résultat faux affiché.
5. **Sources** : lire le code de `src/` (les calculs) et parcourir celui des mini-apps. Chercher tout ce qui n'a pas de raison d'être :
   accès à des adresses, chaînes encodées, code minifié, dépendances lourdes ou inconnues (`package.json`), fichiers binaires.
6. **Dépendances entre plugins** : `dependencies` (obligatoire) seulement si le plugin est inutilisable sans l'autre ; `optionalDependencies`
   si vraiment facultatif **et testé sans**. Un `provides` a un contrat de données documenté.
7. **Aucune permission** (`permissions: []`) : il n'y en a pas d'autres pour l'instant.
8. **Journal** : `plugins/<id>/CHANGELOG.md` a une section datée pour la version du manifeste.
9. Une **mise à jour** d'un plugin déjà accepté : relire le **diff**, en particulier les nouvelles dépendances et les changements de manifeste.
10. Publier avec l'étiquette `plugin-<id>-vX.Y.Z` (les dépendances d'abord) : [docs/14](14-publier-une-version.md#publier-un-plugin-pas-à-pas).

Refuser poliment, en expliquant, un plugin qui ne peut pas être vérifié ; proposer de le distribuer hors catalogue (fichier `.etabli-plugin`).

## 4. Tickets et discussions

- Tout ticket neuf a l'étiquette `à-trier` : la retirer après lecture. Les **calculs faux** (`calcul-faux`) passent avant le reste.
- Répondre dans la semaine, même par « bien reçu, je regarde ». Demander les informations manquantes (`besoin-d-infos`) plutôt que de deviner.
- Proposer **`bon-premier-ticket`** et **`aide-bienvenue`** sur ce qui est abordable par un débutant : c'est ainsi que les contributeurs arrivent.
- Une idée qui ne sera pas retenue : `refusé` et une explication respectueuse, pas un silence.
- Une faille (signalement privé) : suivre [SECURITY.md](../SECURITY.md), corriger dans un fork privé de l'avis, publier, puis publier l'avis.
- Un signalement de conduite : voir le [code de conduite](../CODE_OF_CONDUCT.md).

## 5. Dependabot

Chaque lundi, Dependabot ouvre au plus quelques demandes, groupées (interface, Tauri, autres ; Cargo ; actions GitHub). Les relire comme les
autres : CI verte, lire les notes de version des changements majeurs. **Tauri** se met à jour avec ses extensions ensemble, et le modèle
d'installateur `windows/installateur.wxs` doit être comparé à celui de la nouvelle version ([docs/14](14-publier-une-version.md#installateur-msi-par-utilisateur)).
Ne pas laisser s'accumuler : une demande ignorée devient une dette.

## 6. Publier

[docs/14-publier-une-version.md](14-publier-une-version.md). Rappels : le journal des changements est écrit **avant**, la version augmente
toujours, les plugins se publient un par un (dépendances d'abord), et une faute dans les notes se corrige dans `CHANGELOG.md`.
