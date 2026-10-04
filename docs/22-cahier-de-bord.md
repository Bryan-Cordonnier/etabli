# Cahier de bord

Journal du projet pour Bryan : ce qui est fait, ce qui a été décidé, ce qui reste à faire **à la main** (ce qu'un agent ne peut pas faire à ta place), et ce qui reste à faire côté code.
À tenir à jour à chaque étape : les cases cochées sont faites, les autres attendent.

Dernière mise à jour : 4 octobre 2026.

## 1. À faire à la main (Bryan)

### Dépôt GitHub
- [ ] Fusionner la PR #23 (retour arrière d'un plugin, plugins révoqués) — CI verte.
- [ ] Fusionner la PR #24 (documentation d'état) — CI verte.
- [ ] Fusionner la PR #25 (essai d'isolation en CI) — CI verte.
- [ ] Fusionner la PR du présent cahier.
- [ ] Fermer la PR #13 (Capacitor 8, Dependabot) : à reprendre plus tard avec le mobile.
- [ ] Regarder l'alerte Dependabot « modérée » sur `main` (Sécurité → Dependabot, alerte n° 1).

### Publication
- [ ] Lancer **une fois** le workflow « Catalogue (renouvellement) » (Actions) pour passer au catalogue signé. Tant que ce n'est pas fait, le catalogue reste non signé (accepté seulement jusqu'au premier catalogue signé vu).
- [ ] Publier les nouvelles versions des plugins (manifestes `apiVersion` ^2 + permissions) et de l'application (tag de version) : seul toi peux pousser un tag.

### Essais à l'écran (jamais vus par un agent)
- [ ] Fenêtre des permissions à l'installation d'un plugin.
- [ ] Bouton « Revenir à la version précédente » dans le catalogue.
- [ ] Plugin révoqué : pastille « Révoqué », désactivation, message.
- [ ] Mini-apps sous WebView2 (Windows) : l'essai d'isolation automatique ne couvre que Chromium sous Linux.

