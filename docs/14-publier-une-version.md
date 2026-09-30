# 14 — Publier une version, signature et mises à jour

Établi est distribué par les **Releases GitHub** du dépôt public (gratuit) :
https://github.com/Bryan-Cordonnier/etabli/releases/latest. Chaque version contient l'installateur
`Etabli_<version>_x64_fr-FR.msi`, sa signature de mise à jour `.msi.sig` et `latest.json`, le
fichier que les Établi installés consultent pour se mettre à jour. Licence : **MIT** (`LICENSE`).

## Installateur MSI par utilisateur

Depuis la 0.1.1, l'installateur est un **MSI** (la 0.1.0 était un NSIS `.exe`). Modèle WiX :
`apps/desktop/src-tauri/windows/installateur.wxs` = le modèle de Tauri 2.11.5 avec l'installation
**par utilisateur, sans droits d'administrateur** (paquet « double usage » : `ALLUSERS=2`,
`MSIINSTALLPERUSER=1`, `InstallPrivileges="limited"`). Résultat, vérifié le 29/09/2026 depuis un
compte sans droits d'administrateur : installation dans `%LOCALAPPDATA%\Programs\Etabli`, raccourcis
du menu Démarrer et du Bureau de l'utilisateur, désinstallation propre (Paramètres Windows ou
`msiexec /x`). À comparer avec le modèle d'origine à chaque mise à jour de Tauri.

