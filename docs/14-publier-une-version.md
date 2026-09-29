# 14 — Publier une version et mises à jour

Établi est distribué par les **Releases GitHub** du dépôt public (gratuit) :
https://github.com/Bryan-Cordonnier/etabli/releases/latest. Chaque version contient l'installateur
Windows `Etabli_<version>_x64-setup.exe`, sa signature `.sig` et `latest.json`, le fichier que les
Établi installés consultent pour se mettre à jour.

## Comment ça marche

1. Une étiquette `v1.2.3` envoyée sur GitHub lance `.github/workflows/publier.yml` (Windows) :
   tests, plugins compilés, installateur NSIS, **signature de mise à jour**, publication de la
   Release avec le message de l'étiquette comme notes de version.
2. Au démarrage (5 s après l'ouverture, si « Chercher au démarrage » est activé), Établi lit
   `…/releases/latest/download/latest.json` (`plugins.updater.endpoints` dans `tauri.conf.json`).
   Si la version est plus récente, un bandeau propose « Installer et redémarrer » ; les notes sont
   dans Paramètres → Mises à jour et à propos. Rien ne s'installe sans clic.
3. L'installation télécharge le nouvel installateur, **vérifie sa signature** avec la clé publique de
   `tauri.conf.json` (`plugins.updater.pubkey`), ferme Établi, installe en mode « passive » (petite
   fenêtre de progression, sans question) et relance l'application. Documents et réglages ne sont pas
   touchés (ils sont dans Documents\Etabli et AppData).

Code : `apps/desktop/src/lib/state/updates.svelte.ts` (vérification, téléchargement),
`components/UpdateBanner.svelte`, section « a-propos » de `pages/SettingsPage.svelte` ; côté Rust,
`tauri-plugin-updater` et `tauri-plugin-process` (relance), permissions `updater:default` et
`process:allow-restart`.

## Plugins dans l'installateur

`npm run build:plugins` compile les plugins puis `scripts/plugins-officiels.mjs` copie chaque
`plugins/<id>/dist` dans `apps/desktop/src-tauri/plugins-officiels/<id>` (ignoré par Git, sauf
`.gitkeep`). `bundle.resources` l'installe dans `resources/plugins`, où le moteur cherche les plugins
officiels en production (`paths.rs`). Un nouveau plugin est donc inclus sans rien configurer.

## Clé de signature (à ne jamais perdre ni publier)

- Privée : `H:\outils\cles\etabli-mises-a-jour.key`, mot de passe dans
  `H:\outils\cles\etabli-mises-a-jour.mdp.txt`. Hors du dépôt (`*.key` est aussi ignoré).
- **Sauvegarde obligatoire** (clé USB, gestionnaire de mots de passe) : sans elle, les Établi déjà
  installés ne pourront plus se mettre à jour (il faudrait les réinstaller à la main).
- Secrets GitHub du dépôt (Settings → Secrets and variables → Actions), saisis par Bryan :
  `TAURI_SIGNING_PRIVATE_KEY` = **contenu** du fichier `.key` (pas son chemin) et
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = contenu du fichier `.mdp.txt`.
- La clé publique est dans `tauri.conf.json` ; changer de clé = les versions installées refusent les
  mises à jour suivantes.

## Publier une version (pas à pas)

```powershell
. 'H:\outils\env-dev.ps1' | Out-Null
npm run version:app -- 0.2.0          # tauri.conf.json, Cargo.toml, Cargo.lock, package.json
npm run check; npm test; npm run build:plugins
git commit -am "chore: version 0.2.0"
git tag -a v0.2.0 -F notes.txt         # notes en français : ce qui change pour l'utilisateur
git push origin main; git push origin v0.2.0
```

- La version doit **augmenter** (semver) : sinon aucune mise à jour n'est proposée. Le workflow
  refuse une étiquette différente de la version de `tauri.conf.json`.
- Suivre la publication dans l'onglet Actions (« Publication », ~10 min). Une étiquette ratée :
  supprimer la Release et l'étiquette sur GitHub, corriger, recommencer.
- Tester en local sans publier : définir `TAURI_SIGNING_PRIVATE_KEY` (contenu de la clé) et
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, puis `npm run build` ; installateur dans
  `apps/desktop/src-tauri/target/release/bundle/nsis/`. Sous PowerShell 5, une variable mise à `''`
  est supprimée : ne pas utiliser de mot de passe vide.

## Installer (pour les utilisateurs)

- Télécharger `Etabli_<version>_x64-setup.exe` sur la page des Releases et le lancer. Installation
  **par utilisateur** (dans `%LOCALAPPDATA%`), sans droits d'administrateur : utile sur les PC
  d'école.
- L'installateur n'est pas signé par un certificat Windows (payant) : Windows affiche « Windows a
  protégé votre ordinateur » → **Informations complémentaires** → **Exécuter quand même**. Un antivirus
  ou une restriction d'établissement (AppLocker) peut bloquer l'installation : voir avec
  l'administrateur réseau.
- **Contrôle intelligent des applications** (Smart App Control, Windows 11) : il **bloque sans
  recours** tout programme sans signature reconnue (constaté le 29/09/2026 sur le PC d'un camarade,
  v0.1.0). Seule parade sans signature : le désactiver (Sécurité Windows → Contrôle des applications et
  du navigateur) ; depuis la mise à jour d'avril 2026 il se réactive sans réinstaller Windows, mais
  Établi reste bloqué tant qu'il est actif. Vraie solution : signer l'installateur et l'exécutable
  (Authenticode), voir « Pistes ».
- WebView2 (moteur d'affichage) est présent sur Windows 10 et 11 ; l'installateur le télécharge
  s'il manque.

## Pistes

- Signature Windows (Authenticode), indispensable avec le Contrôle intelligent des applications
  (options étudiées le 29/09/2026) :
  - **SignPath Foundation** : gratuit pour les projets libres ; il faut une licence OSI (le dépôt n'en
    a pas encore), l'authentification à deux facteurs, une page « politique de signature » ; éditeur
    affiché : « SignPath Foundation » ; signature dans GitHub Actions ; dossier à faire accepter.
  - **Certum Open Source** : environ 25 € (carte) ou 49 € HT (nuage SimplySign) par an, pour un
    particulier et un projet libre non commercial ; éditeur affiché : le nom du développeur ;
    signature en nuage avec code à usage unique, peu pratique en CI.
  - **Azure Artifact Signing** : 9,99 $/mois, signature automatique en CI ; particuliers : pas la
    France ; entreprises de l'UE : au moins 3 ans d'existence vérifiable, nom de l'entreprise affiché.
- Page de téléchargement (GitHub Pages) plus lisible que la page des Releases.
