// Validation stricte des saisies et des données enregistrées. Tout écart est un refus `argument_invalide` avec une phrase qui dit quoi
// corriger ; un champ inconnu est refusé (une faute de frappe ne passe pas en silence).
import { estJour, type Jour } from "@etabli/ui/civil";
import { estCentimes } from "@etabli/ui/money";
import { ErreurPaie } from "./types";

const refus = (message: string): never => {
  throw new ErreurPaie("argument_invalide", message);
};

export function objet(brut: unknown, obligatoires: readonly string[], facultatifs: readonly string[] = []): Record<string, unknown> {
  if (brut === null || typeof brut !== "object" || Array.isArray(brut)) return refus("Les données doivent être un objet.");
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

export function montant(v: unknown, nom: string, min = 0): number {
  if (!estCentimes(v)) return refus(`« ${nom} » doit être un nombre entier de centimes (entre -10^12 et 10^12), pas « ${String(v)} ».`);
  if (v < min) return refus(`« ${nom} » ne peut pas être inférieur à ${min / 100} €.`);
  return v;
}

export function jourValide(v: unknown, nom: string): Jour {
  if (!estJour(v)) return refus(`« ${nom} » doit être un jour AAAA-MM-JJ qui existe (reçu « ${String(v)} »).`);
  return v;
}

export function entier(v: unknown, nom: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) {
    return refus(`« ${nom} » doit être un nombre entier entre ${min} et ${max} (reçu « ${String(v)} »).`);
  }
  return v;
}

export function choix<T extends string>(v: unknown, nom: string, permis: readonly T[]): T {
  if (typeof v !== "string" || !(permis as readonly string[]).includes(v)) return refus(`« ${nom} » doit être l'une de ces valeurs : ${permis.join(", ")}.`);
  return v as T;
}

export function liste<T>(v: unknown, nom: string, element: (x: unknown) => T, max: number): T[] {
  if (!Array.isArray(v)) return refus(`« ${nom} » doit être une liste.`);
  if (v.length > max) throw new ErreurPaie("limite_atteinte", `« ${nom} » : ${v.length} éléments, au plus ${max}.`);
  return v.map(element);
}
