// Fournisseurs de matière : ce que vend chaque fournisseur, avec ses dimensions commerciales, sa
// tolérance et un prix facultatif. Le plugin publie cette liste sous le nom `fournisseurs` (contrat
// `fournisseurs@1`, type `FournisseursData` du SDK) : les plugins de calcul la lisent en lecture seule.
import type { StockKind, Supplier, SupplierItem } from "@etabli/sdk";

export const PRICE_UNITS: { id: SupplierItem["priceUnit"]; label: string }[] = [
  { id: "piece", label: "€ / pièce" },
  { id: "kg", label: "€ / kg" },
  { id: "m", label: "€ / m" },
  { id: "m2", label: "€ / m²" },
];

const newId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12);

/** Une ligne de matière : une barre de 6 m (ou une tôle de 2500 × 1250) sans tolérance ni prix. */
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

export function newSupplier(): Supplier {
  return { id: newId(), name: "", items: [newItem()] };
}

/** Fichier abîmé ou d'une ancienne version : on garde ce qui est lisible. */
export function cleanSuppliers(value: unknown): Supplier[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Supplier => typeof s === "object" && s !== null && typeof s.id === "string")
    .map((s) => ({
      id: s.id,
      name: String(s.name ?? ""),
      items: Array.isArray(s.items) ? s.items.map((item) => ({ ...newItem(item.kind), ...item })) : [],
    }));
}

/** Passer d'une barre à une tôle (ou l'inverse) change les dimensions par défaut : une tôle a une largeur. */
export function changeKind(item: SupplierItem, kind: StockKind): void {
  const wasSheet = item.kind === "tole";
  item.kind = kind;
  if (kind === "tole" && !wasSheet) Object.assign(item, { length: 2500, width: 1250 });
  if (kind !== "tole" && wasSheet) Object.assign(item, { length: 6000, width: null });
}

export type NumberKey = "length" | "width" | "tolMinus" | "tolPlus" | "price";

/** Champ vidé ou illisible : 0 pour une dimension, rien pour le prix. Virgule décimale acceptée. */
export function setNumber(item: SupplierItem, key: NumberKey, raw: string): void {
  const value = Number(raw.replace(",", "."));
  const empty = raw.trim() === "" || !Number.isFinite(value);
  if (key === "price") item.price = empty ? null : Math.max(0, value);
  else if (key === "width") item.width = empty ? 0 : Math.max(0, value);
  else item[key] = empty ? 0 : Math.max(0, value);
}
