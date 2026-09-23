// Bibliothèque Machines d'Économie de matière (cahier des charges, sections 9.3 et 9.4) :
// les scies et les cisailles de l'atelier. Enregistrée par le moteur avec les réglages du plugin,
// partagée par le débit de tubes et le calepinage. Valeurs saisies en texte, comme les calculs.

export type SawType = "ruban" | "tronconneuse" | "onglet" | "autre";

export interface Saw {
  id: string;
  name: string;
  type: SawType;
  /** Épaisseur de lame (trait de scie), en mm. */
  kerf: string;
  /** Angle maxi de la scie, en degrés (0 : coupes droites seulement). */
  maxAngle: string;
  /** La scie tourne des deux côtés (−45° à +45°), sinon d'un seul. */
  bothSides: boolean;
  hasStop: boolean;
  /** Course maxi de la butée, en mm. */
  stopMax: string;
  /** Longueur la plus courte que l'étau tient encore, en mm. */
  minLength: string;
  /** Dressage du bout de barre avant la première coupe, en mm. */
  trim: string;
}

export interface Shear {
  id: string;
  name: string;
  /** Longueur de coupe maxi (longueur de lame), en mm. */
  bladeLength: string;
  /** Épaisseur maxi en acier, en mm. */
  maxThickness: string;
  /** Course de la butée arrière, en mm. */
  gaugeMax: string;
  /** Dressage du premier bord de la tôle, en mm. */
  trim: string;
}

export interface Machines {
  saws: Saw[];
  shears: Shear[];
}

export const SAW_TYPES: { value: SawType; label: string }[] = [
  { value: "ruban", label: "Scie à ruban" },
  { value: "tronconneuse", label: "Tronçonneuse" },
  { value: "onglet", label: "Scie à onglet" },
  { value: "autre", label: "Autre" },
];

const newId = () => Math.random().toString(36).slice(2, 10);

export function newSaw(): Saw {
  return {
    id: newId(),
    name: "Scie à ruban",
    type: "ruban",
    kerf: "2",
    maxAngle: "60",
    bothSides: false,
    hasStop: false,
    stopMax: "",
    minLength: "30",
    trim: "5",
  };
}

export function newShear(): Shear {
  return { id: newId(), name: "Cisaille guillotine", bladeLength: "2050", maxThickness: "4", gaugeMax: "750", trim: "5" };
}

/** Un atelier type, tant que l'utilisateur n'a rien saisi. */
export const DEFAULT_MACHINES: Machines = {
  saws: [{ ...newSaw(), id: "scie" }],
  shears: [{ ...newShear(), id: "cisaille", name: "Cisaille 2050" }],
};

const text = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;

/** Réglages du plugin, partagés par ses mini-apps. */
export interface EconomieSettings {
  machines: Machines;
}

export const DEFAULT_SETTINGS: EconomieSettings = { machines: DEFAULT_MACHINES };

export function cleanSettings(saved: unknown): EconomieSettings {
  const machines = typeof saved === "object" && saved !== null ? (saved as { machines?: unknown }).machines : null;
  return { machines: cleanMachines(machines) };
}

/** Réglages enregistrés remis en forme : champs manquants complétés, lignes illisibles écartées. */
export function cleanMachines(saved: unknown, defaults: Machines = DEFAULT_MACHINES): Machines {
  if (typeof saved !== "object" || saved === null) return structuredClone(defaults);
  const raw = saved as Partial<Record<keyof Machines, unknown>>;
  const list = (value: unknown) =>
    Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null) : null;

  const saws = list(raw.saws)?.map((s): Saw => {
    const base = newSaw();
    return {
      id: text(s.id, base.id),
      name: text(s.name, base.name),
      type: SAW_TYPES.some((t) => t.value === s.type) ? (s.type as SawType) : base.type,
      kerf: text(s.kerf, base.kerf),
      maxAngle: text(s.maxAngle, base.maxAngle),
      bothSides: s.bothSides === true,
      hasStop: s.hasStop === true,
      stopMax: text(s.stopMax, base.stopMax),
      minLength: text(s.minLength, base.minLength),
      trim: text(s.trim, base.trim),
    };
  });
  const shears = list(raw.shears)?.map((s): Shear => {
    const base = newShear();
    return {
      id: text(s.id, base.id),
      name: text(s.name, base.name),
      bladeLength: text(s.bladeLength, base.bladeLength),
      maxThickness: text(s.maxThickness, base.maxThickness),
      gaugeMax: text(s.gaugeMax, base.gaugeMax),
      trim: text(s.trim, base.trim),
    };
  });
  return {
    saws: saws ?? structuredClone(defaults.saws),
    shears: shears ?? structuredClone(defaults.shears),
  };
}
