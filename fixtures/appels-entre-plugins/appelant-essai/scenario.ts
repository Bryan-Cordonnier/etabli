// Ce que fait l'appelant d'essai : une suite d'appels, avec les réponses rendues telles quelles.
// Fixture de test (voir apps/desktop/src/lib/plugins/appels.integration.test.ts), jamais distribuée.
import { connect } from "@etabli/sdk";

export async function scenario() {
  const etabli = await connect<unknown>();
  const appeler = (fn: string, args: unknown) => etabli.services.call("registre", fn, args, { timeoutMs: 3000 });
  const ajout = await appeler("ecritures.ajouter", { cle: "paie-oct", montant: 125000 });
  const doublon = await appeler("ecritures.ajouter", { cle: "paie-oct", montant: 125000 });
  const total = await appeler("soldes.total", null);
  const invalide = await appeler("ecritures.ajouter", { cle: "x", montant: "beaucoup" });
  const inconnue = await appeler("ecritures.supprimer", { cle: "paie-oct" });
  const identite = await appeler("echo.appelant", null);
  return { ajout, doublon, total, invalide, inconnue, identite };
}
