// Bibliothèques de l'application (fournisseurs et machines, cahier des charges section 3.3) et
// réglages propres à chaque plugin. Chacun dans son fichier JSON, enregistré peu après chaque
// modification et transmis aux mini-apps ouvertes.
import {
  SAW_TYPES,
  type Libraries,
  type Machine,
  type MachineKind,
  type Saw,
  type Shear,
  type StockKind,
  type Supplier,
  type SupplierItem,
} from "@etabli/sdk/protocol";
import { api } from "$lib/api";
import { ui } from "./ui.svelte";

export { SAW_TYPES, STOCK_KINDS } from "@etabli/sdk/protocol";

const SAVE_DELAY = 400;
const SUPPLIERS = "fournisseurs";
const MACHINES = "machines";
const pluginFile = (pluginId: string) => `plugin.${pluginId}`;

export const PRICE_UNITS: { id: SupplierItem["priceUnit"]; label: string }[] = [
  { id: "piece", label: "€ / pièce" },
  { id: "kg", label: "€ / kg" },
  { id: "m", label: "€ / m" },
  { id: "m2", label: "€ / m²" },
];

const newId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12);

export function newItem(kind: StockKind = "tube-carre"): SupplierItem {
  const sheet = kind === "tole";
  return {
    id: newId(),
    kind,
    material: "",
    designation: "",
    length: sheet ? 2500 : 6000,
    width: sheet ? 1250 : null,
    tolMinus: 0,
    tolPlus: 0,
    price: null,
    priceUnit: "piece",
  };
}

/** Fichier abîmé ou d'une ancienne version : on garde ce qui est lisible. */
function cleanSuppliers(value: unknown): Supplier[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Supplier => typeof s === "object" && s !== null && typeof s.id === "string")
    .map((s) => ({
      id: s.id,
      name: String(s.name ?? ""),
      items: Array.isArray(s.items) ? s.items.map((item) => ({ ...newItem(item.kind), ...item })) : [],
    }));
}

export function newMachine(kind: MachineKind): Machine {
  return kind === "scie"
    ? { id: newId(), kind, name: "", type: "ruban", kerf: 2, maxAngle: 60, bothSides: false, stopMax: null, minLength: 30, trim: 5 }
    : { id: newId(), kind, name: "", bladeLength: 2050, maxThickness: 4, gaugeMax: 750, trim: 5 };
}

/** Un atelier type, tant que l'utilisateur n'a rien enregistré. */
const DEFAULT_MACHINES: Machine[] = [
  { ...newMachine("scie"), id: "scie-ruban", name: "Scie à ruban" } as Saw,
  { ...newMachine("cisaille"), id: "cisaille", name: "Cisaille 2050" } as Shear,
];

const numberOr = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

function cleanMachines(value: unknown): Machine[] {
  if (value === null || value === undefined) return structuredClone(DEFAULT_MACHINES);
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
        bladeLength: numberOr(m.bladeLength, base.bladeLength),
        maxThickness: numberOr(m.maxThickness, base.maxThickness),
        gaugeMax: numberOr(m.gaugeMax, base.gaugeMax),
        trim: numberOr(m.trim, base.trim),
      };
    });
}

class LibraryStore {
  suppliers = $state<Supplier[]>([]);
  machines = $state<Machine[]>([]);
  /** Machine qui vient d'être ajoutée depuis une mini-app : les Paramètres l'affichent et la mettent en avant. */
  highlight = $state<string | null>(null);
  /** Réglages de chaque plugin, par identifiant de plugin. */
  pluginData = $state<Record<string, unknown>>({});

  #timers = new Map<string, ReturnType<typeof setTimeout>>();

  get current(): Libraries {
    return { suppliers: $state.snapshot(this.suppliers), machines: $state.snapshot(this.machines) };
  }

  /** Relit les bibliothèques (au démarrage, et à chaque ouverture de l'aperçu rapide). */
  async load(): Promise<void> {
    const [suppliers, machines] = await Promise.all([
      this.#timers.has(SUPPLIERS) ? undefined : api.dataRead(SUPPLIERS).catch(() => []),
      this.#timers.has(MACHINES) ? undefined : api.dataRead(MACHINES).catch(() => null),
    ]);
    if (suppliers !== undefined) this.suppliers = cleanSuppliers(suppliers);
    if (machines !== undefined) this.machines = cleanMachines(machines);
  }

  saveMachines(): void {
    this.#schedule(MACHINES, () => $state.snapshot(this.machines));
  }

  addMachine(kind: MachineKind): Machine {
    const machine = newMachine(kind);
    this.machines.push(machine);
    this.highlight = machine.id;
    this.saveMachines();
    return machine;
  }

  removeMachine(id: string): void {
    this.machines = this.machines.filter((m) => m.id !== id);
    this.saveMachines();
  }

  /** Relit les réglages d'un plugin (les mêmes règles que les bibliothèques). */
  async loadPlugin(pluginId: string): Promise<unknown> {
    const file = pluginFile(pluginId);
    if (!this.#timers.has(file)) {
      this.pluginData[pluginId] = await api.dataRead(file).catch(() => null);
    }
    return this.pluginData[pluginId] ?? null;
  }

  setPluginData(pluginId: string, data: unknown): void {
    this.pluginData[pluginId] = data;
    this.#schedule(pluginFile(pluginId), () => $state.snapshot(this.pluginData[pluginId]));
  }

  /** À appeler après chaque modification de la liste des fournisseurs. */
  saveSuppliers(): void {
    this.#schedule(SUPPLIERS, () => $state.snapshot(this.suppliers));
  }

  addSupplier(): Supplier {
    const supplier: Supplier = { id: newId(), name: "", items: [newItem()] };
    this.suppliers.push(supplier);
    this.saveSuppliers();
    return supplier;
  }

  removeSupplier(id: string): void {
    this.suppliers = this.suppliers.filter((s) => s.id !== id);
    this.saveSuppliers();
  }

  #schedule(file: string, value: () => unknown): void {
    clearTimeout(this.#timers.get(file));
    // Tant qu'une écriture est en attente, `load` ne relit pas le disque (il écraserait la saisie).
    const timer = setTimeout(() => {
      void api
        .dataWrite(file, value())
        .catch((err) => ui.notify(`Enregistrement impossible : ${err}`))
        .finally(() => {
          if (this.#timers.get(file) === timer) this.#timers.delete(file);
        });
    }, SAVE_DELAY);
    this.#timers.set(file, timer);
  }
}

export const libraries = new LibraryStore();
