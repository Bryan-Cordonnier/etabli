# 11 — Conventions de code et de collaboration

## Travailler avec Bryan

- **Itérer avant de coder.** Pour une fonctionnalité métier nouvelle, on discute d'abord (questions
  précises, maquette HTML si c'est visuel), on met à jour le cahier des charges, **puis** on code.
  Bryan l'a dit clairement : « lance rien du tout, on n'a pas fini d'itérer ». Les petites
  corrections d'interface qu'il demande, elles, se font tout de suite.
- **Proposer une recommandation**, pas une liste d'options sans avis. Poser les questions groupées,
  numérotées, courtes.
- **Réponses courtes et directes**, en français. Il se plaint quand c'est lent ou verbeux.
- **Honnêteté sur les vérifications** : dire ce qui a été testé (types, tests) et ce qui ne l'a pas
  été (rendu à l'écran). C'est Bryan qui teste l'interface dans l'application (`npm run dev`).
- Il est **exigeant sur le visuel** : fluidité, alignements au pixel, mêmes états actifs partout,
  pas d'effet « bizarre ». Il envoie des captures ; corriger précisément ce qui est montré.
- Ne pas rediscuter une décision déjà prise (voir plus bas) sauf s'il la remet en cause.
- Rien sur `C:`, aucune installation sans accord, aucune suppression de fichiers de l'utilisateur.

## Décisions d'interface validées (ne pas changer sans demander)

- Colonne des plugins à gauche (≤ 1/5 de l'écran), icônes colorées ou émojis, bande Paramètres /
  Replier en bas, espacement de 6 px entre les plugins, nom « Établi » sous le bord de la fenêtre.
- Onglets globaux de **largeur fixe 180 px** (ils ne rétrécissent jamais : ils défilent avec un
  fondu), texte, « + » et logo centrés verticalement dans la barre.
- Arrondis unifiés : 6 px partout, 4 px pour les détails, 8 px pour les éléments flottants.
- Pièce sélectionnée dans une liste : barre d'accent à gauche (comme la colonne), pas de fond coloré.
- Listes déroulantes des mini-apps : `SelectField` (dessinée par Établi), jamais la liste native.
- Aperçu rapide : voile simple en fondu, sans flou ni zoom ; raccourci par défaut Ctrl+Maj+Espace
  (Ctrl+Alt+Espace est pris par Claude).
- Résultats : 2D par défaut, 3D au choix ; pas de lettres de repère dans les aperçus à l'écran
  (les fiches imprimées, elles, les gardent).
- Machines et fournisseurs dans Paramètres → Bibliothèques, jamais dans un bloc du calcul.

## Code

- **Français** : interface, commentaires, messages d'erreur, noms de fichiers de données. Les
  identifiants de code sont en anglais ou en français selon le fichier existant (suivre le voisinage).
- **Commentaires** : expliquer le *pourquoi* (règle métier, piège, décision), une ligne ou deux, en
  tête de fichier la référence au cahier des charges (« cahier des charges, section 9.4 »).
- **Svelte 5** : runes uniquement (`$state`, `$derived`, `$derived.by`, `$effect`, `$props`,
  `$bindable`, snippets). Les états partagés sont des **classes** avec champs `$state` exportées en
  singleton (`settings`, `tabs`, `libraries`, `ui`). Pour qu'un composant enfant modifie un état,
  passez-lui l'objet (instance de classe) plutôt qu'une prop à muter.
- **TypeScript strict** (`noUncheckedIndexedAccess`) : gérer les `undefined`, `!` seulement quand
  c'est prouvé.
- **Calculs purs séparés de l'interface** (`src/*.ts` des plugins), testés avec Vitest.
- **Couleurs** : toujours `var(--…)` (thèmes clair et sombre) ; seules les fiches imprimées ont des
  couleurs fixes (papier).
- **Performances** : rien en continu (pas d'animation infinie, 3D rendue à la demande), calculs
  lourds différés de 250 ms, dépendances lourdes chargées à la demande (`import()`).
- **Erreurs** : une phrase qui dit quoi corriger ; jamais de résultat faux affiché.
- Formatage : Prettier n'est pas installé ; imiter le style existant (2 espaces, guillemets doubles,
  lignes ≤ ~130 caractères). Rust : `cargo fmt`.

## Tests

- Chaque formule : au moins trois cas vérifiés à la main ou tirés d'un abaque, plus les cas limites.
- Nommer les tests en français, par le cas métier (« équerre 50 × 50 : développé 96,52 »).
- Un test qui échoue sur une valeur calculée à la main : **revérifier le calcul à la main** avant de
  toucher au code (c'est arrivé plusieurs fois que l'attendu soit faux).

## Commits

- Format : `type(portée): résumé en français`, puis une liste des changements. Types : `feat`,
  `fix`, `style`, `docs`, `refactor`, `test`, `chore`. Portées : `interface`, `apercu`, `economie`,
  `maths`, `tolerie`, `bibliotheques`, `sdk`, `rust`…
- Message écrit dans un fichier UTF-8 **sans BOM**, puis `git commit -F` (voir
  [02-environnement.md](02-environnement.md)).
- Vérifications complètes avant chaque commit, puis `git push` sur `main`.
