// Avant de démarrer l'interface : faut-il d'abord passer par l'écran de connexion ? (docs/16, §5)
import { api, clientServeur } from "./api";
import { lireConnexion, sonderServeur } from "./connexion";
import { ErreurApi } from "./serveur/http";

export interface Porte {
  /** La page est servie par le serveur : pas d'adresse à saisir. */
  memeOrigine: boolean;
  /** Le serveur a déjà son administrateur. */
  installe: boolean;
  /** Une session existait mais le serveur ne la reconnaît plus. */
  expiree: boolean;
}

/** `null` : l'application peut démarrer. Sinon, l'écran de connexion décrit par la porte. */
export async function decider(): Promise<Porte | null> {
  if (api.id === "tauri") return null;
  if (api.id === "serveur" && clientServeur) {
    try {
      await clientServeur.requete("GET", "/api/moi");
      return null;
    } catch (e) {
      // Session refusée : reconnexion. Serveur injoignable : on démarre hors ligne avec la copie de cet appareil.
      if (e instanceof ErreurApi && e.statut === 401) return { memeOrigine: clientServeur.base === "", installe: true, expiree: true };
      return null;
    }
  }
  // Mode seul : si la page est servie par un serveur Établi et que rien n'a encore été choisi, on propose la connexion.
  if (lireConnexion()?.mode === "local") return null;
  const sonde = await sonderServeur("");
  return sonde ? { memeOrigine: true, installe: sonde.installe, expiree: false } : null;
}
