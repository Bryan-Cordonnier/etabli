# 27 — Building a distribution on Etable (and the Android build)

A **distribution** is an application built on the Etable engine: its own name, identifier, plugins and release pipeline, in its
own repository. [Quotidien](https://github.com/Bryan-Cordonnier/quotidien) (private, personal) is the first one; Etablink will be another.
The engine ships **no plugin** and no store; a distribution brings its plugins at build time.

## What a distribution repository contains

```
etable/                 the engine, as a Git submodule (a fixed version; update it on purpose)
plugins/<id>/           the distribution's plugins (each one a self-contained npm package with its own manifest and changelog)
<name>.conf.json        Tauri configuration overrides: productName, identifier, version, windows, bundle metadata
scripts/tauri.mjs       runs the engine's Tauri CLI with the override file and ETABLE_PLUGINS_DIR set
package.json            npm workspaces: etable/packages/*, etable/apps/desktop, plugins/*
.npmrc                  legacy-peer-deps=true (the engine's TypeScript 7 / svelte-check peer ranges)
```

The root `package.json` pins `typescript` to `~6.0.3`: `svelte-check` needs TypeScript 6 at the root while the desktop app and plugins
use 7, exactly as in this repository's lockfile.

## How plugins get into the application

At compile time, `ETABLE_PLUGINS_DIR` points to a folder of plugins. `apps/desktop/src-tauri/build.rs` packs every sub-folder that has a
compiled `dist/manifest.json` (or a `manifest.json` at its root) into an uncompressed zip embedded in the binary. At start-up
`integres.rs` writes it to the `integres` folder of the configuration directory (only when its fingerprint changed) and the engine scans
that folder like any other plugin root. This works the same on Windows and Android, where APK resources are not real files.
In a debug build, a run-time `ETABLE_PLUGINS_DIR` (and the repository's own `plugins/` on desktop) is read first, so plugins can be edited
without recompiling Rust.

Plugins installed by the user from a signed `.etabli-plugin` file go to `installes` and are checked against the public key of the
distribution's `tauri.conf.json` (`plugins.updater.pubkey`).

## Android

```bash
npm run android:init    # tauri android init, then src-tauri/android/appliquer-correctifs.mjs
npm run android:build   # tauri android build --apk
```

`appliquer-correctifs.mjs` replaces the generated `MainActivity.kt` with the engine's (closes the native bridge to plugin frames, keeps
the content below the system bars) and adds the `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` permissions. It exits with an error if
anything it expects is missing: better no APK than an APK with an open bridge (docs/26).

The Android build needs the Rust targets (`rustup target add aarch64-linux-android x86_64-linux-android`), the Android NDK 27, JDK 17+ and
`ANDROID_HOME` / `NDK_HOME`. CI (`.github/workflows/android.yml`) does it on Linux. A local build on Windows needs **Developer Mode**
(Tauri creates symbolic links); without it, use the CI artifact.

Things learnt on the emulator (Android 14), now covered by the code:

- Reminders must go through the notification plugin's `batch` command **with `sourceJson`**: `sendNotification` does not store the
  notification, so nothing is restored after a reboot and `pending` is empty.
- `adb shell am force-stop` cancels the app's alarms; to test "app closed", send it to the background and use `am kill`.
- Every CI build signs its debug APK with a different key: uninstall before installing a newer one. A stable signing key will be needed
  to update an installed APK in place.
- Documents live in the app's private storage (`app_data_dir/documents`), not in the shared Documents folder.

## Not done yet

- Signing and updating a distribution (updater key, Android release key).
- Replacing the engine's browser-based isolation tests by a test of the real WebView (a Windows CI run of the app driven over CDP).

## What a distribution can change in the interface

A distribution may ship a `distribution.json`; the build reads the file named by `ETABLE_DISTRIBUTION` (`scripts/tauri.mjs` sets it, and
so does the preview configuration) and `vite.config.ts` bakes it into the app (`__DISTRIBUTION__`). Everything is optional and read
defensively (`lib/distribution.ts`, tested): a missing or invalid field keeps Etable's value.

| Field | Effect |
| --- | --- |
| `name` | Name shown at the top of the sidebar |
| `pluginsPage` | `false` removes the *Plugins* entry from the sidebar and the command palette. The plugins stay manageable in *Settings → Installed plugins*. For distributions with a fixed set of plugins |
| `themes` | A list of full themes (`id`, `name`, `base`, all colour tokens). The user then chooses among them and *Like Windows* (which picks the light or the dark one and follows Windows live); importing and copying themes is hidden. A theme saved from another build falls back to *Like Windows* |
| `logo` | Shapes of the logo (`path`, `circle`, `rect`, `line`, `polyline`, `polygon`, `ellipse`, stroke `currentColor`, 24x24). Anything else is refused |
| `logoPlein` / `logoViewBox` | `logoPlein: true` : le logo a ses propres couleurs et son propre fond (celui de l'icône de l'application) et s'affiche tel quel, dans le repère `logoViewBox` (`0 0 1024 1024`), sans carré d'accent |
| `tabs` | `false` : pas d'onglets, une seule page à la fois ; la barre de titre montre le titre de la page, la recherche et les boutons de la fenêtre |
| `ia` | `true` : *Settings → Artificial intelligence* appears (the user's own Gemini key, kept on the machine and never given to a plugin) and plugins with the `ia` permission can call `etabli.ai.extraire`. The host window does the call, so the distribution must allow `https://generativelanguage.googleapis.com` in `connect-src` of its Tauri CSP (plugin frames keep their own CSP and can never reach the network) |
| `apercu` | `\"widgets\"`: the quick preview shows the home board (read-only; a click opens the page in the main window) instead of the favourite pages |
| `accueilCouleur` | Colour of the *Home* tile (`#4d3d99`); with it, the tile is solid like the other pages, and a distribution icon named `home` (see `icons`) replaces the house |
| `icons` | Icons of the distribution by name (`calendrier`…), same shapes as the logo but filled (`currentColor`). A plugin of the distribution can then give a page `icon: "calendrier"`; the validator accepts these names when `ETABLE_DISTRIBUTION` is set |

The application icon is separate: the distribution's `bundle.icon` in its Tauri configuration.