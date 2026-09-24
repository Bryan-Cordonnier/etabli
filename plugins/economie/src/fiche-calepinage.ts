// Fiche de calepinage à la cisaille (cahier des charges, section 9.4, maquette validée) :
// récapitulatif, pièces, réglages et ordre conseillé, puis une tôle par page avec son schéma
// coté et ses coupes numérotées, groupées par réglage de butée.
import type { FichePrint } from "@etabli/sdk";
import { groupPlates, type Chute, type CutOp, type PlatePlan, type SheetPlan, type ShearSettings } from "./cisaille";
import { box, esc, facts, fmt, hatch, mark, section, signature, table, tint } from "./fiche";
import { plateWeight } from "./matiere";

export interface CalepinageFicheInput {
  title: string;
  material: string;
  thickness: number;
  density: number;
  plan: PlatePlan;
  pieces: { mark: string; name: string; length: number; width: number; quantity: number; grain: boolean }[];
  colors: (index: number) => string;
  machine: string;
  settings: ShearSettings;
}

const kg = (value: number) => `${fmt(value, 1)} kg`;
const range = (value: number, grow: number) => (grow > 0 ? `${fmt(value, 0)}–${fmt(value + grow, 0)}` : fmt(value, 0));
const chuteText = (c: Chute) => `${range(c.length, c.grow[0])} × ${range(c.width, c.grow[1])}`;

/** Coupes voisines identiques (même passage, même butée, même morceau) : une seule ligne « 7 · 8 · 9 ». */
function mergeCuts(cuts: CutOp[]): CutOp[][] {
  const rows: CutOp[][] = [];
  for (const cut of cuts) {
    const last = rows[rows.length - 1];
    const previous = last?.[last.length - 1];
    if (last && previous && previous.stage === cut.stage && previous.stage !== 0 && Math.abs(previous.gauge - cut.gauge) < 1e-6 && previous.on === cut.on && !previous.rest) {
      last.push(cut);
    } else {
      rows.push([cut]);
    }
  }
  return rows;
}

