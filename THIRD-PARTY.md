# Logiciels tiers

Établi est publié sous [licence MIT](LICENSE). Il repose sur des projets libres, cités ici avec leur licence. Le
texte complet de chaque licence est fourni avec chaque paquet (dossier `node_modules/<paquet>` après `npm install`,
sources des crates après `cargo fetch`) ; les licences d'ensemble des dépendances indirectes se relèvent avec
`cargo metadata` (Rust) et `npm ls --all` (JavaScript).

## Dans l'application

| Projet | Sert à | Licence |
| --- | --- | --- |
| [Tauri](https://tauri.app) 2 et ses extensions (`autostart`, `dialog`, `global-shortcut`, `log`, `opener`, `process`, `single-instance`, `updater`) | fenêtre native, installateur, mises à jour, raccourci global | Apache-2.0 ou MIT |
| [Svelte](https://svelte.dev) 5 | interface (compilée dans l'application et les plugins) | MIT |
| [three.js](https://threejs.org) | aperçus 3D (Économie de matière, Traçage) | MIT |
| [Lucide](https://lucide.dev) (`@lucide/svelte`) | icônes | ISC |
| [Inter](https://rsms.me/inter/) (`@fontsource-variable/inter`) | police de l'interface | SIL Open Font License 1.1 |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (`@fontsource/jetbrains-mono`) | police des nombres | SIL Open Font License 1.1 |
| [reqwest](https://github.com/seanmonstar/reqwest), [rustls](https://github.com/rustls/rustls) | téléchargement du catalogue et des plugins | MIT ou Apache-2.0 ; Apache-2.0, ISC ou MIT |
| [minisign-verify](https://github.com/jedisct1/rust-minisign-verify) | vérification de la signature des plugins | MIT |
| [zip](https://github.com/zip-rs/zip2), [flate2](https://github.com/rust-lang/flate2-rs) | lecture des paquets de plugins | MIT |
| [serde](https://serde.rs), [serde_json](https://github.com/serde-rs/json), [uuid](https://github.com/uuid-rs/uuid), [base64](https://github.com/marshallpierce/rust-base64), [log](https://github.com/rust-lang/log) | données, identifiants, journal | MIT ou Apache-2.0 |
| [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (Microsoft) | affichage de l'interface, fourni par Windows | licence Microsoft |

## À la fabrication seulement

[Vite](https://vite.dev), [Vitest](https://vitest.dev), [TypeScript](https://www.typescriptlang.org),
[svelte-check](https://github.com/sveltejs/language-tools), [fflate](https://github.com/101arrowz/fflate) (paquets de plugins),
[WiX Toolset](https://wixtoolset.org) (installateur) : MIT, Apache-2.0 ou licence propre, sans rien redistribuer.

## Signature

La signature Windows de l'installateur est gratuite grâce à [SignPath.io](https://about.signpath.io) et à la
[SignPath Foundation](https://signpath.org) ([politique de signature](CODE_SIGNING.md)).

## Vous avez repéré une erreur ou un oubli ?

Ouvrez un ticket ou une demande de fusion : citer correctement les auteurs est important.