Pourquoi MSI plutôt que NSIS : SignPath signe **en une seule demande** le programme contenu dans le
MSI puis le MSI (une seule approbation par version), et il n'y a pas d'exécutable de désinstallation
à signer (msiexec, signé par Microsoft, s'en charge). Avec NSIS, il aurait fallu signer séparément le
programme, le désinstalleur généré pendant la compilation et l'installateur.

Configuration : `bundle.targets = ["msi"]`, `bundle.windows.wix` (modèle, `fr-FR`, `upgradeCode`
**à ne jamais changer** : c'est lui qui fait remplacer l'ancienne version), `bundle.publisher`,
`copyright`, `license` (repris dans les propriétés du programme : exigence de SignPath).

## Catalogue de plugins (depuis la 0.2.0)

L'installateur ne contient **aucun plugin** (0.1.x : ils étaient copiés dans l'installateur). On
les installe depuis le catalogue (page Catalogue, maquette validée par Bryan :
https://claude.ai/artifact/Si77KdKYLq3oLqPwoKFSoj). Chaque plugin est publié **séparément** de
l'application : corriger un calcul de Traçage ne demande pas de republier Établi.

- **Paquet** `<id>-<version>.etabli-plugin` : zip qui contient `plugin.zip` (le `dist/` du plugin,
  `manifest.json` à la racine) et `plugin.zip.minisig` (sa signature, **même clé que les mises à jour**).
  Fabriqué par `scripts/paquet-plugin.mjs` (`npm run paquet -- <id>`), qui met aussi à jour
  `catalogue.json`.
- **Entrée de catalogue** (`catalogue.json`) : en plus de l'identité du plugin, ses `dependencies`,
  `optionalDependencies`, `provides` et `settings` (titres des pages de réglages), lus dans son manifeste :
  l'application s'en sert pour installer les dépendances avant le plugin (`planInstall`, `@etabli/sdk/deps`).
  **Publier les dépendances d'abord** : un plugin dont une dépendance obligatoire n'est pas au catalogue
  ne peut pas être installé.
- **Release « catalogue »** (préversion, jamais « dernière version » : les mises à jour de
  l'application n'y touchent pas) : les paquets et `catalogue.json`, lu par Établi à
  `…/releases/download/catalogue/catalogue.json`.
- **Installation** (Rust, `catalogue.rs`) : téléchargement seulement depuis les Releases du dépôt,
  signature vérifiée avant toute écriture, extraction dans `<config>/catalogue/<id>` (refus des
  chemins qui sortent du dossier, taille bornée), remplacement d'un bloc, liste rechargée sans
  redémarrer. Désinstaller supprime ce dossier, **pas les calculs** (dossier des documents).
- **Au démarrage** : mises à jour automatiques des plugins (notification) ; qui arrive d'une 0.1.x
  (réglages existants, aucun plugin) retrouve tous les plugins du catalogue réinstallés (réglage
  `catalogueMigrated`). Vérifié le 29/09/2026 sur une version compilée avec le vrai catalogue.
- **Hors ligne** : « Installer depuis un fichier… » avec un `.etabli-plugin` (même vérification).

### Publier un plugin (pas à pas)

```powershell
. 'H:\outils\env-dev.ps1' | Out-Null
# 1. monter « version » dans plugins/<id>/public/manifest.json ET package.json (sinon aucune mise à jour proposée)
# 2. plugins/<id>/CHANGELOG.md : section « ## [X.Y.Z] — AAAA-MM-JJ » (elle devient les « Nouveautés » du catalogue)
npm run check; npm test; npm run build:plugins; npm run valider -- <id>
git commit -am "feat(<id>): …"; git push origin main
git tag plugin-<id>-v1.2.0; git push origin plugin-<id>-v1.2.0
```

Le workflow « Publication d'un plugin » (`.github/workflows/publier-plugin.yml`, ~2 min) vérifie que
l'étiquette correspond au manifeste, teste, compile, **valide le plugin** (`npm run valider` :
manifeste, journal, contenu), signe et dépose le paquet et le catalogue, puis remet à jour le texte de
la Release « catalogue » (liste des plugins et nouveautés de chacun). **Un plugin à la fois** : chaque
publication relit puis réécrit `catalogue.json`, et GitHub annule une publication en attente si une
troisième arrive (la relancer depuis l'onglet Actions). **Publier les dépendances d'abord.**
Publiés au 30/09/2026 : maths 1.0.1, economie 0.4.0, tolerie 1.0.1, tracage 1.1.1, materiaux 1.0.1,
fournisseurs 1.0.0, machines 1.0.0.

Paquet d'essai en local (sans publier) : définir `TAURI_SIGNING_PRIVATE_KEY` (contenu de la clé) et
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, puis `npm run paquet -- <id>` → `paquets/` (ignoré par Git).
Les tests Rust utilisent un paquet signé avec une clé d'essai : `src-tauri/fixtures/`.

## Mises à jour automatiques

1. Au démarrage (5 s après l'ouverture, si « Chercher au démarrage » est activé), Établi lit
   `…/releases/latest/download/latest.json` (`plugins.updater.endpoints` dans `tauri.conf.json`).
   Si la version est plus récente, un bandeau propose « Installer et redémarrer » ; les notes sont
   dans Paramètres → Mises à jour et à propos. Rien ne s'installe sans clic.
2. L'installation télécharge le MSI, **vérifie sa signature de mise à jour** avec la clé publique de
   `tauri.conf.json` (`plugins.updater.pubkey`), ferme Établi, installe en mode « passive » et relance
   l'application. Documents et réglages ne sont pas touchés (Documents\Etabli et AppData).

Code : `apps/desktop/src/lib/state/updates.svelte.ts`, `components/UpdateBanner.svelte`, section
« a-propos » de `pages/SettingsPage.svelte` ; Rust : `tauri-plugin-updater`, `tauri-plugin-process` ;
permissions `updater:default`, `process:allow-restart`.

## Deux signatures différentes

| Signature | Sert à | Clé | Où |
| --- | --- | --- | --- |
| **Mise à jour** (minisign, `.msi.sig`) | Établi installé vérifie que la mise à jour vient bien de nous | `H:\outils\cles\etabli-mises-a-jour.key` + `.mdp.txt` | secrets GitHub `TAURI_SIGNING_PRIVATE_KEY` (contenu du fichier) et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |
| **Windows** (Authenticode) | Windows (SmartScreen, Contrôle intelligent des applications) accepte d'ouvrir l'installateur et le programme | chez SignPath (HSM), jamais chez nous | secret `SIGNPATH_API_TOKEN`, variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_POLICY_SLUG` |

La clé de mise à jour est **à sauvegarder** (clé USB, gestionnaire de mots de passe) : sans elle,
les Établi installés ne peuvent plus se mettre à jour. La signature de mise à jour est faite **après**
la signature Windows (elle porte sur le MSI final) : `scripts/latest-json.mjs` écrit `latest.json`.

## SignPath (signature Windows gratuite pour les projets libres)

Le Contrôle intelligent des applications de Windows 11 **bloque sans recours** un programme non
signé (constaté le 29/09/2026 sur le PC d'un camarade avec la 0.1.0). Signature choisie : SignPath
Foundation (gratuit, projet libre ; éditeur affiché « SignPath Foundation »). Politique de signature
publiée : [`CODE_SIGNING.md`](../CODE_SIGNING.md) (phrase obligatoire, rôles, confidentialité).

Déroulé dans `.github/workflows/publier.yml`, **seulement si la variable
`SIGNPATH_ORGANIZATION_ID` existe** (sinon la version est publiée sans signature Windows) :
1. MSI compilé sur un runner GitHub (exigence de SignPath : tout le travail sur des machines GitHub) ;
2. envoyé comme artefact (`actions/upload-artifact@v7`) puis soumis
   (`signpath/github-action-submit-signing-request@v3`) ;
3. **Bryan approuve la demande dans SignPath** (courriel ou site) : le workflow attend jusqu'à 1 h ;
4. le MSI signé remplace le MSI non signé, puis signature de mise à jour et publication.

Configuration d'artefact à recopier dans SignPath : `.signpath/artifact-configuration.xml` (zip →
MSI → `etabli.exe`, nom de produit « Etabli » imposé).

Mise en place, une fois la demande acceptée par la SignPath Foundation : dans SignPath, créer le
projet (slug `etabli`), la configuration d'artefact, la politique de signature (slug
`release-signing`), relier le dépôt GitHub (connecteur « GitHub.com »), créer un jeton d'API pour un
utilisateur « soumetteur » ; dans GitHub (Settings → Secrets and variables → Actions), ajouter le
secret `SIGNPATH_API_TOKEN` et les variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`,
`SIGNPATH_POLICY_SLUG`.

## Publier une version (pas à pas)

Chaque version a ses **notes**, écrites dans `CHANGELOG.md` avant de publier : ce sont elles, et
elles seules, qui deviennent le texte de la Release GitHub, le message de mise à jour affiché dans
l'application et la page « Nouveautés ». Le workflow s'arrête tout de suite si la section de la version
manque.

1. **Journal** : dans `CHANGELOG.md`, renommer « Non publié » en `## [X.Y.Z] — AAAA-MM-JJ` et rouvrir une
   section « Non publié » vide au-dessus. Relire : chaque ligne s'adresse à l'utilisateur (voir
   [CONTRIBUTING.md](../CONTRIBUTING.md#le-journal-des-changements)). Ajouter les liens de comparaison en bas.
2. **Version** : `npm run version:app -- X.Y.Z` (fichiers de configuration Tauri, Cargo, npm).
3. **Contrôles** : `npm run check`, `npm test`, `npm run test:scripts`, `npm run build:plugins`,
   `npm run valider -- --tous`, et pour Rust `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, `cargo test`.
4. **Commit puis étiquette** :

```powershell
. 'H:\outils\env-dev.ps1' | Out-Null
npm run version:app -- 0.4.0          # tauri.conf.json, Cargo.toml, Cargo.lock, package.json
npm run check; npm test; npm run test:scripts; npm run build:plugins; npm run valider -- --tous
git commit -am "chore: version 0.4.0"
git tag -a v0.4.0 -m "Établi 0.4.0"    # le message ne sert plus : les notes viennent de CHANGELOG.md
git push origin main; git push origin v0.4.0
```

5. **Suivre** l'onglet Actions (« Publication »), puis vérifier la Release : installateur, `.sig`,
   `latest.json`, notes.

Après coup, une faute dans les notes se corrige dans `CHANGELOG.md` : le workflow « Notes de version » remet
à jour le texte de chaque Release existante (et les nouveautés du catalogue) dès que le journal change sur `main`.
- La version doit **augmenter** : sinon aucune mise à jour n'est proposée. Le workflow refuse une
  étiquette différente de la version de `tauri.conf.json`.
- Avec SignPath : approuver la demande de signature dans l'heure. Suivre la publication dans
  l'onglet Actions (« Publication »).
- Étiquette ratée : supprimer la Release et l'étiquette sur GitHub, corriger, recommencer.
- Tester en local : définir `TAURI_SIGNING_PRIVATE_KEY` (**contenu** de la clé, pas son chemin) et
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, puis `npm run build` ; MSI dans
  `apps/desktop/src-tauri/target/release/bundle/msi/`. Installation muette pour vérifier :
  `msiexec /i <msi> /qn`, désinstallation : `msiexec /x <msi> /qn`. Sous PowerShell 5, une variable
  mise à `''` est supprimée : ne pas utiliser de mot de passe vide.

## Installer (pour les utilisateurs)

- Télécharger `Etabli_<version>_x64_fr-FR.msi` sur la page des Releases et le lancer : installation
  pour le compte de l'utilisateur, sans droits d'administrateur.
- **Tant que SignPath n'est pas en place** : Windows affiche « Windows a protégé votre ordinateur » →
  **Informations complémentaires** → **Exécuter quand même** ; et si le **Contrôle intelligent des
  applications** est actif, il bloque sans recours (seule parade : le désactiver dans Sécurité
  Windows → Contrôle des applications et du navigateur ; depuis avril 2026 il se réactive sans
  réinstaller Windows, mais Établi reste bloqué tant qu'il est actif).
- WebView2 est présent sur Windows 10 et 11 ; l'installateur le télécharge s'il manque.
- Qui a installé la 0.1.0 (NSIS) : la mise à jour installe le MSI à côté ; désinstaller « Etabli »
  0.1.0 dans les paramètres de Windows.

## Autres options de signature étudiées (29/09/2026)

- **Certum Open Source** : environ 25 € (carte) ou 49 € HT (nuage SimplySign) par an, particulier et
  projet libre non commercial ; éditeur : le nom du développeur ; code à usage unique à chaque
  signature, peu pratique en CI.
- **Azure Artifact Signing** : 9,99 $/mois ; particuliers : pas la France ; entreprises de l'UE : au
  moins 3 ans d'existence vérifiable.
- Microsoft Store : exige aussi un installateur signé pour une application Tauri.
