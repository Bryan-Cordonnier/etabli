# Essai d'alarme Android (natif)

Petite application Android **sans aucune bibliothèque** qui répond à une seule question : une alarme programmée avec les API
système prévues pour les réveils sonne-t-elle **à l'heure, application fermée, écran verrouillé** ? Elle sert à décider de la
couche native du futur hôte mobile (docs/18). Elle n'a aucun lien avec le moteur.

## Obtenir l'APK
Onglet Actions de GitHub › « Android (essai d'alarme natif) » › Run workflow ; télécharger l'artefact `essai-alarme.apk`
(un zip à extraire), l'installer (autoriser l'installation depuis cette source).

## Protocole d'essai (à faire sur le téléphone)
1. Boutons 1 et 2 : autoriser les notifications et les alarmes exactes (l'écran du haut doit afficher « autorisées »).
2. Programmer **setAlarmClock** dans 2 minutes. **Retirer l'appli des applications récentes**, verrouiller, attendre.
3. Rouvrir l'appli : le journal affiche l'heure prévue, l'heure reçue et le **retard en secondes**.
4. Refaire avec **setExactAndAllowWhileIdle**.
5. Refaire avec 15 minutes puis 60 minutes, téléphone posé et en veille (mode Doze), puis une fois après avoir désactivé
   l'optimisation de batterie (bouton 3).
6. Noter les retards. Critère de réussite : sonnerie audible à ± 1 minute dans tous les cas.

Si une alarme ne sonne pas, noter le modèle du téléphone et la marque (certains constructeurs tuent les applications en
arrière-plan) et si le journal contient une ligne « REFUSÉE ».
