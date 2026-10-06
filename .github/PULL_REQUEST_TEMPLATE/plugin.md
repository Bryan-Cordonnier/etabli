## Plugin proposé

**Nom :** <!-- « Soudage » -->
**Identifiant :** <!-- minuscules, chiffres, tirets : `soudage` -->
**Ticket de discussion :** <!-- #12 (recommandé avant d'écrire un gros plugin) -->

## Ce qu'il apporte

<!-- Les mini-apps, le besoin d'atelier auquel elles répondent. -->

## Formules et sources

<!-- Pour chaque calcul : la formule, la source (norme avec l'article, catalogue, ouvrage) et sa licence
     si vous reprenez des tables. Les cas de test vérifiés à la main sont dans src/*.test.ts. -->

## Dépendances et données partagées

- [ ] Aucune dépendance sur un autre plugin
- [ ] `dependencies` (obligatoires) : <!-- précisez pourquoi -->
- [ ] `optionalDependencies` : <!-- vérifié : le plugin marche sans -->
- [ ] `provides` / `settings` : <!-- contrat de données documenté -->

## Liste de contrôle

- [ ] `npm run valider -- <id>` passe sans erreur
- [ ] Au moins trois cas vérifiés à la main par formule, plus les cas limites (tests)
- [ ] Jamais de résultat faux affiché : une phrase dit quoi corriger
- [ ] Aucun accès réseau ni disque : tout passe par le SDK
- [ ] Tout en français ; unités : mm, degrés, kg, N, MPa
- [ ] `CHANGELOG.md` du plugin avec une section pour la version du manifeste
- [ ] `version` du manifeste et de `package.json` identiques (`1.0.0` pour une première publication)
- [ ] Icône choisie dans la liste de `apps/desktop/src/lib/icons.ts`, couleur définie, pas d'émoji
- [ ] Je publie ce plugin sous la [licence MIT](../../LICENSE) du projet, et les sources citées le permettent

## Ce qui n'a pas été vérifié

<!-- Soyez honnête : « pas testé avec l'impression », « tables recopiées mais pas recoupées »… -->

<!-- Pour les mainteneurs : après relecture, le plugin est empaqueté avec `node scripts/paquet-plugin.mjs <id>` (fichier `.etabli-plugin` signé). -->
