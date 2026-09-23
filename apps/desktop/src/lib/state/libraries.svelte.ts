// Bibliothèques de l'application (fournisseurs, cahier des charges section 3.3) et réglages propres
// à chaque plugin (machines d'Économie…). Chacun dans son fichier JSON, enregistré peu après chaque
// modification et transmis aux mini-apps ouvertes.
import type { Libraries, StockKind, Supplier, SupplierItem } from "@etabli/sdk/protocol";
import { api } from "$lib/api";
import { ui } from "./ui.svelte";

export { STOCK_KINDS } from "@etabli/sdk/protocol";

const SAVE_DELAY = 400;
const SUPPLIERS = "fournisseurs";
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

class LibraryStore {
  suppliers = $state<Supplier[]>([]);
  /** Réglages de chaque plugin, par identifiant de plugin. */
  pluginData = $state<Record<string, unknown>>({});

  #timers = new Map<string, ReturnType<typeof setTimeout>>();

  get current(): Libraries {
    return { suppliers: $state.snapshot(this.suppliers) };
  }

  /** Relit les fournisseurs (au démarrage, et à chaque ouverture de l'aperçu rapide). */
  async load(): Promise<void> {
    if (this.#timers.has(SUPPLIERS)) return;
    this.suppliers = cleanSuppliers(await api.dataRead(SUPPLIERS).catch(() => null));
  }

  /** Relit les réglages d'un plugin, sauf s'il reste une modification à enregistrer. */
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
