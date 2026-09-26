// Sorties communes des mini-apps de traçage : DXF pour la découpe, fiche avec tableau de traçage
// et gabarit papier à l'échelle 1, tableau copiable vers Excel.
import type { FichePrint } from "@etabli/sdk";
import { esc, facts, fmt, gabaritPages, section, table, toDxf, type DxfDrawing, type GabaritShape } from "@etabli/ui";
import type { FlatPattern, Point, TraceRow } from "./developpes";

export const MATIERES = [
  { id: "acier", label: "Acier", density: 7.85 },
  { id: "inox", label: "Inox", density: 7.93 },
  { id: "alu", label: "Aluminium", density: 2.7 },
  { id: "cuivre", label: "Cuivre", density: 8.96 },
];

/** Masse en kg d'une tôle : surface en mm², épaisseur en mm, masse volumique en kg/dm³. */
export const plateMass = (area: number, thickness: number, density: number) => (area * thickness * density) / 1e6;

/** Déplace le dessin pour que son coin bas gauche soit à l'origine (plus simple à placer en découpe). */
function origin(pattern: FlatPattern): (p: Point) => Point {
  const xs = pattern.contour.map((p) => p[0]);
  const ys = pattern.contour.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  return ([x, y]) => [x - x0, y - y0];
}

export function patternDxf(pattern: FlatPattern, extra: { contours?: Point[][]; texts?: { at: Point; text: string }[] } = {}): string {
  const move = origin(pattern);
  const drawing: DxfDrawing = {
    polylines: [
      { points: pattern.contour.map(move), closed: true, layer: "CONTOUR" },
      ...(extra.contours ?? []).map((points) => ({ points: points.map(move), closed: true, layer: "CONTOUR" as const })),
    ],
    lines: pattern.lines.map((l) => ({ from: move(l.from), to: move(l.to), layer: l.kind === "pli" ? ("PLI" as const) : ("TRACE" as const) })),
    texts: [...pattern.labels, ...(extra.texts ?? [])].map((l) => ({ at: move(l.at), text: l.text, height: 4 })),
  };
  return toDxf(drawing);
}

export function patternShapes(pattern: FlatPattern): GabaritShape[] {
  return [
    { points: pattern.contour, closed: true, kind: "contour" },
    ...pattern.lines.map((l) => ({ points: [l.from, l.to], kind: l.kind })),
  ];
}

/** Tableau de traçage copiable : une ligne par génératrice. */
export function tableText(rows: TraceRow[], headers: [string, string, string, string]): string {
  return [headers.join("\t"), ...rows.map((r) => [r.n, fmt(r.angle, 2), fmt(r.x, 2), fmt(r.y, 2)].join("\t"))].join("\n");
}

/** Fiche de traçage : résultats, tableau, puis le gabarit à l'échelle 1 découpé en feuilles A4. */
export function tracageFiche(input: {
  kind: string;
  subtitle: string;
  results: { label: string; value: string; detail?: string }[];
  rows?: TraceRow[];
  headers?: [string, string, string, string];
  pattern: FlatPattern;
  extraShapes?: GabaritShape[];
  note?: string;
  /** Tableau d'une autre forme (vraies grandeurs d'une trémie…), à la place du tableau de traçage. */
  customTable?: { title: string; headers: string[]; rows: string[][] };
}): FichePrint {
  const tableHtml = input.customTable
    ? section(
        input.customTable.title,
        table(
          input.customTable.headers.map((label, i) => ({ label, right: i > 0 })),
          input.customTable.rows.map((row) => row.map((c, i) => (i ? `<span class="num">${esc(c)}</span>` : esc(c)))),
        ),
      )
    : input.rows?.length
    ? section(
        "Tableau de traçage",
        table(
          (input.headers ?? ["N°", "Angle (°)", "X (mm)", "Y (mm)"]).map((label, i) => ({ label, right: i > 0 })),
          input.rows.map((r) => [String(r.n), fmt(r.angle, 1), fmt(r.x, 1), fmt(r.y, 1)].map((c, i) => (i ? `<span class="num">${c}</span>` : c))),
        ),
      )
    : "";
  const facts4 = [];
  for (let i = 0; i < input.results.length; i += 4) facts4.push(facts(input.results.slice(i, i + 4)));
  const page1 =
    section("Résultats", facts4.join("")) +
    (input.note ? `<p class="small">${esc(input.note)}</p>` : "") +
    tableHtml +
    '<p class="small">Dimensions en mm, à la fibre moyenne. Le gabarit à l\'échelle 1 suit sur les pages suivantes ; le fichier DXF est disponible depuis la mini-app.</p>';
  return {
    kind: `Fiche de traçage — ${input.kind}`,
    title: "",
    subtitle: input.subtitle,
    ident: [],
    pages: [page1, ...gabaritPages([...patternShapes(input.pattern), ...(input.extraShapes ?? [])], input.pattern.labels, `Gabarit ${input.kind.toLowerCase()}`)],
  };
}
