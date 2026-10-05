// @etabli/ui — composants communs des mini-apps (cahier des charges, section 9.2).
export { default as Card } from "./Card.svelte";
export { default as Check } from "./Check.svelte";
export { default as Field } from "./Field.svelte";
export { default as DonutChart } from "./DonutChart.svelte";
export { default as Icon } from "./Icon.svelte";
export { default as LineChart } from "./LineChart.svelte";
export { default as Result } from "./Result.svelte";
export { default as Segmented } from "./Segmented.svelte";
export { default as SelectField } from "./SelectField.svelte";
export { evaluate, format, isExpression, parsePasted } from "./calc";
export { MiniAppDocument } from "./document.svelte";
export { Libraries, PluginSettings, onIncoming, printFiche, saveFile, sendTo } from "./host.svelte";
export { box, esc, facts, fmt, hatch, mark, section, signature, table, tint, type Column } from "./fiche";
export { toDxf, type DxfDrawing, type DxfLayer } from "./dxf";
export { gabaritPages, type GabaritLabel, type GabaritShape } from "./gabarit";
export { COLORS, colorOf } from "./colors";
export { cheminAire, cheminLigne, echelle, graduations, plusProche, regrouper, secteurs } from "./charts";
// Argent (centimes entiers) et dates civiles : `money.formatEuros(...)`, `civil.ajouterMois(...)`. Pour une page sans interface (un
// fournisseur de service) : `import { formatEuros } from "@etabli/ui/money"` évite de charger les composants Svelte.
export * as money from "./money";
export * as civil from "./civil";
