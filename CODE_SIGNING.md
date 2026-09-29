# Politique de signature du code — Code signing policy

*Français d'abord, English below.*

## Signature

Signature de code gratuite fournie par [SignPath.io](https://about.signpath.io), certificat de la
[SignPath Foundation](https://signpath.org).

> Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by
> [SignPath Foundation](https://signpath.org).

*État : demande en cours auprès de la SignPath Foundation. Tant qu'elle n'est pas acceptée, les
installateurs publiés ne sont pas signés (voir le README).*

Ce qui est signé : l'installateur Windows `Etabli_<version>_x64_fr-FR.msi` publié dans les
[Releases](https://github.com/Bryan-Cordonnier/etabli/releases) et le programme `etabli.exe` qu'il
contient. Ils sont compilés uniquement par GitHub Actions (workflow
[`publier.yml`](.github/workflows/publier.yml)), à partir du code de ce dépôt, sur des machines
hébergées par GitHub. Chaque demande de signature est approuvée à la main.

## Équipe

| Rôle | Personnes |
| --- | --- |
| Auteurs (committers) et relecteurs (reviewers) | [Bryan Cordonnier](https://github.com/Bryan-Cordonnier) |
| Approbateurs (approvers) | [Bryan Cordonnier](https://github.com/Bryan-Cordonnier) |

Tous les membres utilisent l'authentification à deux facteurs sur GitHub et SignPath.

## Confidentialité

Établi fonctionne entièrement sur l'ordinateur : il ne collecte aucune donnée et n'envoie rien à
personne, **à une exception près** : au démarrage, il demande à GitHub si une nouvelle version
existe (fichier `latest.json` des Releases). Cette demande, comme toute visite d'un site, transmet à
GitHub l'adresse IP et des informations techniques ; aucune donnée de l'utilisateur ni de ses calculs
n'est envoyée. Elle se désactive dans **Paramètres → Mises à jour et à propos → Chercher au
démarrage**. Les boutons « Signaler un problème » et « Code source sur GitHub » ouvrent le navigateur
seulement quand l'utilisateur clique dessus.

Politique de confidentialité de GitHub :
https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement

---

## English

**Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by
[SignPath Foundation](https://signpath.org).** *Status: application in progress; until it is
accepted, published installers are not signed.*

Signed artifacts: the Windows installer `Etabli_<version>_x64_fr-FR.msi` published in this
repository's Releases and the `etabli.exe` program it contains, built only by GitHub Actions
(GitHub-hosted runners) from this repository's source code. Every signing request is approved
manually.

**Team roles** — Committers and reviewers: Bryan Cordonnier. Approvers: Bryan Cordonnier. All members
use multi-factor authentication.

**Privacy** — This program will not transfer any information to other networked systems unless
specifically requested by the user or the person installing or operating it, with one exception: at
startup it asks GitHub whether a newer version exists (the Releases `latest.json` file). Like any web
request, this sends the IP address and technical information to GitHub; no user data or calculation
is sent. It can be turned off in Settings → Updates. GitHub privacy statement:
https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement
