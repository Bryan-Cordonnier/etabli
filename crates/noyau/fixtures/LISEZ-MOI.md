# Fixtures de test

- `catalogue-essai.json` + `.sig` : catalogue d'essai signé avec une clé jetable (dont la clé privée n'est pas conservée).
  Clé publique : `cle-catalogue-essai.pub`. Ne signe rien de réel. `catalogue-essai-format1.*` : même clé, ancien format (refusé).
- Pour en refaire un : générer une clé avec `npx tauri signer generate`, signer avec `npx tauri signer sign`, remplacer les trois fichiers.
- Rotation de clés (`crates/noyau/src/cles.rs`) : `cle-racine-essai.pub`, `cle-publication-1-essai.pub` et `-2-` sont trois clés jetables
  (clés privées non conservées). `cles-essai.json` (séquence 2, deux clés) et `cles-essai-retrait.json` (séquence 3, sans la clé 1) sont
  signés par la racine d'essai ; `catalogue-essai-pub1.json` et `-pub2.json` sont le catalogue d'essai signé par chacune des clés de publication.
  Aucune clé privée dans le dépôt.
