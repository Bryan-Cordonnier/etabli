// Page `serviceEntry` du fournisseur d'essai : aucune interface, seulement des gestionnaires de fonctions.
// Fixture de test (voir apps/desktop/src/lib/plugins/appels.integration.test.ts), jamais distribuée.
import { connect, ServiceError } from "@etabli/sdk";
import { sonde } from "../../sonde";

interface Ecriture {
  cle: string;
  montant: number;
  source: string;
}

const etabli = await connect<unknown>();
// Aucun état en mémoire d'un appel à l'autre (un appel = un cadre neuf) : le registre vit dans les réglages du plugin.
const lireRegistre = (): Ecriture[] => ((etabli.settings.data as { registre?: Ecriture[] } | null)?.registre ?? []).slice();

etabli.services.handle("registre", {
  "ecritures.ajouter": (args, { caller }) => {
    const a = args as { cle?: unknown; montant?: unknown } | null;
    // Le fournisseur valide ses arguments : le moteur ne contrôle que la forme et la taille.
    if (!a || typeof a.cle !== "string" || a.cle === "" || !Number.isSafeInteger(a.montant)) {
      throw new ServiceError("argument_invalide", "Il faut une clé (texte) et un montant entier en centimes.");
    }
    // Idempotence : rejouer la même clé ne crée pas de doublon.
    const registre = lireRegistre();
    const deja = registre.find((e) => e.cle === a.cle && e.source === caller);
    if (deja) return { cle: deja.cle, doublon: true };
    // La source est l'identité imposée par le moteur, pas une donnée de l'appelant.
    registre.push({ cle: a.cle, montant: a.montant as number, source: caller });
    etabli.settings.update({ registre });
    return { cle: a.cle, doublon: false };
  },
  "soldes.total": () => {
    const registre = lireRegistre();
    return { total: registre.reduce((somme, e) => somme + e.montant, 0), nombre: registre.length };
  },
  "echo.appelant": (_args, { caller }) => caller,
  // Pour les essais navigateur (scripts/essai-appels.mjs) : ce qu'un code hostile pourrait tenter depuis ce cadre invisible.
  "sonde.isolation": () => sonde(),
  // Répond après `ms` millisecondes, en disant quand il a commencé et fini : prouve que les appels passent un par un.
  "attendre.ms": async (args) => {
    const ms = (args as { ms?: unknown } | null)?.ms;
    if (!Number.isSafeInteger(ms) || (ms as number) < 0 || (ms as number) > 20_000) {
      throw new ServiceError("argument_invalide", "ms doit être un entier entre 0 et 20000.");
    }
    const debut = Date.now();
    await new Promise((r) => setTimeout(r, ms as number));
    return { debut, fin: Date.now() };
  },
  // Ne répond jamais : le moteur doit rendre `delai_depasse` et détruire le cadre.
  "ne.repond.jamais": () => new Promise(() => {}),
});
