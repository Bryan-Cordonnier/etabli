// Export DXF (cahier des charges des plugins, section 3 : « export DXF ») : dessin en millimètres,
// à l'échelle 1, un calque par nature de trait. Format R12 (AC1009), le plus simple et le plus
// largement lu : SolidWorks, logiciels de découpe plasma et laser, DraftSight, LibreCAD.

export type DxfLayer = "CONTOUR" | "PLI" | "TRACE" | "TEXTE";

/** Couleurs AutoCAD : 7 blanc/noir, 1 rouge, 4 cyan, 3 vert. */
const LAYER_COLORS: Record<DxfLayer, number> = { CONTOUR: 7, PLI: 1, TRACE: 4, TEXTE: 3 };

export interface DxfDrawing {
  /** Contours et courbes, en mm, Y vers le haut. */
  polylines?: { points: [number, number][]; closed?: boolean; layer: DxfLayer }[];
  lines?: { from: [number, number]; to: [number, number]; layer: DxfLayer }[];
  texts?: { at: [number, number]; text: string; height: number; layer?: DxfLayer }[];
}

const n = (v: number) => (Math.abs(v) < 1e-9 ? "0" : v.toFixed(4).replace(/\.?0+$/, ""));

/** Texte DXF : une paire code / valeur par ligne. */
export function toDxf(drawing: DxfDrawing): string {
  const out: string[] = [];
  const pair = (code: number, value: string | number) => out.push(String(code), typeof value === "number" ? n(value) : value);

  const used = new Set<DxfLayer>([
    ...(drawing.polylines ?? []).map((p) => p.layer),
    ...(drawing.lines ?? []).map((l) => l.layer),
    ...(drawing.texts ?? []).map((t) => t.layer ?? "TEXTE"),
  ]);

  pair(0, "SECTION");
  pair(2, "HEADER");
  pair(9, "$ACADVER");
  pair(1, "AC1009");
  pair(9, "$INSUNITS");
  pair(70, "4"); // millimètres
  pair(0, "ENDSEC");

  pair(0, "SECTION");
  pair(2, "TABLES");
  pair(0, "TABLE");
  pair(2, "LTYPE");
  pair(70, "1");
  pair(0, "LTYPE");
  pair(2, "CONTINUOUS");
  pair(70, "0");
  pair(3, "Trait continu");
  pair(72, "65");
  pair(73, "0");
  pair(40, "0.0");
  pair(0, "ENDTAB");
  pair(0, "TABLE");
  pair(2, "LAYER");
  pair(70, String(used.size));
  for (const layer of used) {
    pair(0, "LAYER");
    pair(2, layer);
    pair(70, "0");
    pair(62, String(LAYER_COLORS[layer]));
    pair(6, "CONTINUOUS");
  }
  pair(0, "ENDTAB");
  pair(0, "ENDSEC");

  pair(0, "SECTION");
  pair(2, "ENTITIES");
  for (const poly of drawing.polylines ?? []) {
    if (poly.points.length < 2) continue;
    pair(0, "POLYLINE");
    pair(8, poly.layer);
    pair(66, "1");
    pair(10, 0);
    pair(20, 0);
    pair(30, 0);
    pair(70, poly.closed ? "1" : "0");
    for (const [x, y] of poly.points) {
      pair(0, "VERTEX");
      pair(8, poly.layer);
      pair(10, x);
      pair(20, y);
      pair(30, 0);
    }
    pair(0, "SEQEND");
    pair(8, poly.layer);
  }
  for (const line of drawing.lines ?? []) {
    pair(0, "LINE");
    pair(8, line.layer);
    pair(10, line.from[0]);
    pair(20, line.from[1]);
    pair(30, 0);
    pair(11, line.to[0]);
    pair(21, line.to[1]);
    pair(31, 0);
  }
  for (const text of drawing.texts ?? []) {
    pair(0, "TEXT");
    pair(8, text.layer ?? "TEXTE");
    pair(10, text.at[0]);
    pair(20, text.at[1]);
    pair(30, 0);
    pair(40, text.height);
    // DXF R12 : texte sur une ligne, sans accents mal gérés par certains logiciels de découpe.
    pair(1, text.text.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[\r\n]/g, " "));
  }
  pair(0, "ENDSEC");
  pair(0, "EOF");
  return out.join("\r\n") + "\r\n";
}
