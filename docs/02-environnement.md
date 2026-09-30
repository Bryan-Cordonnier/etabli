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
Une étiquette `v1.2.3` lance en plus `.github/workflows/publier.yml` : installateur signé publié
dans les Releases (voir [14-publier-une-version.md](14-publier-une-version.md)).

## Voir l'interface sans Rust (aperçu navigateur)

`npm run dev -w @etabli/desktop` sert l'interface sur `http://localhost:1420`. Hors de Tauri :
- `lib/api.ts` bascule sur des remplacements : documents et données de plugin dans `localStorage`,
  commandes système sans effet ;
- les plugins sont servis par Vite sous `/__plugins/<id>/…` (middleware dans
  `apps/desktop/vite.config.ts`) ; il faut avoir lancé `npm run build:plugins` ;
- le cadre des mini-apps reçoit `allow-same-origin` (certains navigateurs bloquent les cadres à
  origine opaque) ; dans l'application, il reste strictement isolé.

Le fichier local `.claude/launch.json` (ignoré par Git) déclare cette configuration pour l'outil de
prévisualisation de l'agent (serveur « interface », port 1420).

**Une mini-app seule** : `npx vite plugins/<id> --port 518x` sert le plugin sans le moteur
(`http://localhost:518x/apps/<mini-app>/index.html`). La mini-app s'affiche avec ses valeurs par
défaut (`connect()` n'aboutit jamais : rien n'est enregistré, les réglages du plugin restent ceux par
défaut) ; on remplit les champs en déclenchant l'évènement `input`. Configurations locales :
« plugin-tracage » (5181), « plugin-materiaux » (5182), « plugin-economie » (5183). Chaque
modification recharge la page : les valeurs saisies sont perdues.

## Pièges connus

| Piège | Solution |
| --- | --- |
| Vite 8 : `minify: "esbuild"` échoue | laisser `minify: !TAURI_ENV_DEBUG` (Oxc) |
| Application installée sans plugins (0.1.0 et 0.1.1) | Tauri crée les fenêtres de la config **avant** `setup` ; installée, la page se charge instantanément et demande plugins et réglages avant que `AppState` existe (erreur avalée → liste vide). Les fenêtres ont `"create": false` et sont créées dans `setup` après `app.manage(AppState)`. En développement le bug ne se voit pas (page servie lentement par Vite) : tester une version compilée |
| Tester une version compilée alors qu'Établi installé tourne | une seule instance par identifiant : compiler avec `--no-bundle --config` (identifiant `fr.etabli.essai`), lancer `target/release/etabli.exe` avec `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` et lire la page par `http://127.0.0.1:9333/json` (protocole DevTools) ; supprimer ensuite `%LOCALAPPDATA%\fr.etabli.essai` |
| `npm run build` écrit sur `C:` | Tauri télécharge WiX (et NSIS) dans `%LOCALAPPDATA%\tauri` : pas de réglage pour le déplacer ; exception tolérée à la règle « rien sur C: » |
| `TAURI_SIGNING_PRIVATE_KEY` : « failed to decode base64 » | la variable attend le **contenu** de la clé, pas son chemin ; sous PowerShell 5, `$env:X = ''` supprime la variable (mot de passe vide impossible) |
| L'aperçu rapide se fermait à l'ouverture | WebView2 émet `Focused(false)` quand le focus passe à la page : la perte de focus est détectée **par la page** (`Apercu.svelte`), pas par Rust |
| Styles bloqués dans une fiche imprimée | Tauri ajoute des empreintes à `style-src` (ce qui annule `unsafe-inline`) : `dangerousDisableAssetCspModification: ["style-src"]` dans `tauri.conf.json` |
| JSON passé en argument PowerShell perd ses guillemets | écrire un fichier (script `.mjs`, JSON) et le passer par chemin |
| Deux manifestes pour un plugin | le manifeste d'un plugin compilé va dans `public/manifest.json` (copié dans `dist/`), jamais à la racine du plugin |
| Un terminal ouvert sans `env-dev.ps1` | l'application de dev écrit alors sur `C:` : fermer et rouvrir avec le script |
| Effet « acrylique » de Windows sur l'aperçu | il apparaît d'un coup (non animable) ; Bryan a refusé aussi la capture d'écran floutée : l'aperçu utilise un simple voile en fondu |
