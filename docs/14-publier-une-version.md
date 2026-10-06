# 14 — Publier une version, signature et mises à jour

Établi est distribué par les **Releases GitHub** du dépôt public (gratuit) :
https://github.com/etable-project/etable/releases/latest. Chaque version contient l'installateur
`Etabli_<version>_x64_fr-FR.msi`, sa signature de mise à jour `.msi.sig` et `latest.json`, le
fichier que les Établi installés consultent pour se mettre à jour. Licence : **MIT** (`LICENSE`).

## Installateur MSI par utilisateur

Depuis la 0.1.1, l'installateur est un **MSI** (la 0.1.0 était un NSIS `.exe`). Modèle WiX :
`apps/desktop/src-tauri/windows/installateur.wxs` = le modèle de Tauri 2.11.5 (identique dans la 2.12.0, comparé le 01/10/2026) avec l'installation
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

## Paquet de plugin signé et installation

Depuis le 6 octobre 2026, le moteur n'a **ni catalogue, ni magasin, ni mise à jour de plugins par le réseau** : un plugin
s'installe depuis un fichier `.etabli-plugin` (page « Plugins » → « Installer depuis un fichier… »). Le code du catalogue
signé, de la rotation des clés, des révocations, de l'arrêt de contrat et de la publication par plugin est conservé sous
l'étiquette Git `legacy/store-before-cut` : il sert de point de départ à Etablink (docs/22, section 9).

- **Fabriquer un paquet** : `npm run build -w plugins/<id>` puis `node scripts/paquet-plugin.mjs <id>` → `paquets/<id>-<version>.etabli-plugin`.
  Un paquet est un zip qui contient `plugin.zip` (le dossier `dist` du plugin) et `plugin.zip.minisig` (sa signature
  `tauri signer sign`, mêmes variables `TAURI_SIGNING_PRIVATE_KEY` et `_PASSWORD` que pour les mises à jour de l'application).
- **Confiance** : le moteur n'installe un paquet que si sa signature correspond à la clé publique de `tauri.conf.json`
  (`plugins.updater.pubkey`). Une distribution (Quotidien, Etablink) met sa propre clé dans sa configuration.
- **Règles à l'installation** (`apps/desktop/src-tauri/src/installation.rs`) : signature vérifiée avant toute écriture,
  chemins sûrs, tailles bornées, version lisible, **jamais une version plus ancienne que celle installée** (la même version
  est permise : réparation). Une version précédente n'est pas gardée.
- **Désinstaller** : le dossier du plugin disparaît, les calculs et réglages restent.
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

## Rotation des clés et arrêt de contrat

Retirés du moteur le 6 octobre 2026 avec le catalogue : voir l'étiquette Git `legacy/store-before-cut` (`crates/noyau/src/cles.rs`,`scripts/cles-rotation.mjs`, `scripts/arret-contrat.mjs`). La clé de signature des mises à jour de l'application, elle, reste décrite plus haut.

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
