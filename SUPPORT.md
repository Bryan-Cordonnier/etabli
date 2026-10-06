# Obtenir de l'aide

## J'utilise Établi et j'ai une question

1. **La documentation** répond à beaucoup de questions : le [guide de l'utilisateur](docs/guide-utilisateur.md)
   (installation, catalogue, plugins, raccourcis, données, dépannage).
2. **Les discussions** : posez votre question dans l'onglet
   [Discussions](https://github.com/etable-project/etable/discussions) (catégorie « Questions »).
   Si l'onglet n'est pas encore ouvert, utilisez un ticket avec l'étiquette `question`.
3. Un **bug** ou un **résultat de calcul faux** : [ouvrez un ticket](https://github.com/etable-project/etable/issues/new/choose).
   Dans l'application : *Paramètres → Mises à jour et à propos → Signaler un problème* préremplit la
   version et les plugins.

## Je veux écrire un plugin

- Démarrer : [docs/07-creer-un-plugin.md](docs/07-creer-un-plugin.md) et `npm run nouveau-plugin`.
- Une question sur le SDK ou sur le protocole : [docs/06-protocole-sdk.md](docs/06-protocole-sdk.md),
  puis les discussions (catégorie « Plugins »).
- Tout ce qu'il faut savoir pour contribuer : [CONTRIBUTING.md](CONTRIBUTING.md).

## Une faille de sécurité

Ne l'écrivez pas dans un ticket public : suivez la [politique de sécurité](SECURITY.md).

## Ce qu'il faut joindre à un signalement

Plus votre message est complet, plus vite on peut aider :

- la **version d'Établi** (Paramètres → Mises à jour et à propos) et la **version de Windows** ;
- les **plugins concernés** et leur version ;
- **ce que vous avez fait**, **ce qui s'est passé**, **ce que vous attendiez** ;
- pour un calcul : les **valeurs saisies** et le **résultat attendu avec sa source** ;
- une **capture d'écran** si le problème se voit.

## Dépannage rapide

- **Windows « a protégé votre ordinateur »** ou installateur bloqué (Contrôle intelligent des
  applications) : l'installateur n'est pas encore signé, voir la [politique de signature](CODE_SIGNING.md).
- **Établi est vide** au premier lancement : normal, ouvrez le **Catalogue** pour installer des plugins.
- **Un plugin affiche « Il faut installer X »** : il dépend d'un autre plugin, le bouton l'installe.
- **Où sont mes calculs ?** Dans `Documents\Etabli\<plugin>\` (fichiers `.etabli`) : voir le
  [guide](docs/guide-utilisateur.md#où-sont-mes-données).
