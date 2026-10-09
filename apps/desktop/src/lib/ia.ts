// Intelligence artificielle de l'utilisateur (Gemini, clé personnelle). Seule l'interface hôte parle au service : un plugin ne fait que
// demander (message `ai`, permission `ia`), il ne voit jamais la clé. L'adresse de Google doit être autorisée par la distribution
// (`connect-src` de sa configuration Tauri) ; sans cela, le navigateur du moteur refuse l'appel.
import type { AiImage, AiResult } from "@etabli/sdk/protocol";
import { BASE, construireRequete, lireConfigIa, lireReponse, type ConfigIa } from "./iaPur";
import { load, save } from "./storage";

export { CONFIG_DEFAUT, MODELE_DEFAUT, MODELES, type ConfigIa } from "./iaPur";

export const configIa = (): ConfigIa => lireConfigIa(load("ia", null));
export const enregistrerConfigIa = (c: ConfigIa): void => save("ia", lireConfigIa(c));
export const iaConfiguree = (): boolean => configIa().cle !== "";

/** Appelle Gemini avec la configuration enregistrée. Ne jette jamais. */
export async function demander(options: { instruction: string; images?: readonly AiImage[]; schema?: unknown }, brute: ConfigIa = configIa()): Promise<AiResult> {
  const config = lireConfigIa(brute);
  if (config.cle === "") return { ok: false, code: "non_configure", message: "L'IA n'est pas configurée : ajoutez votre clé dans Paramètres → Intelligence artificielle." };
  try {
    const reponse = await fetch(`${BASE}/${encodeURIComponent(config.modele)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.cle },
      body: JSON.stringify(construireRequete(options)),
      signal: AbortSignal.timeout(80_000),
    });
    return lireReponse(reponse.status, await reponse.json().catch(() => null));
  } catch {
    return lireReponse(0, null);
  }
}

/** Essai de la clé : une demande minuscule, pour vérifier la clé et le modèle sans rien envoyer d'autre. */
export const tester = (config: ConfigIa): Promise<AiResult> => demander({ instruction: "Réponds simplement par le mot OK." }, config);
