# 01 — Stack et organisation du dépôt

## Technologies

| Couche | Choix | Version | Remarques |
| --- | --- | --- | --- |
| Application de bureau | **Tauri 2** (Rust) + WebView2 | tauri 2.11 | Windows uniquement ; installateur NSIS par utilisateur, en français |
| Cœur | **Rust** | édition 2021, rust-version 1.85 | `apps/desktop/src-tauri` |
| Greffons Tauri | global-shortcut, autostart, opener, single-instance, dialog, log | 2.x | log seulement en développement (terminal) |
| Interface | **Svelte 5** (runes : `$state`, `$derived`, `$effect`, `$props`, snippets) | 5.57 | pas de SvelteKit |
| Outil de build | **Vite 8** (minification Oxc) | 8.3 | ne pas écrire `minify: "esbuild"` |
| Langage | **TypeScript 6** strict (`noUncheckedIndexedAccess`) | 6.0 | vérifié par `svelte-check` |
| Tests | **Vitest 5** (calculs des plugins, kit ui) et `cargo test` (Rust) | 5.0 | pas de tests d'interface |
| Icônes | `@lucide/svelte` | 1.x | liste fermée dans `apps/desktop/src/lib/icons.ts` |
| Polices | Inter Variable, JetBrains Mono (fontsource, embarquées) | — | fonctionnent hors ligne |
| 3D | **three.js** (plugin Économie seulement, chargé à la demande) | 0.186 | ~560 ko, jamais dans le moteur |
| Node | ≥ 22 (CI en 24) | — | npm workspaces |

## Monorepo (npm workspaces)

```
package.json              scripts communs, workspaces apps/*, packages/*, plugins/*
apps/desktop/             @etabli/desktop : l'application (interface + src-tauri)
packages/sdk/             @etabli/sdk : protocole et API des mini-apps (TypeScript pur)
packages/ui/              @etabli/ui : composants Svelte et outils des mini-apps
plugins/<id>/             @etabli/plugin-<id> : un plugin = un paquet Vite multi-pages
.github/workflows/ci.yml  vérification sous Windows à chaque push et pull request
```

Les paquets internes sont consommés **en source** (pas de build intermédiaire) : `@etabli/sdk`
exporte `src/index.ts`, `src/protocol.ts` et `src/base.css` ; `@etabli/ui` exporte `src/index.ts`.
Après avoir ajouté un workspace (nouveau plugin), lancer `npm install` pour le lier.

## Scripts (à la racine)

| Script | Effet |
| --- | --- |
| `npm run dev` | compile les plugins puis lance l'application Tauri en développement (Vite sur le port 1420) |
| `npm run build` | compile les plugins puis produit l'installateur Windows |
| `npm run build:plugins` | `vite build` de chaque plugin → `plugins/<id>/dist/` |
| `npm run check` | `svelte-check` / `tsc` de tous les workspaces |
| `npm test` | Vitest dans chaque workspace qui a des tests |
| `npm run dev -w @etabli/desktop` | interface seule dans un navigateur (sans Rust), voir [02-environnement.md](02-environnement.md) |

Côté Rust, dans `apps/desktop/src-tauri` : `cargo fmt`, `cargo clippy --all-targets -- -D warnings`,
`cargo test`.

## Alias et chemins

- Dans l'interface hôte, `$lib` = `apps/desktop/src/lib` (défini dans `apps/desktop/vite.config.ts`).
- Les plugins importent le moteur uniquement via `@etabli/sdk` et `@etabli/ui`.
- Les types partagés hôte ↔ mini-app sont dans `packages/sdk/src/protocol.ts` (importé côté hôte
  par `@etabli/sdk/protocol`).
