# 26 — Tauri on Android: spike results (6 October 2026)

> **Adopted (7 October 2026).** The result below is now the real Android build: the engine in `apps/desktop` builds for Android with Tauri mobile (`npm run android:init` then `npm run android:build`, workflow *Android*). The Kotlin fix lives in `apps/desktop/src-tauri/android/MainActivity.kt` and is applied, with the exact-alarm permissions, by `appliquer-correctifs.mjs` (it fails if anything is missing). The throwaway spike in `tools/spike-tauri-android`, the Capacitor project (`apps/mobile`) and the Capacitor probes were deleted; see the Git history for them.

Throwaway test in `tools/spike-tauri-android` (deleted) (workflow `.github/workflows/spike-tauri-android.yml`
builds a debug APK). It answers: can Tauri 2 replace Capacitor as the Android shell, so that Windows and Android share one Rust core?

## Verdict

**Yes, with one mandatory fix** (the native bridge, below). Notifications and the plugin sandbox work.

| Question | Real phone (Android 10) | Emulator (Android 14, API 34) |
| --- | --- | --- |
| Scheduled notification fires on time, app closed | **pass** | **pass** (18 ms late, app in the background) |
| Sandboxed iframe loads a page from the custom protocol `plugins` | pass | pass |
| Document origin is opaque (`window.origin === "null"`), no storage | pass | pass |
| Network blocked by the page CSP | pass | pass |
| **Native bridge closed to plugin frames** | **FAIL, then pass with the fix** | **pass with the fix** |

Windows (WebView2, `tauri dev`): the bridge is closed without any fix; the two sandboxed pages are isolated and no call from a plugin
frame reached the engine. Not yet checked with the installer build.

## The bridge problem (Android only)

Three facts, each read in the sources (`wry` 0.57, `tauri` 2.12) and then confirmed by running the spike:

1. wry exposes the engine bridge with `addJavascriptInterface("ipc")`. **Android shows that object to every frame**, plugin iframes included.
2. Tauri injects its initialisation scripts (`__TAURI_INTERNALS__`, with the real invoke key) in **all frames** on Android
   (`addDocumentStartJavaScript(..., setOf("*"))`) and, per the wry docs, on Windows too.
3. The URL that accompanies an IPC message is the **top-level page URL** on Android (documented limitation: "the request URL is not
   supported on iframes"). Tauri's origin check therefore cannot tell the app from a plugin.

Result before the fix: a sandboxed plugin called `window.__TAURI_INTERNALS__.invoke("plugin:event|emit", …)` and the engine accepted it
(the main page received the event). The same call would reach every command allowed by the capabilities (documents, settings, plugin installation…).
A forged message with a *wrong* invoke key is rejected, so that test proves nothing: use the frame's own injected functions.

## The fix

`tools/spike-tauri-android/android/MainActivity.kt` (copied over the generated `MainActivity.kt` by the workflow):

- replace the `ipc` JavaScript interface by `WebViewCompat.addWebMessageListener("ipc", setOf("http://tauri.localhost"), …)`:
  only documents served from the app origin get `window.ipc`, and the real `sourceOrigin` is passed to `Rust.ipc`;
- **run it after wry added its interface**. wry's order is: create view → `onWebViewCreate` hook → start loading → add the `ipc`
  interface. Removing the interface inside the hook removes nothing (first attempt, still open). The code posts to the view's queue and
  then reloads the first document;
- **fail closed**: if the WebView lacks `WEB_MESSAGE_LISTENER`, the activity refuses to start.

After the fix, inside a plugin frame: `window.ipc === undefined`, the injected `invoke` rejects with `Cannot read properties of undefined
(reading 'postMessage')`, no event reaches the engine, and the main page still talks to the engine normally.

Keep the page CSP strict anyway (`connect-src 'none'`, add `form-action 'none'`, `frame-src 'none'`): the `ipc://` custom protocol is a second
path that only the CSP and the origin check close.

## Other findings

- `tauri-plugin-notification` (2.5.1) is a port of Capacitor's local notifications: `setExactAndAllowWhileIdle` when
  `canScheduleExactAlarms()`, boot restore receiver included. It has **no command to open the "Alarms & reminders" settings page**.
  The app must declare `SCHEDULE_EXACT_ALARM` and `USE_EXACT_ALARM` itself (the workflow patches the generated manifest).
  `USE_EXACT_ALARM` is granted automatically and is fine for a personal APK, but is restricted on the Play Store.
- The Android emulator did not report `SCHEDULE_EXACT_ALARM` as explicitly granted (`appops` default mode) yet the exact notification fired;
  re-check on a real Android 14+ phone before relying on it.
- Tauri's generated Android project needs no Java: only this one Kotlin file.

## Reproduce without a phone

Emulator (installed under `H:\outils`, nothing on `C:`): JDK 17, Android command-line tools, `platform-tools`, `emulator`, system image
`system-images;android-34;google_apis;x86_64`, a hand-written AVD in `H:\outils\android-avd`. WHPX (Windows Hypervisor Platform) is
enough, no Hyper-V setup needed. Notes:

- Use `curl.exe` to download: PowerShell's `Invoke-WebRequest` was 400× slower here (progress bar).
- `sdkmanager.bat` splits arguments at `;`: call `android.exe --sdk=… sdk install "system-images;…"` instead.
- `android emulator create <profile>` ignores `ANDROID_AVD_HOME`, downloads its own image and writes to the user profile: write the AVD
  `config.ini` by hand instead.
- Drive the page: `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`, then the Chrome DevTools protocol
  (Node's built-in `WebSocket`, `Runtime.evaluate`) to click and read the log.

## What this changes in the plan

- Android shell: **Tauri mobile** instead of Capacitor, provided the Kotlin bridge fix above is part of the Android project.
- Can be deleted afterwards: the Capacitor project, the Java origin-per-plugin code, the web/PWA build, IndexedDB storage, the web hosting
  tests (`docs/19` section 7).
- To do before adopting: run the real engine (not the spike) on the emulator, check the per-plugin isolation with the real `plugins://`
  handler, test boot persistence of scheduled notifications, test on a real Android 14+ device.
