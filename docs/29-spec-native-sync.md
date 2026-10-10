# 29 — Native apps and the server: sync and storage only

Status: **decided by Bryan (9–11 Oct 2026), partly built.** For a distribution such as Quotidien, the optional server
(`etabli-serveur`, docs/17) has **one job: store the data and keep a PC and a phone in sync.** All logic and all screens run
in the apps. The server serves no web interface.

## Decisions

1. **The app talks to the API directly.** Windows and Android use the server "fond" (`fond/serveur`, with an offline copy and a queue
   of writes) for calculations and plugin data. Plugins, device settings (AI key, shortcuts, window) and files stay on the device.
2. **No web version served by the server.** `--application` (static web build) and the installable web app are not deployed for
   Quotidien. The web build stays a development tool.
3. **Live updates.** The server pushes a small event when a device saves plugin data (`GET /api/evenements`, server-sent events,
   same account only). The other devices re-read that data and the open page updates in place. If the stream drops, the device
   re-reads everything when it reconnects.
4. **Conflicts.** Plugin data is saved as one value per plugin; two devices editing the same plugin offline end with "last write wins"
   after the version check (docs/16 §3.3). A per-record merge is a later step if it hurts.
5. **No import of local data.** A new install starts empty and fills from the server.
6. **Android updates.** The app checks the distribution's GitHub Release (`androidUpdateUrl`), downloads the APK through Android's
   download manager and opens the installer (the user always confirms). The APKs are signed with one fixed key.

## Built so far

- Native apps use the server fond once connected (Settings → Server); PC ↔ server ↔ phone works.
- `/api/evenements` + live refresh of plugin data (this document's decision 3).
- Android update check and in-app download/installation.

## Left to do

- Remove the web version and the PWA from the Quotidien deployment (compose command without `--application`).
- Nightly backup of the SQLite data folder (14 days kept).
- Re-sign-in screen in the native apps when the server session expires.
- Per-record merge of plugin data, if two-device edits collide too often.