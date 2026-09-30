## Ce que fait cette demande de fusion

<!-- Un sujet par demande. Expliquez le POURQUOI, pas seulement le quoi. Reliez le ticket : « Corrige #12 ». -->

## Type de changement

- [ ] Correction de bug
- [ ] Nouvelle fonctionnalité
- [ ] Documentation
- [ ] Autre (outils, CI, dépendances…)

Un **plugin** ? Utilisez plutôt le modèle « plugin » : ajoutez `?template=plugin.md` à l'adresse de la demande.

## Ce qui change pour l'utilisateur

<!-- Une phrase par changement visible. Une capture d'écran si l'interface change. Rien de visible ? Écrivez « rien ». -->

## Vérifications

- [ ] `npm run check`, `npm test`, `npm run test:scripts` et `npm run build:plugins` passent
- [ ] `npm run valider -- --tous` passe (si un plugin est touché) et `npm run liens` (si la documentation est touchée)
- [ ] Rust touché : `cargo fmt`, `cargo clippy --all-targets -- -D warnings` et `cargo test` passent
- [ ] Tests ajoutés ou mis à jour
- [ ] Documentation mise à jour (`docs/`, `README`…)
- [ ] `CHANGELOG.md` mis à jour (section « Non publié »), écrit pour l'utilisateur
- [ ] Tout est en français

## Ce qui n'a pas été vérifié

<!-- Soyez honnête : « pas testé dans l'application installée », « impression non essayée »… -->
