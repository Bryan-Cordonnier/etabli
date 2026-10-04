# Sonde du pont natif Android (outil de test, NON distribué)

Répond à une question que la lecture du code ne tranche pas : **depuis un cadre de mini-app (autre origine), peut-on
atteindre le pont natif de Capacitor** (alarmes, notifications) **ou l'application ?** Voir docs/19, §4.

Rien ici n'entre dans l'application publiée : `plugins/` ne contient pas la sonde, et l'APK de sonde est un artefact à part.

## Fabriquer l'APK de sonde
Actions › « Android (APK de test) » › Run workflow › cocher **« APK de sonde du pont »**. Télécharger `etabli-sonde-pont.apk`,
l'installer à la place de l'APK de test (même identifiant d'application : il le remplace ; ne pas garder cet APK ensuite).
En local : `ETABLI_SONDE_PONT=1 npm run apk` dans `apps/mobile`.

## Procédure (2 minutes)
1. Ouvrir l'application « Établi » : elle affiche la page de sonde à la place d'Établi.
2. Attendre 3 secondes. Quatre blocs s'affichent, chaque ligne commence par **OK** (vert) ou **FAILLE** (rouge).
3. Faire une capture d'écran de la page entière (faire défiler) et la donner.

## Résultat attendu (si tout est correct)
- **Hôte** : `window.Capacitor` et `androidBridge` présents dans la page principale ; `EtabliOrigines.etat()` répond
  `origines: true, pont: "isole", version: 1`.
- **Cadres (origine propre et opaque)** : « origine du cadre » = `https://sonde-pont.plugins.localhost` (ou `null` pour l'opaque) ;
  `androidBridge`, `Capacitor`, `CapacitorHttpAndroidInterface`, `CapacitorCookiesAndroidInterface` **absents** ;
  `parent.*` et `top.*` inaccessibles ; `document.domain` non relâchable ; les trois requêtes réseau (extérieur, application,
  autre plugin) bloquées.
- **Chemins refusés** : `/ok.js` chargé ; tous les autres refusés.

Toute ligne rouge est une faille à corriger avant d'installer un plugin d'un tiers sur Android.
