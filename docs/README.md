# Documentation d'Établi

Toute la documentation est **en français**. Choisissez selon ce que vous voulez faire.

## Je veux utiliser Établi

- [Guide de l'utilisateur](guide-utilisateur.md) : installer, catalogue, mini-apps, aperçu rapide, raccourcis, données, dépannage.
- [Journal des changements](../CHANGELOG.md) · [Feuille de route](../ROADMAP.md) · [Aide](../SUPPORT.md)

## Je veux écrire un plugin

1. [Créer un plugin ou une mini-app](07-creer-un-plugin.md) : `npm run nouveau-plugin`, manifeste, mini-app, tests, dépendances,
   réglages, liste de contrôle.
2. [Protocole et SDK](06-protocole-sdk.md) : ce que la mini-app peut demander au moteur, et l'API du kit `@etabli/ui`.
3. [Services, fournisseurs et machines](09-bibliotheques-fiches-envoi.md) : publier ou lire les données d'un autre plugin,
   fiches d'atelier imprimées, envoi entre mini-apps.
4. [Plugins existants](10-plugins-existants.md) : des exemples complets, avec leurs algorithmes et leurs tests.
5. [Proposer le plugin au catalogue](../CONTRIBUTING.md#écrire-un-plugin) puis [publier](14-publier-une-version.md#publier-un-plugin-pas-à-pas).

## Je veux contribuer au code ou maintenir le dépôt

- [CONTRIBUTING.md](../CONTRIBUTING.md), [code de conduite](../CODE_OF_CONDUCT.md), [sécurité](../SECURITY.md).
- [Gérer le dépôt](15-gerer-le-depot.md) : relire une demande de fusion, un plugin d'un autre auteur, publier, réglages GitHub.
- [Publier une version](14-publier-une-version.md) : installateur, signatures, mises à jour, catalogue.

## Documentation technique (pour reprendre le code)

[AGENTS.md](../AGENTS.md) est le sommaire ; dans l'ordre de lecture :

| Fichier | Contenu |
| --- | --- |
| [00-contexte.md](00-contexte.md) | but, utilisateur, principes, avancement |
| [01-stack.md](01-stack.md) | technologies, monorepo, scripts |
| [02-environnement.md](02-environnement.md) | poste de développement, lancer, vérifier, pièges |
| [03-architecture.md](03-architecture.md) | vue d'ensemble : Rust, interface, fenêtres, plugins isolés, flux de données |
| [04-coeur-rust.md](04-coeur-rust.md) | modules Rust, commandes, sécurité |
| [05-interface.md](05-interface.md) | interface Svelte : état, navigation, pages, thèmes |
| [08-documents-donnees.md](08-documents-donnees.md) | fichiers `.etabli`, réglages, emplacements, migrations |
| [11-conventions.md](11-conventions.md) | règles de code et de collaboration, décisions d'interface |
| [12-a-faire.md](12-a-faire.md) · [13-specs-a-venir.md](13-specs-a-venir.md) | ce qui reste à faire, spécifications |
| [21-spec-licences-baux.md](21-spec-licences-baux.md) | service de licences : comptes, baux signés, sièges, paquets chiffrés (brouillon) |
| [22-cahier-de-bord.md](22-cahier-de-bord.md) | cahier de bord : à faire à la main, décisions, avancées |
| [20-spec-mises-a-jour-registre.md](20-spec-mises-a-jour-registre.md) | mises à jour et registre « en béton » : catalogue signé, révocation, clés (brouillon) |
| [19-modele-de-menace-plugins.md](19-modele-de-menace-plugins.md) | isolation des plugins : menaces, défenses, permissions v1 |
| [18-spec-plateforme-comptes-licences.md](18-spec-plateforme-comptes-licences.md) | plateforme : comptes, licences, baux, registre, mobile, étapes (brouillon) |
| [16-spec-serveur-utilisateurs-mobile.md](16-spec-serveur-utilisateurs-mobile.md) · [17-serveur.md](17-serveur.md) | mode serveur facultatif : conception, étapes · mode d'emploi, API, sécurité |