function scheme(sheet: SheetPlan, input: CalepinageFicheInput, id: string): string {
  const W = 1000;
  const scale = W / sheet.length;
  const H = sheet.width * scale;
  const [ox, oy] = [30, 40];
  const X = (v: number) => (ox + v * scale).toFixed(1);
  const Y = (v: number) => (oy + v * scale).toFixed(1);
  const parts: string[] = [];

  parts.push(`<rect x="${ox}" y="${oy}" width="${W}" height="${H.toFixed(1)}" fill="url(#${id})" stroke="#15181d" stroke-width="1.4"/>`);
  const fontSize = Math.max(10, Math.min(15, H / 14));
  for (const p of sheet.pieces) {
    const [w, h] = [p.length * scale, p.width * scale];
    parts.push(`<rect x="${X(p.x)}" y="${Y(p.y)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${tint(input.colors(p.piece))}" stroke="#15181d"/>`);
    const grain = input.pieces[p.piece]?.grain;
    if (w > 28 && h > 16) {
      const label = w > 150 && h > 30 ? `${p.mark} ${fmt(p.length, 0)}×${fmt(p.width, 0)}${grain ? " →" : ""}` : p.mark;
      parts.push(
        `<text x="${X(p.x + p.length / 2)}" y="${(oy + (p.y + p.width / 2) * scale + fontSize / 3).toFixed(1)}" text-anchor="middle" font-family="Consolas, monospace" font-size="${fontSize.toFixed(1)}" font-weight="700">${esc(label)}</text>`,
      );
    }
  }
  for (const c of sheet.chutes.filter((c) => c.keep)) {
    const [w, h] = [c.length * scale, c.width * scale];
    parts.push(`<rect x="${(ox + c.x * scale + 1).toFixed(1)}" y="${(oy + c.y * scale + 1).toFixed(1)}" width="${Math.max(0, w - 2).toFixed(1)}" height="${Math.max(0, h - 2).toFixed(1)}" fill="#fff" stroke="#1f7a4f" stroke-width="2"/>`);
    const text = `à garder · ${chuteText(c)}`;
    if (w > 150 && h > 20) {
      parts.push(`<text x="${X(c.x + c.length / 2)}" y="${(oy + (c.y + c.width / 2) * scale + 4).toFixed(1)}" text-anchor="middle" font-family="Consolas, monospace" font-size="12" font-weight="700" fill="#1f7a4f">${esc(text)}</text>`);
    } else if (h > 150 && w > 20) {
      const [cx, cy] = [ox + (c.x + c.length / 2) * scale, oy + (c.y + c.width / 2) * scale];
      parts.push(`<text transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(-90)" y="4" text-anchor="middle" font-family="Consolas, monospace" font-size="12" font-weight="700" fill="#1f7a4f">${esc(text)}</text>`);
    }
  }

  // Traits de coupe : épais pour les bandes, fins pour les colonnes et les pièces, numérotés.
  for (const cut of sheet.cuts) {
    const [x1, y1, x2, y2] = cut.line;
    const major = cut.stage <= 1;
    const ext = major ? 12 / scale : 0;
    const vertical = Math.abs(x1 - x2) < 1e-6;
    const [ax, ay, bx, by] = vertical ? [x1, y1 - ext, x2, y2 + ext] : [x1 - ext, y1, x2 + ext, y2];
    parts.push(`<line x1="${X(ax)}" y1="${Y(ay)}" x2="${X(bx)}" y2="${Y(by)}" stroke="#15181d" stroke-width="${major ? 2.6 : 1.2}"/>`);
    const [bxp, byp] = vertical ? [ox + x1 * scale, oy + Math.min(y1, y2) * scale - (major ? 22 : -12)] : [ox + Math.min(x1, x2) * scale + (major ? -22 : 14), oy + y1 * scale];
    parts.push(
      major
        ? `<circle cx="${bxp.toFixed(1)}" cy="${byp.toFixed(1)}" r="10" fill="#15181d"/><text x="${bxp.toFixed(1)}" y="${(byp + 4).toFixed(1)}" text-anchor="middle" font-family="Consolas, monospace" font-size="11" font-weight="700" fill="#fff">${cut.n}</text>`
        : `<circle cx="${bxp.toFixed(1)}" cy="${byp.toFixed(1)}" r="9" fill="#fff" stroke="#15181d" stroke-width="1.4"/><text x="${bxp.toFixed(1)}" y="${(byp + 3.5).toFixed(1)}" text-anchor="middle" font-family="Consolas, monospace" font-size="10" font-weight="700">${cut.n}</text>`,
    );
  }

  // Cotes de la tôle et sens de laminage.
  const bottom = oy + H + 26;
  parts.push(
    `<g stroke="#4a525e" stroke-width="1" fill="none"><line x1="${ox}" y1="${bottom}" x2="${ox + W}" y2="${bottom}"/><line x1="${ox}" y1="${bottom - 6}" x2="${ox}" y2="${bottom + 6}"/><line x1="${ox + W}" y1="${bottom - 6}" x2="${ox + W}" y2="${bottom + 6}"/><line x1="${ox + W + 24}" y1="${oy}" x2="${ox + W + 24}" y2="${oy + H}"/><line x1="${ox + W + 18}" y1="${oy}" x2="${ox + W + 30}" y2="${oy}"/><line x1="${ox + W + 18}" y1="${oy + H}" x2="${ox + W + 30}" y2="${oy + H}"/></g>`,
    `<rect x="${ox + W / 2 - 60}" y="${bottom - 9}" width="120" height="18" fill="#fff"/><text x="${ox + W / 2}" y="${bottom + 4}" text-anchor="middle" font-family="Consolas, monospace" font-size="12" fill="#4a525e">${esc(sheet.source === "tole" ? `${fmt(sheet.nominal[0], 0)}${sheet.tol[1] ? ` (+${fmt(sheet.tol[1], 0)})` : ""}` : fmt(sheet.length, 0))}</text>`,
    `<text transform="translate(${ox + W + 42} ${(oy + H / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" font-family="Consolas, monospace" font-size="12" fill="#4a525e">${esc(sheet.source === "tole" ? `${fmt(sheet.nominal[1], 0)}${sheet.tol[1] ? ` (+${fmt(sheet.tol[1], 0)})` : ""}` : fmt(sheet.width, 0))}</text>`,
    `<text x="${ox}" y="${bottom + 24}" font-family="Arial, sans-serif" font-size="12" fill="#4a525e">→ sens de laminage${sheet.trim > 0 ? ` · dressage ${fmt(sheet.trim)} mm (coupe 0)` : ""}</text>`,
  );

  return `<svg class="scheme" viewBox="0 0 ${W + 70} ${(H + oy + 70).toFixed(0)}" role="img">${hatch(id)}${parts.join("")}</svg>`;
}

