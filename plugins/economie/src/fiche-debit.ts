// Fiche de coupe du débit de tubes (cahier des charges, section 9.3) : ce qu'il faut sortir du
// stock, les pièces à obtenir, les réglages, puis la découpe barre par barre avec cases à cocher.
// Première version : coupes droites. Les angles, l'ordre par angle de scie et les tolérances
// arrivent avec le débit v2.
import type { FichePrint } from "@etabli/sdk";
import { groupBars, type BarPlan, type CutPlan } from "./debit";
import { box, esc, facts, fmt, hatch, mark, section, signature, table, tint } from "./fiche";

export interface DebitFicheInput {
  title: string;
  profile: string;
  plan: CutPlan;
  /** Pièces saisies, dans l'ordre de la liste (l'indice donne la couleur). */
  pieces: { mark: string; length: number; quantity: number }[];
  colors: (index: number) => string;
  settings: { kerf: number; trim: number; keepMin: number };
  machine: string;
}

function scheme(bar: BarPlan, input: DebitFicheInput, id: string): string {
  const scale = 1000 / bar.length;
  let pos = bar.source === "barre" ? input.settings.trim : 0;
  const parts = bar.cuts.map((cut) => {
    const x = pos * scale;
    const w = Math.max(1, cut.length * scale);
    pos += cut.length + input.settings.kerf;
    const color = input.colors(cut.piece);
    const label = w > 70 ? `${cut.mark} ${fmt(cut.length, 0)}` : w > 18 ? cut.mark : "";
    return `<rect x="${x.toFixed(1)}" y="10" width="${w.toFixed(1)}" height="32" fill="${tint(color)}" stroke="#15181d" stroke-width="1.2"/>${
      label ? `<text x="${(x + w / 2).toFixed(1)}" y="31" text-anchor="middle" font-family="Consolas, monospace" font-size="12" font-weight="700">${esc(label)}</text>` : ""
    }`;
  });
  const rest = bar.remnant * scale;
  const keep = bar.reusable
    ? `<rect x="${(1000 - rest).toFixed(1)}" y="10" width="${rest.toFixed(1)}" height="32" fill="#fff" stroke="#1f7a4f" stroke-width="2"/>${
        rest > 80 ? `<text x="${(1000 - rest / 2).toFixed(1)}" y="31" text-anchor="middle" font-family="Consolas, monospace" font-size="11" font-weight="700" fill="#1f7a4f">à garder ${fmt(bar.remnant, 0)}</text>` : ""
      }`
    : "";
  return `<svg class="scheme" viewBox="0 0 1000 60" role="img">${hatch(id)}<rect x="0" y="10" width="1000" height="32" fill="url(#${id})" stroke="#15181d" stroke-width="1.2"/>${parts.join("")}${keep}<text x="2" y="57" font-family="Consolas, monospace" font-size="10" fill="#4a525e">0</text><text x="998" y="57" text-anchor="end" font-family="Consolas, monospace" font-size="10" fill="#4a525e">${fmt(bar.length, 0)}</text></svg>`;
}

