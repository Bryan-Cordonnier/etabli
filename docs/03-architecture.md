# 03 — Architecture

## Vue d'ensemble

```
┌──────────────────────────── Processus Tauri (Rust, apps/desktop/src-tauri) ─────────────────────────────┐
│  fenêtres main + apercu · raccourci global · zone de notification · démarrage avec Windows              │
│  plugins (scan + protocole plugins://) · documents .etabli · settings.json · donnees/*.json            │
└──────────────▲───────────────────────────────────────────────────────▲──────────────────────────────────┘
               │ invoke("commande") / événements                        │ requêtes http://plugins.localhost/<id>/…
┌──────────────┴─────────── Interface hôte (Svelte, apps/desktop/src) ──┴──────────────────────────────────┐
│  colonne, onglets, pages, paramètres, aperçu rapide · état (réglages, onglets, bibliothèques)          │
│  MiniAppFrame : <iframe sandbox="allow-scripts"> + MessagePort privé                                     │
└──────────────┬──────────────────────────────────────────────────────────────────────────────────────────┘
               │ messages du protocole (packages/sdk/src/protocol.ts)
┌──────────────▼─────────── Mini-app d'un plugin (plugins/<id>/apps/<app>) ────────────────────────────────┐
│  page Vite + Svelte · @etabli/sdk (connect, document, bibliothèques, impression, envoi) · @etabli/ui    │
│  aucune API Tauri, aucun accès disque ni réseau (CSP), origine opaque                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Les deux fenêtres

| Fenêtre | Page | Rôle |
| --- | --- | --- |
| `main` | `index.html` → `src/main.ts` → `App.svelte` | l'application : sans bordure Windows (barre de titre dessinée par `TabBar` et `WindowControls`), cachée au démarrage puis affichée par Rust (sauf lancement avec `--demarrage`) |
| `apercu` | `apercu.html` → `src/apercu.ts` → `Apercu.svelte` | aperçu rapide : transparente, sans barre des tâches, toujours au premier plan, redimensionnée sur l'écran de la souris à chaque ouverture ; cachée et réutilisée |

Les deux fenêtres ont chacune leur propre état en mémoire. Elles partagent les fichiers
(`settings.json`, `donnees/*.json`, documents) : l'aperçu **relit** réglages et bibliothèques à chaque
ouverture. L'aperçu délègue à la fenêtre principale ce qui ouvre un onglet, par événements Tauri
(`etabli:ouvrir`, `etabli:machine`, `etabli:envoyer`).

## Démarrage

1. Rust (`lib.rs`, `setup`) : chemins (`paths.rs`), scan des plugins, lecture des réglages utiles
   (fermeture dans la zone de notification, raccourci), raccourci global, icône de notification,
   affichage de `main`.
2. Interface (`main.ts`) : `reportErrors()` (erreurs recopiées dans le journal Rust), puis en
   parallèle `initStorage()` (settings.json), `loadPlugins()` (manifestes) et `libraries.load()`
   (fournisseurs, machines), puis import dynamique de `App.svelte`.

## Plugins : découverte et service

- Dossiers racines (`paths.rs`) : les plugins officiels (`plugins/` du dépôt en développement,
  ressources de l'application en production) et les plugins de l'utilisateur
  (`<config>/plugins`).
- Un plugin = un dossier dont `dist/manifest.json` (plugin compilé) ou `manifest.json` (plugin sans
  code) est lisible. Identifiant : minuscules, chiffres, tirets ; le premier trouvé gagne.
- Les fichiers sont servis par le protocole personnalisé `plugins` : sous Windows,
  `http://plugins.localhost/<id>/<chemin>`. Chemins vérifiés (`safe_join`), CSP stricte sur le HTML
  (aucun réseau), `Access-Control-Allow-Origin: *` (les modules d'une origine opaque sont des requêtes CORS).

## Une mini-app ouverte

```
MiniAppPage (onglet)                         Apercu.svelte (aperçu rapide)
   └─ DocumentSession  ← charge / enregistre le document (.etabli) via Rust
   └─ MiniAppFrame     ← iframe + MessageChannel
         init : document, thème, bibliothèques, réglages du plugin, données reçues
         ← update / title / summary        → DocumentSession (enregistrement 1 s après)
         ← notify / copy / shortcut        → interface hôte
         ← pluginData                      → réglages du plugin (donnees/plugin.<id>.json)
         ← print                           → impression de la fiche (lib/print)
         ← addMachine / send               → Paramètres / nouvel onglet
         → theme / libraries / pluginData  (mises à jour poussées)
```

La hauteur du cadre suit le contenu (message `height`) : pas de double barre de défilement.

## Où sont les données

| Donnée | Fichier | Module |
| --- | --- | --- |
| Calculs | `<documents>/<pluginId>/<titre-en-slug>-<8 premiers caractères de l'id>.etabli` (JSON) | `documents.rs`, `lib/documents.svelte.ts` |
| Réglages et onglets ouverts | `<config>/settings.json` (clés `settings`, `session`) | `store.rs`, `lib/storage.ts` |
| Fournisseurs, machines | `<config>/donnees/fournisseurs.json`, `machines.json` | `donnees.rs`, `lib/state/libraries.svelte.ts` |
| Réglages d'un plugin | `<config>/donnees/plugin.<id>.json` | idem |

`<documents>` = `Documents\Etabli`, `<config>` = `%APPDATA%\Etabli` ; en développement tous deux sous
`%ETABLI_DATA_DIR%`. Détails : [08-documents-donnees.md](08-documents-donnees.md).

## Sécurité en bref

- CSP de l'application (`tauri.conf.json`) : tout en `'self'`, cadres limités à `plugins:`.
- Mini-apps : `sandbox="allow-scripts"` (origine opaque), CSP sans réseau, aucune API Tauri ; leurs
  données passent par des messages validés côté hôte.
- Fiches imprimées : HTML fourni par le plugin, rendu dans un cadre **sans script**
  (`sandbox="allow-same-origin allow-modals"`).
- Noms de fichiers de données validés côté Rust (`donnees.rs`, `documents.rs`, `plugins.rs`).