export function calepinageFiche(input: CalepinageFicheInput): FichePrint {
  const { plan, settings, thickness, density } = input;
  const weight = (area: number) => plateWeight(area, thickness, density);
  const groups = groupPlates(plan.sheets);
  const newSheets = plan.sheets.filter((s) => s.source === "tole");
  const offcuts = plan.sheets.filter((s) => s.source === "chute");
  const kept = plan.sheets.flatMap((s) => s.chutes.filter((c) => c.keep));
  const wasteArea = plan.sheetsArea - plan.piecesArea - plan.keptArea;
  const formats = [...new Set(newSheets.map((s) => `${fmt(s.nominal[0], 0)} × ${fmt(s.nominal[1], 0)}`))];

  let next = 1;
  const numbered = groups.map((g) => {
    const first = next;
    next += g.count;
    return { ...g, first, last: next - 1 };
  });
  const label = (g: (typeof numbered)[number]) =>
    `${g.sheet.source === "chute" ? "Chute" : "Tôle"} ${g.first}${g.count > 1 ? ` à ${g.last}` : ""}`;

  const pieceRows = input.pieces
    .map((p, index) => ({ ...p, index }))
    .filter((p) => p.length > 0 && p.width > 0 && p.quantity > 0)
    .map((p) => {
      const where = numbered.filter((g) => g.sheet.pieces.some((x) => x.piece === p.index)).map(label);
      return [
        mark(p.mark, input.colors(p.index)),
        esc(p.name),
        `<span class="num">${fmt(p.length)}</span>`,
        `<span class="num">${fmt(p.width)}</span>`,
        p.grain ? '<b>→ imposé</b>' : '<span class="lost">libre</span>',
        `<span class="num">${p.quantity}</span>`,
        esc(where.join(", ")),
        `<span class="num">${kg(weight(p.length * p.width))}</span>`,
        box,
      ];
    });

  const gaugeCount = (s: SheetPlan) => new Set(s.cuts.filter((c) => c.stage > 0).map((c) => c.gauge)).size;
  const page1 = [
    section(
      "À sortir du stock",
      facts([
        { label: "Tôles neuves", value: String(newSheets.length), detail: formats.join(", ") || "aucune" },
        { label: "Chutes du stock", value: String(offcuts.length), detail: offcuts.map((s) => `${fmt(s.length, 0)} × ${fmt(s.width, 0)}`).join(", ") || "aucune" },
        { label: "Chutes à garder", value: String(kept.length), detail: `${fmt(plan.keptArea / 1e6, 2)} m² · ${kg(weight(plan.keptArea))}` },
        { label: "Perte", value: kg(weight(wasteArea)), detail: `${fmt((wasteArea / Math.max(1, plan.sheetsArea)) * 100, 1)} % (dressage, bords)` },
      ]),
    ) +
      `<p class="small">Poids des tôles <b>${kg(weight(plan.sheetsArea))}</b> · poids des pièces <b>${kg(weight(plan.piecesArea))}</b> · ${esc(input.material)} ${fmt(thickness)} mm (${fmt(density, 2)} kg/dm³), poids approximatif.</p>`,
    plan.unplaced.length
      ? `<p class="tip">Pièces non placées : ${esc([...new Set(plan.unplaced.map((p) => `${p.mark} ${fmt(p.length)}×${fmt(p.width)}`))].join(", "))}.</p>`
      : "",
    section(
      "Pièces à obtenir",
      table(
        [
          { label: "Rep." },
          { label: "Désignation" },
          { label: "Longueur", right: true },
          { label: "Largeur", right: true },
          { label: "Sens" },
          { label: "Qté", right: true },
          { label: "Dans" },
          { label: "Poids", right: true },
          { label: "Compté", right: true },
        ],
        pieceRows,
      ) + '<p class="small">Poids à l\'unité. « Sens imposé » : la longueur de la pièce suit le sens de laminage, elle ne pivote pas.</p>',
    ),
    section(
      "Réglages",
      `<div class="settings">${input.machine ? `<span>Cisaille <b>${esc(input.machine)}</b></span>` : ""}${settings.bladeLength ? `<span>Longueur de lame <b>${fmt(settings.bladeLength, 0)} mm</b></span>` : ""}${settings.gaugeMax ? `<span>Butée arrière <b>0 – ${fmt(settings.gaugeMax, 0)} mm</b></span>` : ""}<span>Dressage <b>${fmt(settings.trim)} mm</b> (premier bord)</span><span>Chute gardée si <b>≥ ${fmt(Math.min(...settings.keep), 0)} × ${fmt(Math.max(...settings.keep), 0)}</b></span>${
        newSheets.length ? `<span>Tôles calculées sur <b>${esc([...new Set(newSheets.map((s) => `${fmt(s.length, 0)} × ${fmt(s.width, 0)}`))].join(", "))}</b></span>` : ""
      }</div>`,
    ),
    section(
      "Ordre conseillé",
      `<ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;font-size:12px"><li><b>Couper les bandes</b> (traits épais), puis <b>les recouper en pièces</b>.</li><li>Suivre les numéros : la butée se règle du plus grand au plus petit (${numbered
        .map((g) => `${esc(label(g))} : ${gaugeCount(g.sheet)} réglages`)
        .join(", ")}).</li><li>Toujours le <b>bord dressé ou déjà coupé contre la butée</b>. Marquer chaque pièce de son repère ; étiqueter les chutes à garder.</li></ol>`,
    ),
    signature,
  ].join("");

  const sheetPages = numbered.map((g, i) => {
    const sheet = g.sheet;
    const rows = mergeCuts(sheet.cuts).map((cuts) => {
      const first = cuts[0]!;
      const last = cuts[cuts.length - 1]!;
      const gives = cuts.flatMap((c) => c.gives);
      const givesHtml =
        first.stage === 0
          ? "Dressage"
          : gives
              .map((m) => {
                const piece = sheet.pieces.find((p) => p.mark === m);
                return piece ? mark(m, input.colors(piece.piece)) : `<span class="tag">${esc(m)}</span>`;
              })
              .join(" ");
      const rest = first.stage === 0 ? `<span class="lost">${fmt(sheet.trim)} mm → perte</span>` : last.rest ? `<span class="${last.rest.keep ? "keep" : "lost"}">${esc(chuteText(last.rest))} → ${last.rest.keep ? "à garder" : "perte"}</span>` : "";
      const flags = cuts.some((c) => c.overGauge) ? ' <span class="reserve">tracer (hors butée)</span>' : cuts.some((c) => c.overBlade) ? ' <span class="reserve">trop long pour la lame</span>' : "";
      return {
        group: first.stage !== 0,
        cells: [
          `<span class="num">${cuts.map((c) => c.n).join(" · ")}</span>`,
          `<b class="num">${first.stage === 0 ? "—" : fmt(first.gauge)}</b>${flags}`,
          esc(first.on),
          givesHtml,
          rest,
          box,
        ],
      };
    });
    // Trait plus épais à chaque changement de réglage de butée.
    const body = rows
      .map((row, r) => {
        const changed = r > 0 && row.cells[1] !== rows[r - 1]!.cells[1];
        return `<tr${changed ? ' class="group"' : ""}>${row.cells.map((c, ci) => `<td${ci === 1 || ci === 5 ? ' class="r"' : ""}>${c}</td>`).join("")}</tr>`;
      })
      .join("");
    const gauges = [...new Set(sheet.cuts.filter((c) => c.stage > 0).map((c) => fmt(c.gauge)))];
    const keptHere = sheet.chutes.filter((c) => c.keep);
    const w = weight(sheet.nominal[0] * sheet.nominal[1]);
    return `<article class="block">
      <div class="block-head"><h3>${esc(label(g))}</h3><span class="tag">${sheet.source === "chute" ? "stock" : "neuve"}</span>${g.count > 1 ? `<span class="tag">× ${g.count} identiques</span>` : ""}<span class="len">${fmt(sheet.nominal[0], 0)} × ${fmt(sheet.nominal[1], 0)} × ${fmt(thickness)}${sheet.tol[1] || sheet.tol[0] ? ` (−${fmt(sheet.tol[0])} / +${fmt(sheet.tol[1])})` : ""} · ${kg(w)}</span></div>
      ${scheme(sheet, input, `h${i}`)}
      <div class="legend"><span>━ coupe de bande (1er passage)</span><span>─ coupe de pièce</span><span>▨ perte</span><span>▭ vert : chute à garder</span><span>→ sens imposé</span></div>
      <table><thead><tr><th>N°</th><th class="r">Butée</th><th>Couper</th><th>Donne</th><th>Reste</th><th class="r">Fait</th></tr></thead><tbody>${body}</tbody></table>
      <div class="tip">Butée réglée ${gauges.length} fois : ${esc(gauges.join(" → "))}. Toujours le bord déjà coupé contre la butée.</div>
      <div class="end"><span>Chutes :</span>${
        keptHere.length ? `<b class="keep">${esc(keptHere.map(chuteText).join(", "))} → à garder</b><span class="hint">Étiqueter « ${esc(input.material)} ${fmt(thickness)} mm — dimensions » avant de ranger.</span>` : '<span class="lost">aucune à garder</span>'
      }</div>
    </article>`;
  });

  const cutCount = plan.sheets.reduce((n, s) => n + s.cuts.filter((c) => c.stage > 0).length, 0);
  const parts = [newSheets.length ? `${newSheets.length} tôle${newSheets.length > 1 ? "s" : ""}` : "", offcuts.length ? `${offcuts.length} chute${offcuts.length > 1 ? "s" : ""}` : ""].filter(Boolean);
  return {
    kind: "Fiche de calepinage",
    title: input.title,
    subtitle: `Tôle ${input.material.toLowerCase()} — ép. ${fmt(thickness)} mm — ${parts.join(" + ") || "aucune tôle"}, ${cutCount} coupes`,
    ident: input.machine ? [["Poste", input.machine]] : [],
    pages: [page1, ...sheetPages],
  };
}