export function debitFiche(input: DebitFicheInput): FichePrint {
  const { plan, settings } = input;
  const groups = groupBars(plan.bars);
  const newBars = plan.bars.filter((b) => b.source === "barre");
  const offcuts = plan.bars.filter((b) => b.source === "chute");
  const kept = plan.bars.filter((b) => b.reusable);
  const lengths = [...new Set(newBars.map((b) => b.length))].map(
    (length) => `${newBars.filter((b) => b.length === length).length} × ${fmt(length, 0)}`,
  );

  // Numéro de barre sur la fiche : les barres identiques d'un groupe se suivent.
  let next = 1;
  const numbered = groups.map((g) => {
    const first = next;
    next += g.count;
    return { ...g, first, last: next - 1 };
  });
  const barLabel = (g: (typeof numbered)[number]) =>
    `${g.bar.source === "chute" ? "Chute" : "Barre"} ${g.first}${g.count > 1 ? ` à ${g.last}` : ""}`;

  const pieceRows = input.pieces
    .map((p, index) => ({ ...p, index }))
    .filter((p) => p.length > 0 && p.quantity > 0)
    .map((p) => {
      const where = numbered.filter((g) => g.bar.cuts.some((c) => c.piece === p.index)).map((g) => (g.count > 1 ? `${g.first}–${g.last}` : `${g.first}`));
      return [mark(p.mark, input.colors(p.index)), `<span class="num">${fmt(p.length)}</span>`, `<span class="num">${p.quantity}</span>`, esc(where.join(", ")), box];
    });

  const page1 = [
    section(
      "À sortir du stock",
      facts([
        { label: "Barres neuves", value: String(newBars.length), detail: lengths.join(" + ") || "aucune" },
        { label: "Chutes du stock", value: String(offcuts.length), detail: offcuts.map((b) => fmt(b.length, 0)).join(", ") || "aucune" },
        { label: "Chutes à garder", value: String(kept.length), detail: kept.map((b) => fmt(b.remnant, 0)).join(", ") || "aucune" },
        { label: "Perte", value: `${fmt(plan.waste, 0)} mm`, detail: "traits de scie, dressage, restes courts" },
      ]),
    ),
    plan.unplaced.length
      ? `<p class="tip">Pièces non placées : ${esc(plan.unplaced.map((c) => `${c.mark} ${fmt(c.length)}`).join(", "))}.</p>`
      : "",
    section(
      "Pièces à obtenir",
      table(
        [{ label: "Rep." }, { label: "Longueur", right: true }, { label: "Qté", right: true }, { label: "Barres" }, { label: "Compté", right: true }],
        pieceRows,
      ) + '<p class="small">Longueurs en mm.</p>',
    ),
    section(
      "Réglages",
      `<div class="settings">${input.machine ? `<span>Machine <b>${esc(input.machine)}</b></span>` : ""}<span>Trait de scie <b>${fmt(settings.kerf)} mm</b></span><span>Dressage en bout <b>${fmt(settings.trim)} mm</b></span><span>Chute gardée dès <b>${fmt(settings.keepMin, 0)} mm</b></span></div>`,
    ),
    signature,
  ].join("");

  const blocks = numbered.map((g, i) => {
    const rows: string[][] = [];
    if (g.bar.source === "barre" && settings.trim > 0) {
      rows.push(['<span class="num">0</span>', "—", `<span class="num">${fmt(settings.trim)}</span>`, "Dresser le bout de barre", box]);
    }
    g.bar.cuts.forEach((cut, j) => {
      rows.push([`<span class="num">${j + 1}</span>`, mark(cut.mark, input.colors(cut.piece)), `<span class="num">${fmt(cut.length)}</span>`, "", box]);
    });
    return `<article class="block">
      <div class="block-head"><h3>${esc(barLabel(g))}</h3><span class="tag">${g.bar.source === "chute" ? "stock" : "neuve"}</span>${
        g.count > 1 ? `<span class="tag">× ${g.count} identiques</span>` : ""
      }<span class="len">${fmt(g.bar.length, 0)} mm</span></div>
      ${scheme(g.bar, input, `h${i}`)}
      ${table([{ label: "N°" }, { label: "Rep." }, { label: "Mesurer", right: true }, { label: "Remarque" }, { label: "Fait", right: true }], rows)}
      <div class="end"><span>Reste :</span><b class="num ${g.bar.reusable ? "keep" : ""}">${fmt(g.bar.remnant, 0)} mm</b><span class="${g.bar.reusable ? "keep" : "lost"}">→ ${
        g.bar.reusable ? "à garder" : "perte"
      }</span>${g.bar.reusable ? `<span class="hint">Étiqueter « ${esc(input.profile)} — ${fmt(g.bar.remnant, 0)} » avant de ranger.</span>` : ""}</div>
    </article>`;
  });

  const cuts = plan.bars.reduce((n, b) => n + b.cuts.length, 0);
  return {
    kind: "Fiche de coupe",
    title: input.title,
    subtitle: `${input.profile} — ${plan.bars.length} barre${plan.bars.length > 1 ? "s" : ""}, ${cuts} coupe${cuts > 1 ? "s" : ""}`,
    ident: input.machine ? [["Poste", input.machine]] : [],
    pages: [page1, `<div class="section"><h2>Découpe barre par barre</h2><div class="legend"><span>▭ pièce</span><span>▨ perte (dressage, trait de scie)</span><span>▭ vert : chute à garder</span></div></div>${blocks.join("")}`],
  };
}
