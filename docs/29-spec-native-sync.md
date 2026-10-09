# 29 — Spec (draft): native apps synchronised with the server

Status: **draft, to be validated by Bryan before any code.** Goal: the Windows app and the Android app of a distribution
(Quotidien first) use the optional server (`etabli-serveur`, docs/17) so that the PC and the phone share the same data.
Today only the **web** build can talk to the server; the Tauri apps always use local files.

## What already exists (reused, not rewritten)

- `fond/serveur` (HTTP client + `avecCache`): the server "fond" with an offline copy and a queue of writes replayed on
  reconnection; version check on save (HTTP 409 on conflict, the user chooses reload or overwrite). docs/16 §3.3.
- Sign-in screen, server connection stored under `etabli.connexion`, "import my local data" assistant (web fond only).
- The server stores documents, plugin data, settings, and serves the plugin packages (`.etapl`, signed).

## What is missing

1. `fond/index.ts` returns `fondTauri` whenever `isTauri()`: the connection is never read.
2. The native webview origin (`http://tauri.localhost`, `tauri://localhost` on Android) must be allowed by the server
   (`--origine`), and the server URL must be in the distribution's CSP `connect-src` (`quotidien.conf.json`).
3. `exporterTout` exists only for the web fond: the native local data cannot be imported into the server.
4. Some settings are per device and must **not** sync (see below).

## Proposed design

**D1 — Same code path.** In native apps, if a server connection exists, the fond is `avecCache(creerFondServeur(...))`, exactly
as in the browser. No second sync engine. Without a connection nothing changes (local files).

**D2 — Plugins stay embedded in the native app.** The app ships the plugin versions it was built with (needed offline, tied to
the app version). The server's list of installed packages is used by the web build only. Native apps get new plugin versions
with a new app release. (Alternative: let the server override embedded plugins — more power, much more risk; not proposed.)

**D3 — What syncs.**
| Data | Syncs? |
| --- | --- |
| Documents (calculations, lists, tickets…) | yes |
| Plugin data (`donnees`) and plugin settings | yes |
| Per-device settings: AI key, shortcuts, autostart, window state, theme choice | **no** (stay local) |
| AI key | never leaves the device |

**D4 — Conflicts.** Keep docs/16: version check, 409, user chooses. Plugin data saved as one blob per plugin is the weak
point (two devices editing the same plugin offline): the last writer would ask the user to choose. Accepted for v1; a per-record
merge is a later step if it hurts in practice.

**D5 — Offline.** Native apps always work offline from the local copy; the status (connected / offline / N pending changes)
already shown on the web is reused. Android keeps its native alarms and notifications, which are scheduled from the local copy.

**D6 — Migration.** First connection from a native app with existing local data: the "import my local data" assistant, fed by a
new `exporterTout` on the native fond. Local files are kept as a backup and untouched.

**D7 — Security.** HTTPS only except `localhost`; the token is stored in the app's own storage (not in a shared place); server
URL checked against the CSP; signed packages unchanged. On Tailscale the server is reachable only inside the tailnet — the phone
needs Tailscale running (or a public HTTPS address later).

**D8 — Backup.** Nightly copy of the server data folder (SQLite) on the host, 14 days kept. Not part of the app.

## Steps (each usable alone)

1. Native fond reads the connection; server `--origine` + CSP; sign-in from Settings → Server on Windows. Test: PC ↔ browser.
2. `exporterTout` for the native fond + import assistant.
3. Android: same, tested on the emulator against the real server (Tailscale).
4. Per-device settings split (D3) and the status banner on native.
5. Nightly backup.

## Questions for Bryan

1. **D2**: OK that plugins are updated with the app (not from the server) on PC and phone?
2. **Tailscale on the phone**: acceptable for now, or do you want a public HTTPS address (needs a domain and a port opened)?
3. **Conflicts**: "ask the user" is enough to start with?
4. **Per device**: is anything else in the table that should (or should not) sync (e.g. the theme)?
