// Page de mini-app des appelants d'essai : n'a aucune interface, expose seulement quelques fonctions que le script d'essai
// (scripts/essai-appels.mjs) appelle depuis le navigateur. Fixture de test, jamais distribuée.
import { connect } from "@etabli/sdk";
import { sonde } from "../sonde";

const etabli = await connect<unknown>();

Object.assign(window, {
  appeler: (service: string, fn: string, args: unknown, timeoutMs?: number) =>
    etabli.services.call(service, fn, args, timeoutMs ? { timeoutMs } : undefined),
  sonde,
});
document.getElementById("etat")!.textContent = "prêt";
document.title = "prêt";
