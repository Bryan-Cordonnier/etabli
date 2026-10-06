# Paie

Plugin pour [Établi](https://github.com/etable-project/etable) : programmer sa paie (intérim, réserve, CDI, CDD). Dit **combien** on sera payé et **quand** ; c'est Budget qui estime ce qui reste. Budget, Finances et l'Agenda sont facultatifs.
Spécification : [docs/24](../../docs/24-spec-plugins-budget.md) ; description du code : [docs/10](../../docs/10-plugins-existants.md).

```bash
npm test -w @etabli/plugin-paie           # calculs (vecteur d'or 429,43 €), données, projections, transmission
npm run valider -- paie                   # vérifie le manifeste et le contenu
```