# 18 — Spécification : plateforme, comptes, licences et plugins (brouillon à valider)

> **Statut : brouillon.** Rien de ce document n'est codé. Il consigne les décisions prises avec Bryan (octobre 2026) et
> liste ce qui reste à trancher (section 13). Aucune étape de code ne démarre avant sa validation.

## 1. Décisions prises

- **Un moteur, plusieurs produits.** Établi, l'application de budget/agenda et l'ERP sont des *distributions* du même moteur :
  seuls le nom, le logo, les plugins embarqués et le registre changent (configuration de build, pas de copie du code).
- **Moteur ouvert, plugins dans des dépôts privés** (un dépôt par plugin). **Licence du moteur : Apache-2.0 (décidé).**
  la marque (nom, logo) est protégée à part. À décider avant d'accepter des contributions extérieures.
- **La logique des plugins reste toujours locale.** Aucun plugin ne s'exécute sur un serveur. Le serveur ne fait que : comptes,
  droits, permissions, stockage des données.
- **Les plugins ne sont pas tous dans l'application.** Le moteur est livré vide ; chaque plugin est un paquet signé installé selon
  le droit du compte.
- **Hébergement du code : GitHub** pour l'instant. Les adresses de mise à jour et de registre sont configurables dans le moteur.
- **Plateformes :** Windows d'abord, puis Android (APK distribué directement). iPhone plus tard. Linux plus tard.
- **Vente en France seulement** au départ ; fichiers de traduction dès maintenant (français seul) pour ouvrir ensuite.
- **Données jamais supprimées** (corbeille, rétention, export) ; l'accès en lecture et l'export survivent à une licence expirée.
- **L'horloge du poste n'est jamais une source de vérité** pour une licence.
- **Hors périmètre pour l'instant :** plugins IA, vente à l'étranger, place de marché de développeurs tiers (prévue dans
  l'architecture, pas construite). Commissions : principe accepté, à construire plus tard.

## 2. Les trois niveaux

| Niveau | Rôle | Qui l'héberge | Code |
| --- | --- | --- | --- |
| 1. **Comptes et droits** | comptes, organisations, achats, licences, baux, registre et téléchargement des plugins | **toi seul** | fermé |
| 2. **Données** | documents, réglages, utilisateurs et permissions *dans l'espace de travail* | local, ton homelab, ou hébergé par toi | ouvert (`etabli-serveur`) |
| 3. **Application et plugins** | l'interface et la logique des mini-apps, toujours sur l'appareil | l'appareil de l'utilisateur | moteur ouvert, plugins privés |

Le serveur de données actuel (`etabli-serveur`, docs/17) tient aujourd'hui les niveaux 1 et 2 à la fois. À terme, il ne garde que
le niveau 2.

### Identité unique
Un seul identifiant doit servir aux deux niveaux. Le serveur de données accepte :
- des **jetons signés** par le service central (cas courant) ;
- des **comptes locaux** (homelab, atelier sans internet), comme aujourd'hui.

## 3. Comptes et organisations

- Un **particulier** a un compte personnel.
- Une **entreprise** a une *organisation* avec **plusieurs administrateurs** (jamais un seul : un départ ne doit pas bloquer l'accès).
- L'administrateur crée les comptes des employés ; l'employé choisit son mot de passe à la première connexion (lien d'invitation).
- Récupération de compte, double authentification : prévues, après la première version. L'envoi d'e-mails exige un domaine
  (acheté avant la mise en vente).

## 4. Droits

- Un **droit** relie un compte ou une organisation à un plugin ou à un **pack** (plusieurs plugins), avec une période
  (abonnement) ou sans fin (licence perpétuelle, mises à jour limitées).
- **Licence gratuite** : un indicateur sur le compte de Bryan (usage personnel), sans paiement.
- **Plugins gratuits** : aucun droit à acheter, mais ils passent aussi par le registre signé.
- Le client demande au service central « à quels plugins ai-je droit ? » et reçoit un **bail**.

## 5. Baux

- Un bail est un jeton **signé par le service central** (Ed25519), qui contient : compte, appareil, droits, date d'expiration.
- **Durée : 48 heures (décidé par Bryan)**, réglable par offre (une seule valeur de configuration). Point de vigilance consigné :
  un week-end hors ligne (vendredi 18 h → lundi 8 h : 62 h) dépasse 48 h ; un poste éteint ou sans réseau tout le week-end
  perdra ses plugins payants jusqu'à sa prochaine connexion. Prévoir un message clair, et l'emprunt hors ligne (section 6)
  pour les déplacements. À réévaluer avec les premiers retours d'utilisateurs.
- Le client renouvelle le bail dès qu'il est en ligne. L'heure fait foi côté serveur ; le client garde un compteur monotone
  et refuse un bail dont l'heure semble reculée.
- **À l'expiration** : les plugins payants ne s'ouvrent plus, mais les données restent lisibles et exportables.
- Le code d'un plugin payant n'est livré qu'à un compte ayant un droit valide, chiffré ; la clé arrive avec le bail. Cela ne
  rend pas le piratage impossible (un expert peut extraire le code déchiffré) : la protection réelle est le contrat B2B,
  les mises à jour et le support. Ne pas promettre davantage.

## 6. Sièges

- **Nominatif** (première version) : l'administrateur assigne un siège à un employé. Un siège couvre PC et téléphone de la même
  personne, avec un nombre limité d'appareils (3 pour un particulier, à fixer pour une organisation) et la possibilité de
  désactiver un appareil perdu.
- **Flottant** (deuxième version) : N postes simultanés. Présence signalée régulièrement, libération automatique après un
  délai si le poste plante, file d'attente ou refus au-delà de N. L'administrateur choisit qui peut puiser dans le pool.
  Une session mobile compte à part (à confirmer).
- **Emprunt hors ligne** : un siège flottant peut être « emprunté » pour une durée donnée avant un déplacement.

## 7. Modes de fonctionnement

| Mode | Plugins | Mises à jour | Achats |
| --- | --- | --- | --- |
| **Hors ligne complet** | gratuits ou installés par fichier | aucune | non |
| **Connecté** | selon les droits du compte | automatiques | oui (site) |
| **Entreprise sans internet** | selon un *fichier de droits signé* de longue durée (1 an) | par paquets importés | contrat |

## 8. Registre et plugins

- **Registre officiel** (à toi) : paquets signés, catalogue, certification. Le moteur n'installe que des paquets signés par une
  clé de confiance ; des **registres privés** (clés supplémentaires) sont possibles pour des entreprises.
- **Certification** : signature, vérification du manifeste, comparaison des permissions demandées d'une version à l'autre,
  revue humaine. Les analyses automatiques ne repèrent que le grossier : la défense réelle est le bac à sable et les
  permissions. Ne pas promettre « zéro malware ».
- **Manifeste** (API des plugins v1, versionnée en semver) : ajouter `plateformes` (`windows`, `android`, `ios`), l'offre ou le
  pack, les permissions, et la version du moteur requise.
- **Isolation** : modèle de menace d'un plugin tiers hostile, un test automatique par scénario, et **une origine par plugin**
  (la version actuelle de l'origine dédiée partage une origine entre tous les plugins : à corriger, voir docs/17).
- **Mises à jour** : adresse configurable, canaux stable/bêta, déploiement progressif, retour arrière, rotation de la clé de
  signature, refus des versions plus anciennes, vérification d'intégrité avant installation.

## 9. Données et hébergement

- **Jamais supprimées** : corbeille avec rétention, export complet à tout moment, y compris après expiration d'une licence.
- **Hébergement par toi** (cible : environ 70 % des clients) : un chantier à part, à spécifier en détail avant toute offre :
  une instance isolée par client, sauvegardes testées en restauration, chiffrement, supervision, procédure d'incident, contrat
  de sous-traitance (RGPD), plafond de stockage par offre, sortie de données.
- **Auto-hébergement** : le même serveur de données, chez le client ou sur son homelab.

## 10. Mobile

- Application mobile partagée Android/iOS : interface propre au mobile, SDK et protocole communs, couche native pour les
  notifications et les alarmes.
- **Aucun achat dans l'application mobile** : elle se connecte à un compte qui a déjà les droits. Un compte sans droit voit un
  message « contactez votre administrateur ». Android : APK distribué directement. iPhone : plus tard (compte Apple Developer,
  TestFlight ou application personnalisée, règles de l'App Store à relire à ce moment-là).
- Particuliers sur iPhone : plugins gratuits, ou achat intégré ultérieur (commission d'Apple).
- Les plugins non adaptés au mobile s'affichent « bureau seulement ».

## 11. Vente, droit et traduction

- **France seulement** : le contrôle porte sur le **pays de facturation**. La géolocalisation par adresse IP n'est qu'un
  indicateur, facilement contourné, jamais un blocage seul.
- **Traduction** : les textes de l'interface passent par des fichiers de traduction dès maintenant (français seul).
- **Paiement et TVA** : un prestataire jouant le rôle de vendeur officiel est une piste ; à décider et à faire valider par un
  comptable. La micro-entreprise a ses plafonds : à vérifier également.

## 12. Étapes proposées (chacune avec sa spec détaillée et ses critères de sortie)

0. **Essai d'alarme natif Android** (1 jour), puis l'équivalent iOS plus tard.
1. **Isolation et permissions** : modèle de menace, origine par plugin, permissions v1, API des plugins v1.
2. **Mise à jour et registre** : adresse configurable, canaux, retour arrière, rotation de clé, certification minimale.
3. **Licences** : service central minimal, comptes, organisations, droits, baux, sièges nominatifs, fichier de droits hors ligne.
4. **Distributions** : nom, logo, plugins embarqués et registre par configuration ; puis l'application budget/agenda.
5. **Hôte mobile** Android.
6. Plus tard : sièges flottants, hébergement par toi, iPhone, Linux, place de marché tiers.

## 13. Questions ouvertes

1. ~~Licence du moteur~~ : **Apache-2.0, décidé.**
2. ~~Durée du bail~~ : **48 heures, décidé** (réglable par offre).
3. ~~Sièges~~ : **nominatifs d'abord, flottants ensuite, décidé.**
4. Prestataire de paiement : à choisir plus tard.
5. Gratuit : local seulement ; la synchronisation et l'hébergement par toi sont-ils payants ou plafonnés ? **À discuter.**
