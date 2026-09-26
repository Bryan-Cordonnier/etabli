// Vitesse de coupe, de rotation et d'avance (cahier des charges des plugins, section 5.3).
// Diamètres en mm, Vc en m/min, N en tr/min, Vf en mm/min, temps en minutes.
import table from "./data/vitesses-coupe.json";

export type Operation = keyof typeof table.vc;
export type Outil = "hss" | "carbure";

export const OPERATIONS: { id: Operation; label: string }[] = [
  { id: "percage", label: "Perçage" },
  { id: "fraisage", label: "Fraisage" },
  { id: "tournage", label: "Tournage" },
];

export const OUTILS: { id: Outil; label: string }[] = [
  { id: "hss", label: "Acier rapide (HSS)" },
  { id: "carbure", label: "Carbure" },
];

export const MATIERES_USINAGE: { id: string; nom: string }[] = table.matieres;
export const SOURCE_VITESSES: string = table.source;
export const CONSEIL_AVANCE: Record<Operation, string> = table.avances;

export interface Plage {
  min: number;
  conseillee: number;
  max: number;
}

/** Plage de vitesse de coupe de la table : mini, conseillée, maxi (NaN si la matière n'y est pas). */
export function vcPlage(operation: Operation, outil: Outil, matiere: string): Plage {
  const ligne: Record<string, number[]> = table.vc[operation][outil];
  const [min, conseillee, max] = ligne[matiere] ?? [NaN, NaN, NaN];
  return { min: min!, conseillee: conseillee!, max: max! };
}

/** Vitesse de coupe conseillée par la table (NaN si la matière n'y est pas). */
export const vcConseillee = (operation: Operation, outil: Outil, matiere: string): number => vcPlage(operation, outil, matiere).conseillee;

/**
 * Avance de départ : par tour pour un foret (Ø / 100, bornée entre 0,02 et 0,4 mm/tr) ou un tour
 * (0,2 mm/tr), par dent pour une fraise (0,05 en HSS, 0,1 en carbure). Réduite en inox.
 */
export function avanceConseillee(operation: Operation, outil: Outil, matiere: string, d: number): number {
  const inox = matiere === "inox" ? 0.6 : 1;
  const base = operation === "percage" ? Math.min(0.4, Math.max(0.02, d / 100)) : operation === "fraisage" ? (outil === "hss" ? 0.05 : 0.1) : 0.2;
  return Math.round(base * inox * 100) / 100;
}

/** N = 1000 × Vc / (π × D). */
export const rotation = (vc: number, d: number): number => (1000 * vc) / (Math.PI * d);

/** Vc = π × D × N / 1000 : la vitesse de coupe réelle à la vitesse choisie sur la machine. */
export const vitesseCoupe = (n: number, d: number): number => (Math.PI * d * n) / 1000;

/** Vf = N × fz × Z (fraisage) ; pour un foret ou un tour, avance par tour f : Vf = N × f (Z = 1). */
export const avance = (n: number, f: number, dents = 1): number => n * f * dents;

/** Temps d'usinage pour une course de `longueur` mm, en minutes. */
export const temps = (longueur: number, vf: number): number => longueur / vf;

/**
 * Lit la liste des vitesses d'une machine (« 180 280 450 710 », virgules ou points-virgules acceptés)
 * et renvoie celle à régler : dans la plage [mini, maxi], la plus proche de la vitesse théorique ;
 * sinon la plus proche sous la vitesse théorique, ou la plus petite.
 */
export function vitesseMachine(liste: string, n: number, mini = n, maxi = n * 1.05): number {
  const vitesses = liste
    .split(/[\s;,]+/)
    .map(Number)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (vitesses.length === 0 || !(n > 0)) return NaN;
  const dansPlage = vitesses.filter((v) => v >= mini && v <= maxi);
  if (dansPlage.length > 0) return dansPlage.reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best));
  const dessous = vitesses.filter((v) => v <= n);
  return dessous.length > 0 ? dessous[dessous.length - 1]! : vitesses[0]!;
}
