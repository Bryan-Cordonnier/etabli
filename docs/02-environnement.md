# 02 — Environnement de développement

## Le poste de Bryan

- Le code est dans **`H:\Etabli`**. `H:` est un Dev Drive (disque virtuel stocké dans
  `Documents\DevEtabliApp`). Bryan veut un Windows propre : **rien n'est installé sur `C:`**.
- Outils sur `H:\outils` : Rust (`rustup`, `cargo`), Git portable (`git`), Build Tools MSVC
  (`buildtools`), cache npm. Aucune variable d'environnement permanente.
- Windows 11 IoT Enterprise LTSC : **pas de winget**. N'installez rien sans le demander.
- Le script **`H:\outils\env-dev.ps1`** active tout pour le terminal courant uniquement. Chaque
  commande PowerShell d'un agent doit commencer par :

  ```powershell
  . 'H:\outils\env-dev.ps1' | Out-Null; <commande>
  ```

  Il définit `RUSTUP_HOME`, `CARGO_HOME`, `npm_config_cache`, le `PATH` (cargo, git\cmd) et :
  - `ETABLI_DATA_DIR = H:\outils\etabli-data` : documents et réglages de l'application **en
    développement** (sinon elle écrirait dans `Documents\Etabli` et `%APPDATA%\Etabli` sur `C:`) ;
  - `WEBVIEW2_USER_DATA_FOLDER = H:\outils\etabli-data\webview` : cache WebView2 hors de `C:`.
- Bryan lance lui-même l'application avec `H:\Terminal Etabli.cmd` puis `npm run dev`.

## Git

- Identité locale au dépôt : Bryan Cordonnier, e-mail noreply GitHub. `credential.helper = manager`
  local : le `git push` fonctionne sans fenêtre de connexion.
- On travaille directement sur `main`, un commit par changement cohérent, puis `git push`.
- **Messages de commit** : écrire le message dans un fichier **UTF-8 sans BOM**, puis
  `git commit -F fichier`. PowerShell 5.1 (`Out-File -Encoding utf8`) ajoute un BOM qui se retrouve
  dans le titre du commit : utilisez l'outil d'écriture de fichiers de l'agent, ou
  `[IO.File]::WriteAllText(chemin, texte, (New-Object Text.UTF8Encoding $false))`.

## Vérifier avant de commiter

```powershell
. 'H:\outils\env-dev.ps1' | Out-Null; npm run check; npm test; npm run build:plugins
# si le Rust a changé :
. 'H:\outils\env-dev.ps1' | Out-Null; Set-Location apps/desktop/src-tauri; cargo fmt; cargo clippy --all-targets; cargo test; Set-Location H:\Etabli
```

La CI (`.github/workflows/ci.yml`, Windows) exécute : `npm ci`, `npm run check`, `npm test`,
`npm run build:plugins`, `npm run build -w @etabli/desktop`, `cargo fmt --check`,
`cargo clippy --all-targets -- -D warnings` (les avertissements sont des erreurs), `cargo test`.

## Voir l'interface sans Rust (aperçu navigateur)

`npm run dev -w @etabli/desktop` sert l'interface sur `http://localhost:1420`. Hors de Tauri :
- `lib/api.ts` bascule sur des remplacements : documents et bibliothèques dans `localStorage`,
  commandes système sans effet ;
- les plugins sont servis par Vite sous `/__plugins/<id>/…` (middleware dans
  `apps/desktop/vite.config.ts`) ; il faut avoir lancé `npm run build:plugins` ;
- le cadre des mini-apps reçoit `allow-same-origin` (certains navigateurs bloquent les cadres à
  origine opaque) ; dans l'application, il reste strictement isolé.

Le fichier local `.claude/launch.json` (ignoré par Git) déclare cette configuration pour l'outil de
prévisualisation de l'agent (serveur « interface », port 1420).

## Pièges connus

| Piège | Solution |
| --- | --- |
| Vite 8 : `minify: "esbuild"` échoue | laisser `minify: !TAURI_ENV_DEBUG` (Oxc) |
| L'aperçu rapide se fermait à l'ouverture | WebView2 émet `Focused(false)` quand le focus passe à la page : la perte de focus est détectée **par la page** (`Apercu.svelte`), pas par Rust |
| Styles bloqués dans une fiche imprimée | Tauri ajoute des empreintes à `style-src` (ce qui annule `unsafe-inline`) : `dangerousDisableAssetCspModification: ["style-src"]` dans `tauri.conf.json` |
| JSON passé en argument PowerShell perd ses guillemets | écrire un fichier (script `.mjs`, JSON) et le passer par chemin |
| Deux manifestes pour un plugin | le manifeste d'un plugin compilé va dans `public/manifest.json` (copié dans `dist/`), jamais à la racine du plugin |
| Un terminal ouvert sans `env-dev.ps1` | l'application de dev écrit alors sur `C:` : fermer et rouvrir avec le script |
| Effet « acrylique » de Windows sur l'aperçu | il apparaît d'un coup (non animable) ; Bryan a refusé aussi la capture d'écran floutée : l'aperçu utilise un simple voile en fondu |
