# 06 — Protocole, SDK et kit d'interface

## Connexion

1. L'hôte (`MiniAppFrame.svelte`) charge la page de la mini-app dans un cadre isolé.
2. Au chargement, il crée un `MessageChannel` et envoie `{ type: "etabli:connect" }` avec le port 2.
3. Toute la suite passe par ce port privé. L'hôte envoie aussitôt `init`.
4. Côté mini-app, `connect()` (`@etabli/sdk`) attend ce port et renvoie l'API une fois `init` reçu.

`PROTOCOL_VERSION` = 1 (`packages/sdk/src/protocol.ts`). Les ajouts compatibles (nouveaux champs
facultatifs, nouveaux messages) ne changent pas la version ; le SDK tolère un champ absent.

## Messages

**Hôte → mini-app** (`HostToPlugin`)

| Message | Contenu |
| --- | --- |
| `init` | `pluginId`, `appId`, `document` (`{ id, title, data }`, `data` null pour un nouveau calcul), `theme` + `colorScheme`, `libraries` (`{ suppliers, machines }`), `pluginData` (réglages du plugin ou null), `incoming` (données envoyées par une autre mini-app ou null) |
| `theme` | nouvelles couleurs (le SDK les applique en variables CSS) |
| `libraries` | fournisseurs ou machines modifiés dans les Paramètres |
| `pluginData` | réglages du plugin modifiés par une autre mini-app du même plugin |

**Mini-app → hôte** (`PluginToHost`)

| Message | Effet |
| --- | --- |
| `update` `{ data }` | nouvelles données du calcul ; enregistrées 1 s plus tard |
| `title`, `summary` | titre du calcul, résumé affiché dans les anciens calculs |
| `notify` `{ text }` | notification en bas à droite |
| `copy` `{ text }` | copie par l'hôte (si le cadre n'a pas accès au presse-papiers) |
| `height` `{ value }` | hauteur du contenu : le cadre s'ajuste |
| `shortcut` | touche réservée à l'hôte (Ctrl+T…) ou Échap |
| `pluginData` `{ data }` | enregistre les réglages du plugin |
| `print` `{ fiche }` | imprime une fiche d'atelier (`FichePrint`) |
| `addMachine` `{ kind }` | crée une machine et ouvre Paramètres → Bibliothèques |
| `send` `{ kind, data }` | ouvre une mini-app qui accepte ce type, dans un nouvel onglet, avec ces données |

Types partagés dans `protocol.ts` : `Supplier`, `SupplierItem`, `StockKind` (+ `STOCK_KINDS`),
`Saw`, `Shear`, `Machine`, `MachineKind`, `SAW_TYPES`, `Libraries`, `FichePrint`, `Incoming`,
`ThemeTokens`.

## `@etabli/sdk` (bas niveau)

```ts
import { connect } from "@etabli/sdk";
import "@etabli/sdk/base.css";           // police, variables, arrondis, remise à zéro

const etabli = await connect<MesDonnees>();
etabli.document.data;                     // null pour un nouveau calcul
etabli.document.update(donnees);          // enregistrement automatique
etabli.document.setTitle(t); etabli.document.setSummary(s);
etabli.ui.notify(texte); await etabli.clipboard.copy(texte);
etabli.libraries.current;                 // { suppliers, machines }
etabli.libraries.onChange(fn); etabli.libraries.addMachine("scie" | "cisaille");
etabli.settings.data; etabli.settings.update(d); etabli.settings.onChange(fn);   // réglages du plugin
etabli.print(fiche);                      // fiche d'atelier
etabli.send("piece-plate", donnees); etabli.incoming;                            // envoi entre mini-apps
etabli.onThemeChange(fn);
```

Le SDK signale aussi la hauteur du contenu et transmet les raccourcis de l'hôte : rien à faire.
Dans la pratique, les mini-apps utilisent le kit `@etabli/ui` ci-dessous plutôt que `connect()`
directement (seul `Pythagore` le fait encore, par ancienneté).

## `@etabli/ui` (à utiliser)

**Données et moteur** (`packages/ui/src/*.svelte.ts`)

| Export | Usage |
| --- | --- |
| `MiniAppDocument<T>(defaults, summary, migrate?)` | `doc.data` réactif (lié aux champs), chargé au démarrage, renvoyé au moteur à chaque modification (rien n'est enregistré tant que l'utilisateur ne change rien). `summary(data)` : résumé des anciens calculs. `migrate(saved)` : remet au format actuel un calcul ancien. `doc.copy(texte)`, `doc.notify(texte)` |
| `PluginSettings<S>(defaults, clean?)` | réglages partagés par les mini-apps d'un plugin, `data` réactif enregistré automatiquement |
| `Libraries` | `suppliers`, `machines` réactifs ; `addMachine(kind)` |
| `printFiche(fiche)` | impression d'une fiche d'atelier |
| `sendTo(kind, data)` / `onIncoming(kind, handler)` | envoi et réception entre mini-apps (appeler `onIncoming` **après** avoir créé le `MiniAppDocument`) |

**Composants**

| Composant | Props principales |
| --- | --- |
| `Card` | `title`, snippet `actions` (boutons à droite du titre), contenu ; les boutons `.btn` / `.btn.primary` y sont stylés |
| `Field` | `label`, `bind:value` (texte), `unit`, `placeholder`, `numeric` (défaut vrai : accepte les calculs « 1200 - 2*15 », affiche le résultat ou l'erreur), `compact` (sans libellé, pour les tableaux) |
| `Result` | `label`, `value` (nombre), `unit`, `decimals`, `big`, `oncopy` : un clic copie la valeur |
| `Segmented` | `options: {value,label}[]`, `bind:value`, `label`, `onchange` |
| `SelectField` | liste de choix dessinée par Établi (lisible en thème sombre, clavier complet, s'ouvre vers le haut si besoin) : `label`, `options`, `bind:value`, `compact`, `onchange` |
| `Check` | case à cocher : `label`, `bind:checked`, `hint` |

**Outils** : `evaluate(texte)` (calcul saisi, NaN si invalide, fonctions trigonométriques en degrés),
`format(n, décimales)` (nombre à la française), `isExpression`, `parsePasted` (lignes collées depuis
Excel), `COLORS` / `colorOf(i)` (couleurs des repères de pièces).

Les champs gardent le **texte** saisi (les données enregistrées sont des chaînes) ; convertir avec
`evaluate` ou une fonction `num()` au moment du calcul.
