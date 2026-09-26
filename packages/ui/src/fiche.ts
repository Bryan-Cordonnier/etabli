// Petits morceaux de HTML des fiches d'atelier (cahier des charges, section 3.2), communs à tous
// les plugins. Les classes (`facts`, `mark`, `block`…) viennent de la feuille commune fournie par
// le moteur à l'impression (apps/desktop/src/lib/print/fiche.css).

/** Texte sûr dans le HTML de la fiche. */
export const esc = (text: string | number): string =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Nombre à la française (« 1 450 », « 2,5 »). */
export const fmt = (value: number, decimals = 1): string =>
  Number.isFinite(value) ? value.toLocaleString("fr-FR", { maximumFractionDigits: decimals }) : "—";

/** Teinte très claire d'une couleur de repère : lisible imprimée, même en noir et blanc. */
export function tint(hex: string, amount = 0.8): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r! << 16) | (g! << 8) | b!).toString(16).slice(1)}`;
}

export const mark = (label: string, color: string): string =>
  `<span class="mark" style="--fill:${tint(color)}">${esc(label)}</span>`;

export const box = '<span class="box"></span>';

export const section = (title: string, body: string): string => `<div class="section"><h2>${esc(title)}</h2>${body}</div>`;

export const facts = (items: { label: string; value: string; detail?: string }[]): string =>
  `<div class="facts">${items
    .map((f) => `<div class="fact"><span>${esc(f.label)}</span><b>${esc(f.value)}</b>${f.detail ? `<small>${esc(f.detail)}</small>` : ""}</div>`)
    .join("")}</div>`;

export interface Column {
  label: string;
  right?: boolean;
}

/** Tableau : les cellules sont déjà du HTML (utiliser `esc` pour le texte). */
export function table(columns: Column[], rows: string[][]): string {
  const cls = (c: Column) => (c.right ? ' class="r"' : "");
  return `<table><thead><tr>${columns.map((c) => `<th${cls(c)}>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell, i) => `<td${cls(columns[i]!)}>${cell}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export const signature = '<div class="sign"><div>Coupé par</div><div>Contrôlé par</div><div>Date</div></div>';

/** Motif de hachures pour les pertes, à placer une fois par schéma SVG. */
export const hatch = (id: string): string =>
  `<defs><pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#7c8591" stroke-width="1.4"/></pattern></defs>`;