### Décisions à prendre
- [ ] **Nom commercial** (voir §3). Vérifier toi-même INPI, TMview et les domaines (mes outils n'accèdent pas aux registres).
- [ ] Offre **gratuite** : existe-t-elle, avec quelles limites ? (reporté « à demain »)
- [ ] Répondre aux questions ouvertes de [docs/20](20-spec-mises-a-jour-registre.md) et [docs/21](21-spec-licences-baux.md) ; sans cela le service de licences n'est pas codé.
- [ ] Valider les spécifications [docs/18](18-spec-plateforme-comptes-licences.md) avant tout gros développement (règle d'or du projet).

### Plus tard
- [ ] Domaine, hébergement (VPS) et courriels transactionnels : pas avant d'avoir le nom ; homelab pour les essais.
- [ ] Marque : dépôt INPI et protection du nom, indépendamment de la licence du code.
- [ ] Comptes développeur Apple (iPhone) quand le mobile arrivera.

## 2. Décisions prises

| Sujet | Décision |
| --- | --- |
| Moteur | Open source, licence **Apache-2.0** ; la marque est protégée à part |
| Plugins | Dépôts privés (un par plugin) ; la logique s'exécute toujours **en local**, jamais sur le serveur |
| Serveur | Comptes, droits et données seulement |
| Licences | **Bail de 48 h** (réglable par offre) ; **sièges nominatifs d'abord**, flottants ensuite ; licence personnelle gratuite pour Bryan |
| Données | Jamais supprimées : export et lecture restent possibles après expiration |
| Horloge | L'horloge locale n'est jamais crue |
| Vente | France uniquement pour l'instant (contrôle du pays de facturation) ; fichiers de traduction dès le départ, français seul |
| Commissions | Commissions sur les plugins tiers acceptées (à construire plus tard) |
| IA | Pas de plugins d'IA pour l'instant |
| Plateformes | Windows d'abord (moteur « nickel »), puis mobile ; iPhone prévu (application de compte, sans achat intégré) ; Linux repoussé |
| Hébergement du code | Reste sur GitHub ; adresses configurables plus tard |
| Produits | Trois applications (Établi d'essai, ERP de ton entreprise, budget/agenda perso) issues du **même moteur**, différenciées par la configuration de build (pas de copies ni de forks) |
| Ordre | Moteur PC solide (isolation, permissions, mises à jour irréprochables, code propre), puis licences, distributions, mobile |

## 3. Nom commercial (recherche)

- Écartés ou risqués : Atelio, Brik/Briks, Haya, Fabriko, Gabari (pris), Tree, linked.app, Anticip, BeFast.
- Gabario : rappelle l'image de Mario. Tablier : possible mais commun et proche de la classe 9.
- **Maillon** : le meilleur jusqu'ici ; `maillon.fr` est pris (distributeur de pièces de cycles), Maillon.io (SaaS) est fermé.
- Non testés : Citius, Celero, Rask, Anello, Ligilo, Vinco, Syndes, Primeur, Anticipo, Praesto, Adelanto, Burin, Tenon, Ouvra, Arca, Kelvo, Nodo, Forja.
- Critères de Bryan : général, original, clair, simple, mémorisable ; un mot courant ne gêne pas (clients par publicité, direct, prospection).

## 4. Journal des avancées

### Moteur et plugins
- Serveur facultatif `etabli-serveur` (axum, SQLite, Argon2id) et crate commune `etabli-noyau` (identifiants, calculs, paquets signés) : [docs/17](17-serveur.md).
- Interface « Fond » (Tauri, web IndexedDB, serveur avec cache hors ligne et file d'écriture) ; version web et PWA ; emballage Android (Capacitor, APK de test par la CI).
- Isolation : un domaine par plugin sur le serveur, service worker par plugin pour le hors ligne, garde des messages côté hôte, **permissions v1** (`apiVersion` ^2) ; les 7 plugins officiels migrés : [docs/19](19-modele-de-menace-plugins.md).
- **Catalogue signé** (format 2) : séquence croissante, expiration à 30 jours, révocations, anti-retour-arrière, renouvellement mensuel automatique ; l'application utilise `etabli-noyau` pour les paquets : [docs/20](20-spec-mises-a-jour-registre.md).
- Retour arrière d'un plugin (version précédente conservée), mises à jour suspendues après un retour arrière, plugins révoqués (PR #23).
- **Essai d'isolation de bout en bout en CI** : vrai serveur + Chromium, 62 vérifications (hôtes étrangers, évasions de chemin, parent inaccessible, réseau bloqué, stockage séparé, messages hostiles) (PR #25).
- Essai d'alarme Android natif : alarmes et notifications vérifiées sur ton téléphone.

### Modifications de l'application de base
- Fenêtre d'installation d'un plugin : affiche les permissions demandées.
- Page Catalogue : pastille « Révoqué », bouton « Revenir à la … ».
- Réglages : plugins épinglés (mise à jour automatique suspendue), plugin révoqué toujours désactivé.
- Export de fichiers : 8 extensions autorisées, 20 Mo ; documents et données de plugin plafonnés à 5 Mio.
- Scripts : `paquet-plugin.mjs` (empreinte sha256, catalogue signé), `valider-plugin.mjs` (contrôle des permissions), `nouveau-plugin.mjs` (modèle ^2).

### Spécifications écrites
- [docs/18](18-spec-plateforme-comptes-licences.md) plateforme, comptes, licences ; [docs/19](19-modele-de-menace-plugins.md) menaces ; [docs/20](20-spec-mises-a-jour-registre.md) mises à jour ; [docs/21](21-spec-licences-baux.md) baux.

## 5. Reste à faire côté code (agent)

- Procédure de clé racine et de rotation de la clé de signature.
- Sources de catalogue configurables, puis canal bêta.
- Séparation des origines des plugins en mode web local.
- Date d'arrêt du contrat ^1.
- Plugin volontairement hostile dans l'essai d'isolation.
- Service de licences (docs/21), **après** ta validation.
- Distributions Établi / ERP / budget par configuration de build.
- Application mobile, en dernier.

## 6. Ce qui n'a pas été vérifié

- Rien sous WebView2 / dans l'application Tauri : les essais automatiques tournent sur Chromium (Linux).
- L'interface des PR #23 (permissions, retour arrière, révocation) n'a pas été vue à l'écran.
- Le Rust de l'application n'est compilé que par la CI Windows, pas dans le bac à sable de l'agent.
