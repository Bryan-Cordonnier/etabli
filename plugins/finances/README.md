# Finances

Plugin pour [Établi](https://github.com/etable-project/etable) : l'argent **réel** (ce qui s'est passé), jamais le prévu (futur plugin « budget »).
Spécification : [docs/24](../../docs/24-spec-plugins-budget.md) ; description du code : [docs/10](../../docs/10-plugins-existants.md).

```bash
npm test -w @etabli/plugin-finances       # logique du registre, du service et du tableau de bord
npm run valider -- finances               # vérifie le manifeste et le contenu
node scripts/essai-appels.mjs             # essai du service dans Chromium (voir docs/02)
```
