// Gabarit papier à l'échelle 1 (cahier des charges des plugins, section 6) : un développé trop grand
// pour une feuille est découpé en feuilles A4 à assembler bord à bord. Chaque feuille porte son
// repère (A1, A2, B1…), des repères d'assemblage et une règle de 100 mm pour vérifier l'échelle.
// Les pages s'ajoutent à une fiche d'atelier (`printFiche`) : imprimer à 100 %, « taille réelle ».
import { esc } from "./fiche";

export interface GabaritShape {
  /** Points en mm, Y vers le haut (comme le DXF). */
  points: [number, number][];
  closed?: boolean;
  /** contour : trait de découpe ; pli : ligne de pliage ; trace : génératrice ou repère. */
  kind: "contour" | "pli" | "trace";
}

export interface GabaritLabel {
  at: [number, number];
  text: string;
}

/** Zone utile d'une feuille A4 (marges de la fiche déduites), en mm. */
const TILE_W = 180;
const TILE_H = 250;
const MARGIN = 10;

const STYLES: Record<GabaritShape["kind"], string> = {
  contour: 'stroke="#000" stroke-width="0.35" fill="none"',
  pli: 'stroke="#c00" stroke-width="0.25" stroke-dasharray="4 2" fill="none"',
  trace: 'stroke="#557" stroke-width="0.18" stroke-dasharray="1 1.5" fill="none"',
};

/** Pages HTML (une par feuille A4) d'un gabarit à l'échelle 1. */
export function gabaritPages(shapes: GabaritShape[], labels: GabaritLabel[] = [], title = "Gabarit"): string[] {
  const all = shapes.flatMap((s) => s.points);
  if (!all.length) return [];
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs) - MARGIN, Math.max(...xs) + MARGIN, Math.min(...ys) - MARGIN, Math.max(...ys) + MARGIN];
  const cols = Math.max(1, Math.ceil((maxX - minX) / TILE_W));
  const rows = Math.max(1, Math.ceil((maxY - minY) / TILE_H));
  // Coordonnées du dessin → SVG (Y vers le bas), origine en haut à gauche de l'ensemble.
  const tx = (x: number) => x - minX;
  const ty = (y: number) => maxY - y;

  const paths = shapes
    .map((s) => {
      const d = s.points.map(([x, y], i) => `${i ? "L" : "M"}${tx(x).toFixed(2)} ${ty(y).toFixed(2)}`).join(" ") + (s.closed ? " Z" : "");
      return `<path d="${d}" ${STYLES[s.kind]}/>`;
    })
    .join("");
  const texts = labels
    .map((l) => `<text x="${tx(l.at[0]).toFixed(2)}" y="${ty(l.at[1]).toFixed(2)}" font-size="3.5" font-family="Arial, sans-serif" text-anchor="middle">${esc(l.text)}</text>`)
    .join("");

  const pages: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const name = `${String.fromCharCode(65 + r)}${c + 1}`;
      const [x0, y0] = [c * TILE_W, r * TILE_H];
      // Repères d'assemblage aux quatre coins de la feuille.
      const cross = (x: number, y: number) => `<path d="M${x - 4} ${y}H${x + 4}M${x} ${y - 4}V${y + 4}" stroke="#000" stroke-width="0.2"/>`;
      const marks = [cross(x0, y0), cross(x0 + TILE_W, y0), cross(x0, y0 + TILE_H), cross(x0 + TILE_W, y0 + TILE_H)].join("");
      // Règle de contrôle de 100 mm sur la première feuille.
      const ruler =
        r === 0 && c === 0
          ? `<g transform="translate(${x0 + 6} ${y0 + TILE_H - 8})"><path d="M0 0H100M0 -2V2M50 -1.5V1.5M100 -2V2" stroke="#000" stroke-width="0.3"/><text x="50" y="-3" font-size="3" text-anchor="middle" font-family="Arial">100 mm (vérifier l'échelle)</text></g>`
          : "";
      pages.push(
        `<div class="section"><h2>${esc(title)} — feuille ${name} (${r + 1}/${rows} en hauteur, ${c + 1}/${cols} en largeur)</h2>` +
          `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}mm" height="${TILE_H}mm" viewBox="${x0} ${y0} ${TILE_W} ${TILE_H}" style="display:block;overflow:hidden">` +
          `<rect x="${x0}" y="${y0}" width="${TILE_W}" height="${TILE_H}" fill="none" stroke="#bbb" stroke-width="0.2" stroke-dasharray="2 2"/>` +
          paths +
          texts +
          marks +
          ruler +
          `<text x="${x0 + TILE_W - 4}" y="${y0 + 8}" font-size="6" font-weight="700" text-anchor="end" font-family="Arial">${name}</text>` +
          `</svg><p class="small">Imprimer à 100 % (taille réelle). Assembler les feuilles bord à bord sur les repères en croix.</p></div>`,
      );
    }
  }
  return pages;
}
