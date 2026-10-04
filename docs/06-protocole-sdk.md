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
| `init` | `pluginId`, `appId`, `document` (`{ id, title, data }`, `data` null pour un nouveau calcul), `theme` + `colorScheme`, `services` (données publiées par les plugins dont celui-ci dépend : `{ nom: { plugin, version, data } }`), `libraries` (`{ suppliers, machines }`, dérivé des services `fournisseurs` et `machines`, pour les SDK anciens), `pluginData` (réglages du plugin ou null), `incoming` (données envoyées par une autre mini-app ou null), `shortcuts` (raccourcis réglés par l'utilisateur, vide par défaut) |
| `shortcuts` | raccourcis modifiés dans les Paramètres |
| `theme` | nouvelles couleurs (le SDK les applique en variables CSS) |
| `services` | un service lu par ce plugin a changé, ou un plugin dont il dépend a été installé, désinstallé, activé ou désactivé |
| `libraries` | ancien message, accompagne `services` : fournisseurs et machines |
| `pluginData` | réglages du plugin modifiés par une autre mini-app du même plugin |

**Mini-app → hôte** (`PluginToHost`)

| Message | Effet |
| --- | --- |
| `update` `{ data }` | nouvelles données du calcul ; enregistrées 1 s plus tard |
| `title`, `summary` | titre du calcul, résumé affiché dans les anciens calculs |
| `notify` `{ text }` | notification en bas à droite |
| `copy` `{ text }` | copie par l'hôte (si le cadre n'a pas accès au presse-papiers) |
| `height` `{ value }` | hauteur du contenu : le cadre s'ajuste |
| `ready` | envoyé par le SDK deux images après `init` (thème appliqué, contenu dessiné) : le moteur garde le cadre invisible jusque-là, puis le fait apparaître en fondu ; sans ce message (SDK ancien), il l'affiche au bout d'une seconde |
| `shortcut` `{ key, code, ctrl, shift, alt }` | combinaison réglée par l'utilisateur dans le moteur (`matchesShortcut`, format `Ctrl+Alt+Shift+<code>`), ou Échap ; le reste du clavier appartient à la mini-app |
| `pluginData` `{ data }` | enregistre les réglages du plugin |
| `print` `{ fiche }` | imprime une fiche d'atelier (`FichePrint`) |
| `provide` `{ name, data }` | publie les données du service `name` (à déclarer dans `provides` du manifeste) ; le moteur les garde et les relaie aux plugins qui en dépendent |
| `openSettings` `{ plugin, hash? }` | ouvre la page de réglages d'un autre plugin, avec une intention dans l'adresse (`#add=scie`) ; le catalogue s'ouvre si le plugin manque |
| `addMachine` `{ kind }` | ancien message : équivaut à `openSettings` sur `machines` avec `add=<kind>` |
| `send` `{ kind, data }` | ouvre une mini-app qui accepte ce type, dans un nouvel onglet, avec ces données |
| `saveFile` `{ file }` | boîte « Enregistrer sous » de Windows puis écriture (`SavedFile` : `name`, `content` texte, `extension` sans point, `description` du filtre) ; notification « Enregistré : chemin » |

Types partagés dans `protocol.ts` : `Supplier`, `SupplierItem`, `StockKind` (+ `STOCK_KINDS`),
`Saw`, `Shear`, `Machine`, `MachineKind`, `SAW_TYPES`, `Libraries`, `FichePrint`, `Incoming`,
`SavedFile`, `ThemeTokens`, `ServiceSnapshot`, `Services`, `FournisseursData`, `MachinesData`.

