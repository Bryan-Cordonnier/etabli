// Validation stricte des arguments d'un appel (le moteur ne vérifie que la forme et la taille : docs/06). Tout écart est un refus
// `argument_invalide` avec une phrase qui dit quoi corriger ; un champ inconnu est refusé (une faute de frappe ne passe pas en silence).
import { estJour, type Jour } from "@etabli/ui/civil";
import { estCentimes } from "@etabli/ui/money";
import { ErreurBudget } from "./types";

const refus = (message: string): never => {
  throw new ErreurBudget("argument_invalide", message);
};

export function objet(brut: unknown, obligatoires: readonly string[], facultatifs: readonly string[] = []): Record<string, unknown> {
  if (brut === null || typeof brut !== "object" || Array.isArray(brut)) return refus("Les arguments doivent être un objet.");
  const o = brut as Record<string, unknown>;
  for (const cle of Object.keys(o)) {
    if (!obligatoires.includes(cle) && !facultatifs.includes(cle)) refus(`Champ inconnu : « ${cle} ».`);
  }
  for (const cle of obligatoires) if (!(cle in o) || o[cle] === undefined) refus(`Champ obligatoire manquant : « ${cle} ».`);
  return o;
}

export function texte(v: unknown, nom: string, max: number): string {
  if (typeof v !== "string") return refus(`« ${nom} » doit être un texte.`);
  const t = v.trim();
  if (t === "") return refus(`« ${nom} » ne peut pas être vide.`);
  if (t.length > max) return refus(`« ${nom} » est trop long (${max} caractères au plus).`);
  if (/[\u0000-\u001f\u007f]/.test(t)) return refus(`« ${nom} » contient un caractère de contrôle.`);
  return t;
}

export function montant(v: unknown, nom: string): number {
  if (!estCentimes(v)) return refus(`« ${nom} » doit être un nombre entier de centimes (entre -10^12 et 10^12), pas « ${String(v)} ».`);
  return v;
}

/** Montant strictement positif (un virement, un abonnement, un plafond). */
export function montantPositif(v: unknown, nom: string): number {
  const m = montant(v, nom);
  if (m <= 0) return refus(`« ${nom} » doit être supérieur à zéro.`);
  return m;
}

export function jourValide(v: unknown, nom: string): Jour {
  if (!estJour(v)) return refus(`« ${nom} » doit être un jour AAAA-MM-JJ qui existe (reçu « ${String(v)} »).`);
  return v;
}

export function choix<T extends string>(v: unknown, nom: string, permis: readonly T[]): T {
  if (typeof v !== "string" || !(permis as readonly string[]).includes(v)) return refus(`« ${nom} » doit être l'une de ces valeurs : ${permis.join(", ")}.`);
  return v as T;
}

export function identifiant(v: unknown, nom: string): string {
  if (typeof v !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(v)) return refus(`« ${nom} » n'est pas un identifiant.`);
  return v;
}

export const identifiantFacultatif = (v: unknown, nom: string): string | null => (v === undefined || v === null ? null : identifiant(v, nom));

export function liste<T>(v: unknown, nom: string, element: (x: unknown) => T, max: number): T[] {
  if (!Array.isArray(v)) return refus(`« ${nom} » doit être une liste.`);
  if (v.length > max) throw new ErreurBudget("limite_atteinte", `« ${nom} » : ${v.length} éléments, au plus ${max}.`);
  return v.map(element);
}

/** Clé d'idempotence : unique par appelant, 1 à 120 caractères sans espace. */
export function cle(v: unknown): string {
  if (typeof v !== "string" || !/^[^\s\u0000-\u001f]{1,120}$/.test(v)) return refus("« cle » doit être un texte de 1 à 120 caractères sans espace (une clé d'idempotence).");
  return v;
}

/** Référence de regroupement (« mission:12 »). */
export function reference(v: unknown, nom: string): string {
  if (typeof v !== "string" || !/^[^\s\u0000-\u001f]{1,80}$/.test(v)) return refus(`« ${nom} » doit être un texte de 1 à 80 caractères sans espace.`);
  return v;
}
