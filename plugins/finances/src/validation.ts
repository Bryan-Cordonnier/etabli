// Validation stricte des arguments d'un appel (le moteur ne vérifie que la forme et la taille : docs/06). Tout écart est un refus
// `argument_invalide` avec une phrase qui dit quoi corriger ; un champ inconnu est refusé (une faute de frappe ne passe pas en silence).
import { estCentimes } from "@etabli/ui/money";
import { estJour, type Jour } from "@etabli/ui/civil";
import { ErreurFinances } from "./types";

const refus = (message: string): never => {
  throw new ErreurFinances("argument_invalide", message);
};

/** Un objet simple dont les clés sont parmi `obligatoires` et `facultatifs`. */
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
  // Pas de caractères de contrôle (retours, tabulations…) dans un libellé ou un nom.
  if (/[\u0000-\u001f\u007f]/.test(t)) return refus(`« ${nom} » contient un caractère de contrôle.`);
  return t;
}

export const texteFacultatif = (v: unknown, nom: string, max: number): string | null => (v === undefined || v === null ? null : texte(v, nom, max));

export function montant(v: unknown, nom: string): number {
  if (!estCentimes(v)) return refus(`« ${nom} » doit être un nombre entier de centimes (entre -10^12 et 10^12), pas « ${String(v)} ».`);
  return v;
}

export function jourValide(v: unknown, nom: string): Jour {
  if (!estJour(v)) return refus(`« ${nom} » doit être un jour AAAA-MM-JJ qui existe (reçu « ${String(v)} »).`);
  return v;
}

export function instant(v: unknown, nom: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > 8.64e15) {
    return refus(`« ${nom} » doit être un instant en millisecondes UTC (entier positif).`);
  }
  return v;
}

export function choix<T extends string>(v: unknown, nom: string, permis: readonly T[]): T {
  if (typeof v !== "string" || !(permis as readonly string[]).includes(v)) return refus(`« ${nom} » doit être l'une de ces valeurs : ${permis.join(", ")}.`);
  return v as T;
}

/** Clé d'idempotence : unique par appelant, 1 à 120 caractères sans espace. */
export function cle(v: unknown): string {
  if (typeof v !== "string" || !/^[^\s\u0000-\u001f]{1,120}$/.test(v)) return refus("« cle » doit être un texte de 1 à 120 caractères sans espace (une clé d'idempotence).");
  return v;
}

export function identifiant(v: unknown, nom: string): string {
  if (typeof v !== "string" || !/^[a-z]\d{1,9}$/.test(v)) return refus(`« ${nom} » n'est pas un identifiant valide.`);
  return v;
}

export function liste<T>(v: unknown, nom: string, element: (x: unknown) => T, max: number): T[] {
  if (!Array.isArray(v)) return refus(`« ${nom} » doit être une liste.`);
  if (v.length > max) return refus(`« ${nom} » : ${max} éléments au plus.`);
  return v.map(element);
}
