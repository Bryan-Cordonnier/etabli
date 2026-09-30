// Machines de l'atelier : scies et cisailles. Le plugin publie cette liste sous le nom `machines`
// (contrat `machines@1`, type `MachinesData` du SDK) : les plugins de calcul la lisent en lecture seule.
import { SAW_TYPES, type Machine, type MachineKind, type Saw, type Shear } from "@etabli/sdk";

const newId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12);

export const GROUPS: { kind: MachineKind; title: string; add: string; placeholder: string }[] = [
  { kind: "scie", title: "Scies", add: "Ajouter une scie", placeholder: "Nom de la scie" },
  { kind: "cisaille", title: "Cisailles", add: "Ajouter une cisaille", placeholder: "Nom de la cisaille" },
];

/** Une machine avec des réglages courants, à ajuster. */
export function newMachine(kind: MachineKind): Machine {
  return kind === "scie"
    ? { id: newId(), kind, name: "", type: "ruban", kerf: 2, maxAngle: 60, bothSides: false, stopMax: null, minLength: 30, trim: 5 }
    : { id: newId(), kind, name: "", bladeLength: 2050, maxThickness: 4, gaugeMax: 750, trim: 5 };
}

const numberOr = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Fichier abîmé ou d'une ancienne version : on garde ce qui est lisible. */
export function cleanMachines(value: unknown): Machine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null && (m.kind === "scie" || m.kind === "cisaille"))
    .map((m): Machine => {
      const base = newMachine(m.kind as MachineKind);
      const common = { id: typeof m.id === "string" ? m.id : base.id, name: String(m.name ?? "") };
      if (base.kind === "scie") {
        return {
          ...base,
          ...common,
          type: SAW_TYPES.some((t) => t.id === m.type) ? (m.type as Saw["type"]) : base.type,
          kerf: numberOr(m.kerf, base.kerf),
          maxAngle: numberOr(m.maxAngle, base.maxAngle),
          bothSides: m.bothSides === true,
          stopMax: m.stopMax === null ? null : numberOr(m.stopMax, base.stopMax ?? 0) || null,
          minLength: numberOr(m.minLength, base.minLength),
          trim: numberOr(m.trim, base.trim),
        };
      }
      return {
        ...base,
        ...common,
        bladeLength: numberOr(m.bladeLength, (base as Shear).bladeLength),
        maxThickness: numberOr(m.maxThickness, (base as Shear).maxThickness),
        gaugeMax: numberOr(m.gaugeMax, (base as Shear).gaugeMax),
        trim: numberOr(m.trim, base.trim),
      };
    });
}

/** Champ vidé ou illisible : 0 (la course de butée vide veut dire « pas de butée »). Virgule décimale acceptée. */
export function setNumber<M extends Machine>(machine: M, key: keyof M, raw: string): void {
  const value = Number(raw.replace(",", ".").trim());
  (machine as Record<keyof M, unknown>)[key] = raw.trim() === "" || !Number.isFinite(value) ? 0 : Math.max(0, value);
}

/** Intention transmise par le moteur dans l'adresse de la page : « #add=scie » (« + Ajouter une machine… » d'un calcul). */
export function requestedKind(hash: string): MachineKind | null {
  const match = /^#?add=(scie|cisaille)$/.exec(hash);
  return match ? (match[1] as MachineKind) : null;
}
