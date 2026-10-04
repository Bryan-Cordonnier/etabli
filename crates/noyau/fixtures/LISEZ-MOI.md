# Fixtures de test

- `catalogue-essai.json` + `.sig` : catalogue d'essai signé avec une clé jetable (dont la clé privée n'est pas conservée).
  Clé publique : `cle-catalogue-essai.pub`. Ne signe rien de réel. `catalogue-essai-format1.*` : même clé, ancien format (refusé).
- Pour en refaire un : générer une clé avec `npx tauri signer generate`, signer avec `npx tauri signer sign`, remplacer les trois fichiers.
