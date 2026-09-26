# 12 — Reste à faire et limites connues

Les spécifications détaillées (formules, cas de test) sont recopiées dans
[13-specs-a-venir.md](13-specs-a-venir.md). Rappel : **faire valider la spécification par Bryan avant de coder**.

## À vérifier à l'écran par Bryan (codé fin septembre 2026, jamais vu dans l'application)

- **Conversions** en tableau (Maths).
- **Débit de tubes v2** : tolérances et restes en plage, poids, mode besoin, chutes réservées (choix
  entre deux résultats), priorité matière ou temps (comparaison), fiche avec l'ordre par angle de scie.
- **Export DXF** (boîte « Enregistrer sous », ouverture dans SolidWorks ou LibreCAD) et **gabarit à
  l'échelle 1** imprimé à 100 % (mesurer la règle de 100 mm).
- **Traçage** : les 5 mini-apps ; la trémie carré-rond est à contrôler sur une vraie pièce.
- **Matériaux et fixation** : les 4 mini-apps.

## Économie de matière

- Chutes réservées des **tôles** (même règle que les tubes : deux résultats si la réservation coûte
  une tôle de plus) : pas faites.
- Butée maxi de la scie (`stopMax`) : seulement une étiquette « butée » sur la fiche ; longueur mini
  (`minLength`) : seulement signalée.

## Moteur (lot 1)

- **Projets** (section 3.1) : onglet « Projets » sous Accueil ; créer (nom, description, emplacement)
  → dossier avec un sous-dossier par plugin, sans statut ; déplacer un calcul dans un projet ;
  ouvrir un projet partagé ; double-clic sur un `.etabli` dans l'Explorateur (association de fichier
  dans l'installateur + argument de lancement) ; imprimer toutes les fiches d'un projet.
- Enregistrer les fiches en PDF dans le projet sans passer par la fenêtre d'impression (WebView2
  `PrintToPdf`).
- Envoi entre mini-apps : proposer un choix quand plusieurs mini-apps acceptent le même type.
- Tables de référence : permettre à l'utilisateur d'ajouter ses propres lignes (ex. une matière de
  la Tôlerie), enregistrées dans `PluginSettings`.

## Plugins des lots suivants (spécifiés dans le cahier des plugins)

- **Traçage**, pistes pour la suite (façon Logitrace) : piquage cône sur cylindre, cylindre sur cône,
  réduction excentrée, culotte (Y), trémie rond-rond décalée, virole à pas de vis ; surfaces des
  profilés laminés (peinture) dans Matériaux.
- **Soudage** (7.x, proposé) : cordon d'angle, chanfrein, consommables et coût, préchauffage.
- **Tolérances et ajustements** (8.x, proposé) : ISO 286, ISO 2768, ISO 13920 (tables à vérifier sur
  la norme avant publication).
- **Chiffrage** (lot 4, proposé) : lit les résultats et les prix des fournisseurs, facultatif.

## Distribution

- **Mises à jour automatiques** via GitHub Releases (greffon updater de Tauri) : pas faites.
- **Installateur** : vérifier que les plugins officiels compilés sont inclus dans les ressources de
  l'application (`bundle.resources` de `tauri.conf.json`) — en production, le moteur les cherche dans
  `resources/plugins`. Pas encore configuré ni testé.
- Catalogue de plugins en ligne : bouton présent mais désactivé.
- Site de documentation pour les auteurs de plugins : non commencé.

## Limites connues

- Beaucoup d'écrans récents n'ont été vérifiés que par les types et les tests, pas à l'écran par un
  agent : l'outil de prévisualisation n'était pas disponible (voir [02-environnement.md](02-environnement.md)).
- Masses des tubes et cornières (Matériaux) en angles vifs : 1 à 3 % au-dessus du catalogue.
- Vitesses de la machine (Matériaux) : séparées par des espaces, donc sans espace dans les milliers
  (« 1120 », pas « 1 120 »).
- Le commit `8360f99` a un caractère BOM au début de son titre (sans conséquence).
- `Pythagore.svelte` n'utilise pas encore `MiniAppDocument` (fonctionne, mais style ancien).
