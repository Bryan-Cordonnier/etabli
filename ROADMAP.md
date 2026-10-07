# Roadmap

What is planned for Etable, without dates. What is **done** is in the [changelog](CHANGELOG.md); decisions and progress notes are in
[docs/22-cahier-de-bord.md](docs/22-cahier-de-bord.md) (section 9). Missing an idea? [Open an issue](https://github.com/etable-project/etable/issues/new/choose);
we decide before we code.

## In progress, in this order

1. **Cut what does not belong to the engine.** Done: the metalworking plugins, the domain code (suppliers, machines, workshop
   sheets, DXF), and the plugin store (catalogue, signed catalogue, key rotation, revocation). Plugins now install from a signed file.
2. **Android on Tauri mobile**, in place of Capacitor, with the native-bridge fix validated by the spike
   ([docs/26](docs/26-tauri-android-spike.md)). Done: the engine builds for Android and the Capacitor project is gone. Still to do: delete the web
   build and the browser storage once a Tauri client can talk to the server (step 4), and replace the browser-based isolation tests.
3. **English everywhere**: repository, code identifiers, commands, commits and documentation. The interface stays in French for
   now, written so that it can be translated.
4. **A minimal server**: command line only, PostgreSQL only, organisations from the start, stateless, no panel, documented deployment.
5. **Rename the application** (installer name, identifiers, update endpoint), which is why it comes last.

## Not planned in this repository

- A plugin catalogue, a store, licences or accounts for selling plugins: these belong to separate, closed distributions built on the engine.
- A web or iPhone version. Only Windows and Android.
- Telemetry or advertising.