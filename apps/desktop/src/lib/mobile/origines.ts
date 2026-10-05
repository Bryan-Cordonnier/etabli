// Origine par plugin dans l'application Android (docs/19, §4) : la partie native (apps/mobile, OriginesPlugins.java) sert
// chaque plugin sur son propre nom d'hôte, depuis les ressources embarquées, comme le serveur le fait sur le réseau.
// L'interface ne s'en sert que si la partie native le confirme ; sinon elle garde le repli prudent de la version web.
import { modelePluginsSur } from "../serveur/fond";
import { ClientApi } from "../serveur/http";

/** Contrat avec le plugin Capacitor local `EtabliOrigines` (EtabliOriginesPlugin.java). */
export interface PluginOrigines {
  etat(): Promise<{ version?: unknown; origines?: unknown; modele?: unknown; pont?: unknown }>;
}

/** Version du contrat comprise par cette interface. */
export const VERSION_ORIGINES = 1;

/** Modèle d'adresse des plugins sur Android ; le même que celui annoncé par la partie native. */
export const MODELE_ANDROID = "https://{id}.plugins.localhost";

/** Au-delà, la partie native est considérée comme absente (ancienne application, pont natif retiré). */
const DELAI_MS = 2500;

/** Le plugin natif, ou `undefined` hors de l'application Android. */
export async function pluginOrigines(): Promise<PluginOrigines | undefined> {
  const c = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!c?.isNativePlatform?.()) return undefined;
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin<PluginOrigines>("EtabliOrigines");
}

/**
 * Modèle d'adresse à utiliser si la partie native sert une origine par plugin et que son pont est réservé à la page
 * principale ; `undefined` sinon (le repli prudent s'applique).
 *
 * `pageOrigin` : origine de l'application, qui ne doit pas pouvoir être fabriquée par le modèle.
 */
export async function modeleOrigines(
  plugin: PluginOrigines | undefined,
  pageOrigin: string | undefined = typeof location === "undefined" ? undefined : location.origin,
  delaiMs = DELAI_MS,
): Promise<string | undefined> {
  if (!plugin) return undefined;
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  try {
    const etat = await Promise.race([
      plugin.etat(),
      new Promise<undefined>((resolve) => {
        minuteur = setTimeout(() => resolve(undefined), delaiMs);
      }),
    ]);
    if (!etat || etat.version !== VERSION_ORIGINES || etat.origines !== true || etat.pont !== "isole") return undefined;
    // Le modèle est fixé ici et non lu de la réponse : seule la forme connue est acceptée.
    if (etat.modele !== MODELE_ANDROID) return undefined;
    return modelePluginsSur(MODELE_ANDROID, new ClientApi({ base: "" }), pageOrigin);
  } catch {
    return undefined;
  } finally {
    clearTimeout(minuteur);
  }
}