`@etabli/sdk/deps` (fonctions pures, sans navigateur) : `satisfies(version, plage)`, `compareVersions`,
`problemsOf`, `dependentsOf`, `planInstall` : versions et dépendances entre plugins (voir
[07](07-creer-un-plugin.md#dépendances-et-services)).

## `@etabli/sdk` (bas niveau)

```ts
import { connect } from "@etabli/sdk";
import "@etabli/sdk/base.css";           // police, variables, arrondis, remise à zéro

const etabli = await connect<MesDonnees>();
etabli.document.data;                     // null pour un nouveau calcul
etabli.document.update(donnees);          // enregistrement automatique
etabli.document.setTitle(t); etabli.document.setSummary(s);
etabli.ui.notify(texte); await etabli.clipboard.copy(texte);
etabli.services.get("fournisseurs");       // { plugin, version, data } ou null (lecture seule)
etabli.services.onChange(fn);             // un service a changé
etabli.services.provide("nom", donnees);  // publier ses données (déclarées dans « provides »)
etabli.openSettings("machines", "add=scie");  // ouvrir la page de réglages d'un autre plugin
etabli.libraries.current;                 // { suppliers, machines } (dérivé des services, ancien SDK)
etabli.libraries.onChange(fn); etabli.libraries.addMachine("scie" | "cisaille");
etabli.settings.data; etabli.settings.update(d); etabli.settings.onChange(fn);   // réglages du plugin
etabli.print(fiche);                      // fiche d'atelier
etabli.saveFile({ name, content, extension: "dxf", description: "Dessin DXF" });  // export
etabli.send("piece-plate", donnees); etabli.incoming;                            // envoi entre mini-apps
etabli.onThemeChange(fn);
```

Le SDK signale aussi la hauteur du contenu et renvoie au moteur les raccourcis que l'utilisateur y a réglés : rien à faire.
Dans la pratique, les mini-apps utilisent le kit `@etabli/ui` ci-dessous plutôt que `connect()`
directement (seul `Pythagore` le fait encore, par ancienneté).

## `@etabli/ui` (à utiliser)

**Données et moteur** (`packages/ui/src/*.svelte.ts`)

| Export | Usage |
| --- | --- |
| `MiniAppDocument<T>(defaults, summary, migrate?)` | `doc.data` réactif (lié aux champs), chargé au démarrage, renvoyé au moteur à chaque modification (rien n'est enregistré tant que l'utilisateur ne change rien). `summary(data)` : résumé des anciens calculs. `migrate(saved)` : remet au format actuel un calcul ancien. `doc.copy(texte)`, `doc.notify(texte)` |
| `PluginSettings<S>(defaults, clean?, service?)` | réglages partagés par les mini-apps d'un plugin, `data` réactif enregistré automatiquement ; avec `service`, publiés aussi aux plugins qui en dépendent |
| `Libraries` | `suppliers`, `machines` réactifs (issus des plugins Fournisseurs et Machines) ; `addMachine(kind)` ouvre les réglages du plugin Machines |
| `Icon` (`plus`, `x`, `trash`) | quelques icônes pour les boutons |
| `printFiche(fiche)` | impression d'une fiche d'atelier |
| `saveFile(file)` | enregistrement d'un fichier texte (DXF, CSV…) par la boîte « Enregistrer sous » |
| `sendTo(kind, data)` / `onIncoming(kind, handler)` | envoi et réception entre mini-apps (appeler `onIncoming` **après** avoir créé le `MiniAppDocument`) |

**Outils sans interface** (`packages/ui/src/*.ts`, voir [09](09-bibliotheques-fiches-envoi.md))

| Export | Usage |
| --- | --- |
| `esc`, `fmt`, `tint`, `mark`, `box`, `section`, `facts`, `table`, `signature`, `hatch`, `type Column` | écrire les pages HTML d'une fiche d'atelier |
| `toDxf(drawing)` | texte DXF R12 d'un dessin en mm (polylignes, lignes, textes, calques `CONTOUR`, `PLI`, `TRACE`, `TEXTE`) |
| `gabaritPages(shapes, labels, title)` | pages A4 d'un gabarit à l'échelle 1, à ajouter aux `pages` d'une fiche |

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

## Ce que le moteur vérifie avant d'écouter une mini-app

Tout message reçu par le port est contrôlé par `apps/desktop/src/lib/plugins/garde.ts` avant d'être traité : le type doit être
connu, les champs bien formés, les tailles bornées (4 Mo de données par message, textes de 2 000 caractères, hauteur de 160 à
20 000 px), et — pour un plugin `"apiVersion": "^2"` — la **permission** correspondante déclarée dans le manifeste
(`fichiers`, `impression`, `presse-papiers`, `envoi`, `reglages`). Un message refusé est ignoré (une ligne dans la console).
`saveFile` n'accepte que des formats de données (`csv tsv dxf json txt svg md xml`) et un nom sans chemin. Détail, menaces et
limites : [19](19-modele-de-menace-plugins.md).
