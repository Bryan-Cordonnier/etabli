// Arrêt programmé d'un contrat d'API de plugin (docs/19 §4, docs/20) : avertissement, puis refus d'installer ou de mettre à
// jour. Les dates viennent du catalogue signé (champ `contrats`) ; sans entrée, rien n'est jamais refusé. Le moteur Rust
// (`crates/noyau/src/catalogue.rs`, `statut_contrat`) applique la même règle et fait foi ; ici, le retour à l'utilisateur.
import { majeure } from "./permissions";

export interface ArretContrat {
  /** Version majeure du contrat (1 pour « ^1 »). */
  majeure: number;
  /** Secondes depuis 1970. */
  avertir_des?: number | null;
  refuser_des?: number | null;
  message?: string;
}

export type StatutContrat = { statut: "accepte" } | { statut: "avertir"; phrase: string } | { statut: "refuse"; phrase: string };

const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Garde les arrêts bien formés d'un catalogue lu sur le réseau (un champ absent ou abîmé : aucun arrêt). */
export function readArrets(raw: unknown): ArretContrat[] {
  const list = (raw as { contrats?: unknown })?.contrats;
  if (!Array.isArray(list)) return [];
  return list
    .filter((a): a is ArretContrat => typeof a === "object" && a !== null && Number.isSafeInteger(a.majeure) && a.majeure >= 1)
    .map((a) => ({
      majeure: a.majeure,
      avertir_des: isTime(a.avertir_des) ? a.avertir_des : null,
      refuser_des: isTime(a.refuser_des) ? a.refuser_des : null,
      message: typeof a.message === "string" ? a.message : "",
    }));
}

/** Statut d'un plugin selon son `apiVersion` et la date (`now` en secondes depuis 1970). */
export function statutContrat(arrets: readonly ArretContrat[], apiVersion: string | undefined, now: number): StatutContrat {
  const m = majeure(apiVersion);
  const arret = arrets.find((a) => a.majeure === m);
  if (!arret) return { statut: "accepte" };
  const phrase = (defaut: string) => (arret.message?.trim() ? arret.message.trim() : defaut);
  if (isTime(arret.refuser_des) && now >= arret.refuser_des) {
    return {
      statut: "refuse",
      phrase: phrase(`Les plugins du contrat ^${m} ne sont plus acceptés : une version plus récente du plugin est nécessaire.`),
    };
  }
  if (isTime(arret.avertir_des) && now >= arret.avertir_des) {
    return { statut: "avertir", phrase: phrase(`Les plugins du contrat ^${m} cesseront d'être acceptés.`) };
  }
  return { statut: "accepte" };
}
