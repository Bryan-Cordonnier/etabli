# 21 — Spécification : service de comptes et de licences, baux, sièges (brouillon)

> **Statut : brouillon, rien n'est codé.** Il détaille l'étape « licences » de [18](18-spec-plateforme-comptes-licences.md) avec les
> décisions déjà prises : bail de **48 h** (réglable par offre), sièges **nominatifs d'abord**, logique des plugins toujours
> locale, données jamais supprimées, heure du poste jamais fiable, vente en France seulement.

## 1. Rôle et frontières

Le **service central** (niveau 1 de [18](18-spec-plateforme-comptes-licences.md)) est le seul à savoir *qui a le droit de quoi*.
Il ne voit jamais les calculs des utilisateurs (niveau 2) ni le code des mini-apps en clair (niveau 3). Il fait :
comptes et organisations, achats (via un prestataire de paiement), droits, appareils, baux, distribution des paquets chiffrés.

Le moteur ouvert **ne contient aucun secret** : il connaît la clé publique du service, rien d'autre.

## 2. Modèle de données

| Objet | Champs principaux |
| --- | --- |
| `compte` | id, e-mail, mot de passe (Argon2id), 2FA (plus tard), `organisation_id?`, rôle (`proprietaire` · `admin` · `membre`) |
| `organisation` | id, nom, ≥ 1 propriétaire, adresse de facturation (France) |
| `offre` | id, plugins inclus (un plugin ou un pack), durée de bail (heures, 48 par défaut), nombre d'appareils par siège (3), type de siège |
| `droit` | id, `offre_id`, titulaire (compte ou organisation), début, fin (`null` = perpétuel), état (`actif` · `suspendu` · `resilie`), sièges achetés |
| `siege` | id, `droit_id`, `compte_id?` (nominatif : assigné ; vide : libre) |
| `appareil` | id, `compte_id`, nom, clé publique X25519 (générée sur l'appareil), dernière vue, état (`actif` · `desactive`) |
| `bail` | jeton signé (§4), jamais stocké comme référence : le service garde seulement (appareil, expiration, numéro de série) |
| `licence_gratuite` | indicateur sur un compte : accès à tout ce que Bryan autorise pour son usage personnel, sans paiement |

Principe : **rien n'est supprimé** — une résiliation passe l'état à `resilie` et la date de fin ; les journaux sont conservés.

## 3. Activation d'un appareil

1. L'utilisateur se connecte (e-mail + mot de passe). L'appareil génère une **paire de clés** (clé privée dans le coffre du système :
   Windows Credential Manager ; Android Keystore) et envoie la clé publique avec un nom.
2. Le service vérifie la limite d'appareils (3 par siège) ; au-delà, l'utilisateur doit en désactiver un (appareil perdu).
3. Le service répond par un **bail** (§4). L'appareil le garde sur disque.

## 4. Le bail

Jeton compact signé par le service (Ed25519, identifiant de clé `kid` pour la rotation) :

```
{ "v":1, "kid":"2026-1", "jti":"<série>", "sub":"<compte>", "app":"<appareil>",
  "iat":<s>, "exp":<s>,            // exp = iat + durée de l'offre (48 h)
  "droits":[ {"plugin":"tracage","jusqua":null} ],
  "cles":{ "tracage":"<clé de contenu enveloppée pour la clé publique de l'appareil>" } }
```

- **Heure** : le client ne se fie pas à l'horloge système. Il garde le dernier `iat` vu et refuse un bail dont l'`iat` recule, puis mesure
  le temps écoulé avec une horloge monotone (temps de fonctionnement), recalée à chaque contact avec le service.
- **Renouvellement** : automatique à la moitié de la durée et à chaque démarrage connecté. Hors ligne, le bail courant sert jusqu'à `exp`.
- **À l'expiration** : les plugins payants ne s'ouvrent plus ; documents et réglages restent lisibles et exportables ; message clair
  « Reconnectez-vous pour réactiver vos plugins ».
- **Résiliation** : le service cesse de renouveler ; au plus 48 h d'usage restant après la résiliation.

## 5. Paquets chiffrés

- Un paquet payant est publié chiffré (AES-256-GCM, clé de contenu propre à chaque version) puis **signé** comme les autres.
- La clé de contenu est **enveloppée** pour la clé publique de l'appareil (boîte scellée X25519) dans le bail. Un compte sans droit ne reçoit
  jamais cette clé ; il peut télécharger le paquet (public) mais pas l'ouvrir.
- **Limite assumée** : l'appareil déchiffre le code en mémoire pour l'exécuter ; un expert peut l'en extraire. Ce qui protège réellement :
  le contrat B2B, les mises à jour, le support, la révocation. Ne pas promettre davantage.

## 6. Sièges

- **Nominatif** (première version) : l'administrateur de l'organisation assigne un siège libre à un compte membre ; le retirer le libère
  immédiatement pour le prochain bail (le précédent s'éteint au plus tard à `exp`).
- **Flottant** (deuxième version) : N sessions simultanées pour un groupe de comptes. `POST /sessions` prend un siège (≥ 1 libre), un signal de
  présence toutes les 5 minutes le garde, 15 minutes sans signal le libère. **Emprunt hors ligne** : réserver un siège pour une durée
  choisie (≤ 7 jours) avant un déplacement ; le bail d'emprunt porte cette durée.
- Une session mobile compte à part (à confirmer).

## 6 bis. Licence de site hors ligne
Pour un atelier sans internet : fichier de droits signé (même format de jeton, `exp` à un an, liste d'appareils ou de sièges), importé à la
main ; les clés de contenu y sont enveloppées pour une clé de site. Même logique d'expiration. Contrat spécifique.

## 7. Interface de programmation (esquisse)

| Appel | Rôle |
| --- | --- |
| `POST /v1/comptes`, `POST /v1/session` | création, connexion |
| `POST /v1/appareils` | activer un appareil (clé publique) → bail |
| `POST /v1/baux/renouveler` | échanger un bail encore valide contre un nouveau |
| `GET /v1/catalogue` | catalogue signé (docs/20) filtré par droits |
| `GET /v1/paquets/{id}/{version}` | paquet chiffré |
| `POST/DELETE /v1/org/sieges/{id}/compte` | assigner / retirer un siège |
| `POST /v1/org/comptes` | inviter un employé (lien d'invitation, mot de passe choisi à la première connexion) |
| `DELETE /v1/appareils/{id}` | désactiver un appareil |
| webhook du prestataire de paiement | crée, renouvelle ou résilie un `droit` |

## 8. Exigences de sécurité du service

Argon2id, limitation des essais, sessions à jetons hachés, journal d'audit, aucune donnée de calcul stockée, sauvegardes testées en
restauration, clé de signature des baux dans un coffre matériel ou un KMS, rotation prévue (`kid`), procédure d'incident écrite.
Données personnelles : minimales (e-mail, nom d'organisation, adresse de facturation) ; RGPD : durée de conservation, droit d'accès, sous-traitants.

## 9. Tests prévus (écrits avec le code)

Fonctions pures dans `etabli-noyau` : vérification d'un bail (signature, `kid`, `iat` qui recule, `exp`, appareil), calcul du temps restant avec
horloge monotone, décision « ce plugin est-il ouvrable ? », prise et libération d'un siège flottant (présence, délai). Un banc de tests de bout en bout
du service : activation, limite d'appareils, renouvellement, résiliation, retrait de siège, jeton falsifié, clé de contenu d'un autre appareil.

## 10. Questions ouvertes

1. Prestataire de paiement et choix « vendeur officiel » (TVA) : à trancher avec un comptable.
2. Où héberger le service central au début : le homelab de Bryan pour les essais, puis un petit serveur loué (pas de domaine ni d'e-mail transactionnel avant la mise en vente).
3. 2FA : à la première version, ou dès qu'une organisation l'exige ?
4. Appareils par siège : 3 pour un particulier ; pour une organisation, une valeur par offre ?
