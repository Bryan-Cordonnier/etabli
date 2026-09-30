# Politique de sécurité

## Signaler une faille

**Ne publiez pas une faille dans un ticket public.** Utilisez le signalement privé de GitHub :

[Signaler une faille de sécurité](https://github.com/Bryan-Cordonnier/etabli/security/advisories/new)
(onglet *Security* → *Report a vulnerability*).

Décrivez ce que vous avez trouvé, comment le reproduire, la version d'Établi et de Windows, et l'effet
possible. Une preuve de concept aide, un long rapport n'est pas nécessaire.

Ce que vous pouvez attendre : un accusé de réception sous **14 jours**, une première analyse sous
**30 jours**, puis un correctif publié selon la gravité (le plus vite possible pour une faille grave,
la version suivante sinon). Une fois le correctif publié, la faille est décrite dans un avis de
sécurité et dans le [journal des changements](CHANGELOG.md), avec le nom de la personne qui l'a
signalée si elle le souhaite.

Établi est développé par des bénévoles : nous ne proposons pas de récompense financière, mais nous
remercions publiquement, et nous ne poursuivrons jamais quelqu'un qui a agi de bonne foi.

## Versions prises en charge

Seule **la dernière version** publiée reçoit les correctifs de sécurité. Établi se met à jour
automatiquement ; pensez à l'installer.

## Ce qui compte comme une faille

Par exemple :

- une mini-app (un plugin) qui sort de son cadre isolé, lit le disque, accède au réseau ou appelle
  le moteur autrement que par le SDK ;
- une installation de plugin qui écrit hors de son dossier, ou qui s'installe sans signature valide ;
- un moyen de faire télécharger à Établi autre chose que ce que le catalogue officiel publie ;
- un moyen de contourner la vérification de signature des mises à jour ;
- une faille de la politique de sécurité du contenu (CSP) ;
- un chemin de fichier piégé (`..`, chemin absolu) dans un document, un plugin ou un paquet.

Ne sont pas des failles : un plugin **que l'utilisateur a installé volontairement depuis un fichier**
et qui fait des calculs faux (c'est un bug, mais pas de sécurité), ou une information déjà publique.

## Comment Établi se protège

- **Aucune donnée collectée.** Le seul échange réseau de l'application est la recherche de nouvelles
  versions sur GitHub (désactivable), et le téléchargement du catalogue et des plugins que
  l'utilisateur demande (voir [CODE_SIGNING.md](CODE_SIGNING.md)).
- **Plugins isolés.** Chaque mini-app tourne dans un cadre `sandbox` d'origine opaque, servi avec une
  politique de sécurité qui interdit le réseau (`connect-src 'none'`) et les scripts venus d'ailleurs.
  Elle ne parle au moteur que par un canal privé et un jeu de messages fixé ([protocole](docs/06-protocole-sdk.md)).
- **Plugins signés.** Un paquet du catalogue est vérifié (signature minisign) avant la moindre écriture
  sur le disque ; l'extraction refuse les chemins qui sortent du dossier et borne la taille ; Rust ne
  télécharge que depuis les Releases de ce dépôt.
- **Mises à jour signées.** L'installateur et `latest.json` sont signés ; la clé publique est dans
  l'application, la clé privée reste dans les secrets de GitHub Actions.
- **Données partagées entre plugins en lecture seule**, et seulement pour les plugins qui déclarent la
  dépendance ([services](docs/09-bibliotheques-fiches-envoi.md)).
- **Relecture.** Tout plugin ajouté au catalogue officiel est relu par un mainteneur ; `npm run valider`
  signale les appels suspects avant même la relecture.

Cette liste n'est pas une garantie : si vous voyez un trou, dites-le-nous.
