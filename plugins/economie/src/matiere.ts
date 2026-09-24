// Matières et poids (cahier des charges, sections 9.3 et 9.4) : un poids approximatif,
// à partir de la masse volumique de la matière choisie dans le calcul.

export type MaterialId = "acier" | "galva" | "inox" | "alu" | "cuivre" | "laiton";

export const MATERIALS: {
  id: MaterialId;
  label: string;
  /** Masse volumique en g/cm³ (= kg/dm³). */
  density: number;
  /** Capacité d'une cisaille par rapport à l'acier : l'inox, plus dur, se coupe moins épais. */
  shearFactor: number;
}[] = [
  { id: "acier", label: "Acier", density: 7.85, shearFactor: 1 },
  { id: "galva", label: "Acier galvanisé", density: 7.85, shearFactor: 1 },
  { id: "inox", label: "Inox", density: 7.93, shearFactor: 0.65 },
  { id: "alu", label: "Aluminium", density: 2.7, shearFactor: 1.5 },
  { id: "cuivre", label: "Cuivre", density: 8.96, shearFactor: 1.2 },
  { id: "laiton", label: "Laiton", density: 8.5, shearFactor: 1.2 },
];

export const materialOf = (id: string) => MATERIALS.find((m) => m.id === id) ?? MATERIALS[0]!;

/** Poids en kg d'une plaque : surface en mm², épaisseur en mm. */
export const plateWeight = (area: number, thickness: number, density: number): number => (area * thickness * density) / 1e6;
