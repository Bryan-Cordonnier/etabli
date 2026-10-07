<h1 align="center">Etable</h1>

<p align="center">
  <strong>A small, sandboxed plugin engine for desktop and Android apps.</strong><br>
  Local-first. Open source. No catalogue, no account, no telemetry.
</p>

<p align="center">
  <a href="https://github.com/etable-project/etable/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/etable-project/etable?label=release&color=2b63d9"></a>
  <a href="https://github.com/etable-project/etable/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/etable-project/etable/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1f9d63"></a>
  <img alt="Windows 10 and 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-555">
</p>

> **Project status (October 2026): restructuring.** This repository used to be *Établi*, a metalworking toolbox. It is
> becoming **Etable**, a general engine for plugin-based apps. The old toolbox is frozen under the Git tag
> [`legacy/etabli-0.5-chaudronnerie`](https://github.com/etable-project/etable/tree/legacy/etabli-0.5-chaudronnerie) and in
> release [v0.5.0](https://github.com/etable-project/etable/releases/tag/v0.5.0). The installer and the interface still say
> "Établi" for now, and most documentation is still in French; both are being converted. See the [roadmap](ROADMAP.md).

## What it is

Etable runs **plugins**. A plugin is a folder with a manifest and one or more **mini-apps**: small web pages shown in an
isolated frame. The engine connects them to the user's data through an SDK, so a plugin can never touch the disk or the network
by itself.

- **Sandboxed by default.** Each mini-app runs in an `<iframe sandbox>` with an opaque origin, a strict content security policy
  and a private message channel. Every message is checked by the host against the permissions the plugin declared.
- **Local-first.** Documents and settings are plain files on your machine. An optional server (accounts, shared spaces) exists,
  and is meant to stay minimal and self-hosted.
- **Plugins talk to each other** through declared services, with the caller's identity enforced by the engine.
- **No store.** The engine has no catalogue and no licence check. A plugin is a signed `.etabli-plugin` file that you install
  from a file; the engine verifies the signature before writing anything.
- **Windows and Android.** Both run the same Rust core (Tauri 2 and Tauri mobile); the native bridge is closed to plugin frames on
  Android (see [docs/26](docs/26-tauri-android-spike.md)).

Distributions (full applications built on the engine) live in their own repositories. **Etable ships no plugin of its own**:
the four plugins in `plugins/` (finances, agenda, budget, payroll) are working examples that will move to the private
application they were written for.

## Build from source

Requirements: Windows 10 or 11, Node.js 24 (22.18 at minimum), stable Rust (MSVC toolchain), Visual Studio Build Tools (C++),
WebView2. Details: [docs/02-environnement.md](docs/02-environnement.md).

```bash
git clone https://github.com/etable-project/etable.git && cd etable
npm install
npm run dev                  # builds the plugins, then starts the app
npm run build                # produces the Windows installer
```

Checks that CI runs on every pull request:

```bash
npm run check                # types (engine, SDK, plugins)
npm test                     # tests (calculations, SDK, UI kit)
npm run test:scripts         # tests of the build and release scripts
npm run valider -- --tous    # validates every plugin manifest
npm run liens                # checks the links of the documentation
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

## Write a plugin

```bash
npm run nouveau-plugin -- demo "Demo"     # creates plugins/demo with an example mini-app
npm run dev                               # runs the engine with your plugin
npm run valider -- demo                   # checks the manifest and the content
npm run paquet -- demo                    # builds paquets/demo-<version>.etabli-plugin (signed)
```

- Step-by-step guide: [docs/07-creer-un-plugin.md](docs/07-creer-un-plugin.md)
- Message protocol and SDK: [docs/06-protocole-sdk.md](docs/06-protocole-sdk.md), [packages/sdk](packages/sdk/README.md)
- Isolation model and permissions: [docs/19-modele-de-menace-plugins.md](docs/19-modele-de-menace-plugins.md)

## Repository layout

```
apps/desktop/    the engine: Tauri 2 / Tauri mobile (Rust) shell and Svelte 5 interface
crates/noyau/    shared rules (identifiers, documents, signed packages), no I/O
crates/serveur/  optional server (accounts, shared documents, plugins)
packages/sdk/    @etabli/sdk: protocol and API for mini-apps
packages/ui/     @etabli/ui: components and helpers for mini-apps
plugins/         example plugins
scripts/         validation, packaging, release tooling
docs/            documentation (start with AGENTS.md and docs/README.md)
```

To take over the code, read [AGENTS.md](AGENTS.md): it is the table of contents of the [technical documentation](docs/README.md).

## Contributing

Bug reports, ideas and pull requests are welcome; please read the [contributing guide](CONTRIBUTING.md) and the
[code of conduct](CODE_OF_CONDUCT.md). New features are discussed in an issue **before** any code is written.

- A problem? [Open an issue](https://github.com/etable-project/etable/issues/new/choose).
- A question? See [SUPPORT.md](SUPPORT.md).
- A security flaw? **No public issue**: see [SECURITY.md](SECURITY.md).
- What changed: [CHANGELOG.md](CHANGELOG.md). What is planned: [ROADMAP.md](ROADMAP.md).

## Credits and licence

Etable is released under the [MIT licence](LICENSE) by [Bryan Cordonnier](https://github.com/Bryan-Cordonnier) and contributors.
It builds on [Tauri](https://tauri.app), [Svelte](https://svelte.dev) and other open-source projects: see
[THIRD-PARTY.md](THIRD-PARTY.md).
