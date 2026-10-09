// Partie pure du dialogue avec Gemini : lecture de la configuration, forme de la requête, lecture de la réponse. Sans réseau ni stockage : testée seule.
import type { AiErrorCode, AiImage, AiResult } from "@etabli/sdk/protocol";

export interface ConfigIa {
  fournisseur: "gemini";
  /** Clé d'API personnelle ; vide : non configuré. */
  cle: string;
  modele: string;
}

export const MODELE_DEFAUT = "gemini-3.5-flash-lite";
/** Modèles proposés dans les Paramètres ; l'utilisateur peut en saisir un autre. */
export const MODELES = [
  { id: "gemini-3.5-flash-lite", nom: "3.5 Flash-Lite (le moins cher, suffit pour des tickets)" },
  { id: "gemini-3.1-flash-lite", nom: "3.1 Flash-Lite" },
  { id: "gemini-3.8-flash", nom: "3.8 Flash (plus précis)" },
] as const;

export const CONFIG_DEFAUT: ConfigIa = { fournisseur: "gemini", cle: "", modele: MODELE_DEFAUT };
export const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Lecture défensive de ce qui est enregistré : seuls une clé de texte et un nom de modèle propre sont gardés. */
export function lireConfigIa(brut: unknown): ConfigIa {
  const o = typeof brut === "object" && brut !== null ? (brut as Record<string, unknown>) : {};
  // Le format des clés de Google change (« AIza… », puis « AQ.… » avec un point) : on ne vérifie que ce qui est sûr à mettre dans un en-tête,
  // des caractères imprimables sans espace. C'est Google qui dit si la clé est bonne (bouton « Essayer »). Les guillemets collés avec elle sont retirés.
  const cle = typeof o.cle === "string" ? o.cle.trim().replace(/^["'«»]+|["'«»]+$/g, "").trim().slice(0, 400) : "";
  const modele = typeof o.modele === "string" && /^[a-z0-9][a-z0-9._-]{1,60}$/.test(o.modele.trim()) ? o.modele.trim() : MODELE_DEFAUT;
  return { fournisseur: "gemini", cle: /^[\x21-\x7e]{10,400}$/.test(cle) ? cle : "", modele };
}

/** Le corps de la requête Gemini : la consigne, les photos, et la réponse en JSON quand un schéma est donné. */
export function construireRequete(options: { instruction: string; images?: readonly AiImage[]; schema?: unknown }): Record<string, unknown> {
  const avecSchema = options.schema !== undefined;
  const consigne = avecSchema
    ? `${options.instruction}\n\nRéponds UNIQUEMENT par un objet JSON valide, sans texte autour ni balises, conforme à ce schéma JSON :\n${JSON.stringify(options.schema)}`
    : options.instruction;
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: consigne }, ...(options.images ?? []).map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } }))],
      },
    ],
    generationConfig: { temperature: 0.1, ...(avecSchema ? { response_mime_type: "application/json" } : {}) },
  };
}

const MOTS: Record<number, [AiErrorCode, string]> = {
  400: ["refuse", "Le service a refusé la demande (clé invalide ou photo illisible)."],
  401: ["refuse", "Clé d'API refusée."],
  403: ["refuse", "Clé d'API refusée ou sans droit sur ce modèle."],
  404: ["erreur", "Modèle introuvable : choisissez-en un autre dans les Paramètres."],
  429: ["limite", "Limite d'utilisation gratuite atteinte : réessayez dans un moment."],
};

/** Lit la réponse de Gemini : le texte, ou une erreur claire en français. `statut` : code HTTP (0 : le réseau a échoué). */
export function lireReponse(statut: number, json: unknown): AiResult {
  const o = typeof json === "object" && json !== null ? (json as Record<string, any>) : {};
  if (statut === 0) return { ok: false, code: "reseau", message: "Pas de réponse du service : vérifiez la connexion." };
  if (statut >= 400) {
    const [code, message] = MOTS[statut] ?? (statut >= 500 ? (["reseau", "Le service est indisponible pour l'instant."] as [AiErrorCode, string]) : (["erreur", `Erreur ${statut} du service.`] as [AiErrorCode, string]));
    const detail = typeof o.error?.message === "string" ? ` (${o.error.message.slice(0, 160)})` : "";
    return { ok: false, code, message: message + detail };
  }
  const bloque = o.promptFeedback?.blockReason;
  if (typeof bloque === "string") return { ok: false, code: "bloque", message: "Le service a refusé d'analyser cette demande." };
  const parts = o.candidates?.[0]?.content?.parts;
  const texte = Array.isArray(parts) ? parts.map((p: { text?: unknown }) => (typeof p.text === "string" ? p.text : "")).join("").trim() : "";
  return texte === "" ? { ok: false, code: "erreur", message: "Le service n'a rien répondu." } : { ok: true, texte };
}
