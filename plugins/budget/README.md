# Budget

Plugin pour [Établi](https://github.com/Bryan-Cordonnier/etabli) : le **prévu** (virements, abonnements, paies attendues, plafonds). L'argent réel vit dans le plugin **Finances**, obligatoire.
Spécification : [docs/24](../../docs/24-spec-plugins-budget.md) ; description du code : [docs/10](../../docs/10-plugins-existants.md).

```bash
npm test -w @etabli/plugin-budget         # échéances, courbe, plan, service, lien avec Finances
npm run valider -- budget                 # vérifie le manifeste et le contenu
```