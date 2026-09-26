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

/** Vitesse de coupe conseillée par la table (NaN si la matière n'y est pas). */
export function vcConseillee(operation: Operation, outil: Outil, matiere: string): number {
  const ligne: Record<string, number> = table.vc[operation][outil];
  return ligne[matiere] ?? NaN;
}

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
 * et renvoie celle à régler : la plus proche sous la vitesse calculée, ou la plus petite.
 */
export function vitesseMachine(liste: string, n: number): number {
  const vitesses = liste
    .split(/[\s;,]+/)
    .map(Number)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (vitesses.length === 0 || !(n > 0)) return NaN;
  const dessous = vitesses.filter((v) => v <= n * 1.05);
  return dessous.length > 0 ? dessous[dessous.length - 1]! : vitesses[0]!;
}
