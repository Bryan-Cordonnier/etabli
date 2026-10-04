# 04 — Cœur Rust (`apps/desktop/src-tauri`)

## Modules

| Fichier | Rôle |
| --- | --- |
| `src/lib.rs` | Construction de l'application : greffons, protocole `plugins`, `setup`, fermeture de la fenêtre (vers la zone de notification ou quitter), liste des commandes. `AppState` : chemins, plugins chargés (`RwLock`, relus par `reload_plugins` sans redémarrer), réglage « fermer dans la zone de notification ». Les fenêtres (`"create": false`) sont créées dans `setup` après `app.manage(AppState)` |
| `src/main.rs` | appelle `etabli_lib::run()` |
| `src/paths.rs` | `AppPaths` : dossier des documents, dossier de configuration, dossier `catalogue` (plugins installés), racines des plugins avec leur `Source` (intégrés = dépôt en développement ; catalogue ; utilisateur) ; `ETABLI_DATA_DIR` les redirige en développement |
| `src/plugins.rs` | scan des plugins (dossiers commençant par un point ignorés), `Source`, `plugins_list`, service des fichiers (`serve`, `safe_join`, CSP des mini-apps, types MIME) |
| `src/catalogue.rs` | catalogue de plugins : `catalogue_lire` (catalogue.json de la Release « catalogue »), `plugin_installer` (téléchargement depuis les Releases du dépôt seulement, progression `etabli:installation`), `plugin_installer_fichier`, `plugin_desinstaller` ; paquet `.etabli-plugin` vérifié (minisign, clé de `tauri.conf.json`) avant toute écriture, extraction bornée qui refuse les chemins hors du dossier, remplacement d'un bloc (règles communes dans `crates/noyau`, partagées avec le serveur) ; catalogue signé (format 2) vérifié et retenu dans `<config>/catalogue-etat.json` (dernière séquence vue, révocations), version révoquée ou plus ancienne refusée (`controler_installation`), ancien format non signé accepté seulement tant qu'aucun catalogue signé n'a été vu ; version précédente gardée (`.precedent/<id>`) et `plugin_revenir` (échange courante/précédente, refusé si révoquée) ; `plugins_list` ajoute `revoque` et `precedente` ; `nettoyer` au démarrage ; événement `etabli:plugins` |
| `src/documents.rs` | `Library` : lister, lire, enregistrer (écriture atomique, renommage si le titre change), mettre à la corbeille ; commandes `documents_*` |
| `src/store.rs` | `settings.json` : lecture au démarrage et commandes `store_load` / `store_save` |
| `src/donnees.rs` | fichiers JSON de `<config>/donnees/` (réglages de plugin, services publiés par les plugins) : `donnees_lire` / `donnees_ecrire`, noms validés |
| `src/files.rs` | `write_atomic` (écrit à côté puis renomme), `fichier_enregistrer` (boîte « Enregistrer sous » ; prête pour les exports, pas encore appelée par l'interface), `tests::scratch` (dossier temporaire de test) |
| `src/apercu.rs` | aperçu rapide : `toggle` (positionne sur l'écran de la souris, affiche, émet `apercu:ouvert`, ou demande la fermeture avec `apercu:fermer`), `show_main`, commandes |
| `src/raccourci.rs` | raccourci global de l'aperçu (défaut `Ctrl+Shift+Space`), changement à chaud, état et erreur |
| `src/tray.rs` | icône de la zone de notification : Ouvrir l'Établi, Aperçu rapide, Quitter |

## Commandes appelées par l'interface

Le stockage, les plugins et le catalogue passent par le **fond** (`apps/desktop/src/lib/fond/`, exporté sous le nom `api`
par `lib/api.ts`) : `fond/tauri.ts` appelle ces commandes, `fond/navigateur.ts` les remplace dans un simple navigateur.
Les commandes de fenêtre, de raccourci et de démarrage (objet `system`) restent dans `lib/api.ts`.

| Commande | Rôle |
| --- | --- |
| `plugins_list` | manifestes des plugins chargés, statut officiel et `source` (`integre`, `catalogue`, `utilisateur`) |
| `catalogue_lire`, `plugin_installer`, `plugin_installer_fichier`, `plugin_desinstaller`, `plugin_revenir` | catalogue de plugins (voir `catalogue.rs`) |
| `documents_list`, `document_read`, `document_save`, `document_delete` | calculs `.etabli` |
| `store_load`, `store_save` | `settings.json` |
| `donnees_lire`, `donnees_ecrire` | `donnees/<nom>.json` (`fournisseurs`, `machines`, `plugin.<id>`) |
| `apercu_basculer`, `apercu_fermer`, `etabli_afficher` | fenêtres |
| `raccourci_definir`, `raccourci_etat` | raccourci global |
| `fermeture_zone_definir` | fermer la fenêtre = la cacher dans la zone de notification |
| `infos_app` | version, dossiers documents et configuration |
| `journal` | recopie une erreur de l'interface dans le journal |
| `fichier_enregistrer` | « Enregistrer sous » + écriture (exports à venir) |

Événements : `apercu:ouvert`, `apercu:fermer` (Rust → aperçu) ; `etabli:ouvrir`, `etabli:machine`,
`etabli:envoyer` (aperçu → fenêtre principale) ; `etabli:plugins` (liste des plugins changée), `etabli:installation` (progression d'un téléchargement).

## Lancement

- `single-instance` : relancer l'application ramène la fenêtre existante ; avec l'argument
  `--apercu`, elle bascule l'aperçu rapide.
- `--demarrage` (ajouté par le démarrage automatique avec Windows) : l'application reste cachée
  dans la zone de notification.
- Journal (`tauri-plugin-log`) seulement en développement, dans le terminal.

## Configuration (`tauri.conf.json`)

- Fenêtre `main` : 1280 × 800, sans décorations, invisible au démarrage. Fenêtre `apercu` :
  `apercu.html`, transparente, sans ombre, `alwaysOnTop`, `skipTaskbar`, invisible.
- CSP de l'application ; `dangerousDisableAssetCspModification: ["style-src"]` (sinon les styles des
  fiches imprimées seraient bloqués).
- Installateur NSIS par utilisateur, en français.
- Permissions dans `capabilities/default.json` (fenêtres `main` et `apercu`) : déplacer, réduire,
  agrandir, fermer, cacher, zoom de la page, démarrage automatique, ouverture de liens. **Les
  commandes de l'application (ci-dessus) n'ont pas besoin d'y figurer** ; un nouveau greffon Tauri
  appelé depuis l'interface, si.

## Ajouter une commande

1. Écrire la fonction dans le module concerné :
   ```rust
   #[tauri::command]
   pub fn ma_commande(state: tauri::State<'_, crate::AppState>, nom: String) -> Result<Value, String> { … }
   ```
   Renvoyer `Result<_, String>` avec un message en français lisible par l'utilisateur.
2. L'ajouter à `tauri::generate_handler![…]` dans `lib.rs`.
3. L'exposer dans l'interface `Fond` (`lib/fond/types.ts`), l'implémenter dans `fond/tauri.ts` (`invoke("ma_commande", { nom })`)
   **et** dans `fond/navigateur.ts` (ou la faire échouer avec un message clair), puis ajouter son cas à
   `fond/tauri.test.ts` (noms de commande et d'arguments). Les noms d'arguments côté JS sont ceux de Rust. Une commande de
   fenêtre ou de système va plutôt dans l'objet `system` de `lib/api.ts`.
4. Test unitaire dans le module (`#[cfg(test)] mod tests`, dossier temporaire via
   `crate::files::tests::scratch("nom")`).
5. `cargo fmt`, `cargo clippy --all-targets` (zéro avertissement), `cargo test`.

## Règles

- Tout chemin issu de l'interface est validé (identifiants `[a-z0-9-]`, noms de fichiers sans `/`,
  `\`, `..`, pas de fichier caché).
- Écritures toujours via `write_atomic`.
- Messages d'erreur et commentaires en français ; identifiants Rust en français ou en anglais selon
  le module existant (suivre le style du fichier).
