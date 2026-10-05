# Agenda

Plugin pour [Établi](https://github.com/Bryan-Cordonnier/etabli) : le **temps** (événements, calendrier, heures à rebours, repos légal). Il ne sonne pas encore : les rappels viennent plus tard.
Spécification : [docs/24](../../docs/24-spec-plugins-budget.md) ; description du code : [docs/10](../../docs/10-plugins-existants.md).

```bash
npm test -w @etabli/plugin-agenda         # logique, service, export .ics, vues
npm run valider -- agenda                 # vérifie le manifeste et le contenu
```