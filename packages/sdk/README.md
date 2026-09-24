# @etabli/sdk

Bibliothèque pour écrire une mini-app Établi. La mini-app tourne dans un cadre isolé :
elle ne voit ni le disque ni le reste de l'application, et passe par ce SDK pour tout le reste.

En pratique, utilisez plutôt le kit [`@etabli/ui`](../ui/src/index.ts) (`MiniAppDocument`, `Field`,
`Result`…), construit sur ce SDK. Protocole complet : [docs/06-protocole-sdk.md](../../docs/06-protocole-sdk.md).

```ts
import { connect } from "@etabli/sdk";
import "@etabli/sdk/base.css";

interface Donnees { a: string; b: string }

const etabli = await connect<Donnees>();

// Nouveau calcul : data vaut null. Calcul rouvert : les données enregistrées.
const depart = etabli.document.data ?? { a: "", b: "" };

// À chaque modification : le moteur enregistre automatiquement une seconde plus tard.
etabli.document.update({ a: "350", b: "120" });
etabli.document.setSummary("c = 372,95 mm");

// Copier un résultat, prévenir l'utilisateur.
await etabli.clipboard.copy("372,95");
etabli.ui.notify("Calcul terminé");
```

| Fonction | Rôle |
| --- | --- |
| `connect()` | Attend la connexion du moteur, renvoie l'API |
| `document.data` / `update()` | Données du calcul, enregistrement automatique |
| `document.setTitle()` / `setSummary()` | Titre et résumé affichés dans les anciens calculs |
| `ui.notify()` | Notification en bas à droite |
| `clipboard.copy()` | Copie avec confirmation |
| `libraries.current` / `onChange()` | Fournisseurs et machines saisis dans les Paramètres |
| `libraries.addMachine(kind)` | Ouvre les Paramètres sur une nouvelle scie ou cisaille |
| `settings.data` / `update()` / `onChange()` | Réglages du plugin, partagés par ses mini-apps |
| `print(fiche)` | Imprime une fiche d'atelier (A4 ou PDF) |
| `send(kind, data)` / `incoming` | Envoie des données à une autre mini-app / données reçues à l'ouverture |
| `onThemeChange()` | Réagir au changement de thème (les variables CSS sont déjà mises à jour) |

Le thème est appliqué automatiquement sous forme de variables CSS : `var(--surface)`, `var(--text)`,
`var(--accent)`, `var(--field)`, `var(--border)`… et les arrondis `var(--r-sm)`, `var(--r-md)`.
