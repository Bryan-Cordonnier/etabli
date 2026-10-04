// Page `serviceEntry` du fournisseur d'essai : aucune interface, seulement des gestionnaires de fonctions.
// Fixture de test (voir apps/desktop/src/lib/plugins/appels.integration.test.ts), jamais distribuée.
import { connect, ServiceError } from "@etabli/sdk";

interface Ecriture {
  cle: string;
  montant: number;
  source: string;
}

const etabli = await connect<unknown>();
const registre: Ecriture[] = [];

etabli.services.handle("registre", {
  "ecritures.ajouter": (args, { caller }) => {
    const a = args as { cle?: unknown; montant?: unknown } | null;
    // Le fournisseur valide ses arguments : le moteur ne contrôle que la forme et la taille.
    if (!a || typeof a.cle !== "string" || a.cle === "" || !Number.isSafeInteger(a.montant)) {
      throw new ServiceError("argument_invalide", "Il faut une clé (texte) et un montant entier en centimes.");
    }
    // Idempotence : rejouer la même clé ne crée pas de doublon.
    const deja = registre.find((e) => e.cle === a.cle && e.source === caller);
    if (deja) return { cle: deja.cle, doublon: true };
    // La source est l'identité imposée par le moteur, pas une donnée de l'appelant.
    registre.push({ cle: a.cle, montant: a.montant as number, source: caller });
    return { cle: a.cle, doublon: false };
  },
  "soldes.total": () => ({ total: registre.reduce((somme, e) => somme + e.montant, 0), nombre: registre.length }),
  "echo.appelant": (_args, { caller }) => caller,
});
