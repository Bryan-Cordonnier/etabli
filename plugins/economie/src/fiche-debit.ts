// Fiche de coupe du débit de tubes (cahier des charges, section 9.3, maquette validée) : ce qu'il
// faut sortir du stock ou acheter, les pièces à obtenir, les réglages, l'ordre conseillé (groupé par
// angle de scie), puis la découpe barre par barre avec cases à cocher et restes en plage.
import type { FichePrint } from "@etabli/sdk";
import { groupBars, type BarPlan, type CutPlan } from "./debit";
import { box, esc, facts, fmt, hatch, mark, section, signature, table, tint } from "@etabli/ui";
import { barOps, placedAngles, sawOrder, type SawOp } from "./ordre";

export interface DebitFicheInput {
  title: string;
  profile: string;
  plan: CutPlan;
  /** Pièces saisies, dans l'ordre de la liste (l'indice donne la couleur). */
  pieces: { mark: string; length: number; quantity: number; angleL?: number; angleR?: number; reserved?: boolean; dest?: string }[];
  colors: (index: number) => string;
  settings: { kerf: number; trim: number; keepMin: number };
  machine: string;
  /** Course de la butée de longueur de la scie ; null ou absent : on mesure au mètre. */
  stopMax?: number | null;
  /** Matière et poids au mètre du profilé, si connus. */
  material?: string;
  kgPerM?: number;
  /** Barres neuves à acheter (quantité non limitée) plutôt qu'à sortir du stock. */
  isPurchase?: (nominal: number) => boolean;
  priority?: "matiere" | "temps";
}

const angleText = (angle: number | undefined) => (angle && angle > 0 ? `${fmt(angle)}°` : "0°");
const range = (value: number, grow: number) => (grow > 0.05 ? `${fmt(value, 0)} à ${fmt(value + grow, 0)}` : fmt(value, 0));

function scheme(bar: BarPlan, input: DebitFicheInput, id: string): string {
  const scale = 1000 / bar.length;
  const parts = bar.cuts.map((cut) => {
    const x = (v: number) => (v * scale).toFixed(1);
    const end = cut.start + cut.length;
    const points = [
      `${x(cut.start + cut.draw.left[0])},10`,
      `${x(end - cut.draw.right[0])},10`,
      `${x(end - cut.draw.right[1])},42`,
      `${x(cut.start + cut.draw.left[1])},42`,
    ].join(" ");
    const reserved = input.pieces[cut.piece]?.reserved;
    const w = cut.length * scale;
    const label = w > 70 ? `${cut.mark} ${fmt(cut.length, 0)}` : w > 18 ? cut.mark : "";
    return `<polygon points="${points}" fill="${reserved ? "#fff4d6" : tint(input.colors(cut.piece))}" stroke="${reserved ? "#9a5b00" : "#15181d"}" stroke-width="${reserved ? 1.6 : 1.2}"${reserved ? ' stroke-dasharray="5 3"' : ""}/>${
      label
        ? `<text x="${((cut.start + cut.length / 2) * scale).toFixed(1)}" y="31" text-anchor="middle" font-family="Consolas, monospace" font-size="12" font-weight="700"${reserved ? ' fill="#9a5b00"' : ""}>${esc(label)}</text>`
        : ""
    }`;
  });
  const rest = bar.remnant * scale;
  const keep = bar.reusable
    ? `<rect x="${(1000 - rest).toFixed(1)}" y="10" width="${rest.toFixed(1)}" height="32" fill="#fff" stroke="#1f7a4f" stroke-width="2"/>${
        rest > 90 ? `<text x="${(1000 - rest / 2).toFixed(1)}" y="31" text-anchor="middle" font-family="Consolas, monospace" font-size="11" font-weight="700" fill="#1f7a4f">à garder ${fmt(bar.remnant, 0)}</text>` : ""
      }`
    : "";
  return `<svg class="scheme" viewBox="0 0 1000 60" role="img">${hatch(id)}<rect x="0" y="10" width="1000" height="32" fill="url(#${id})" stroke="#15181d" stroke-width="1.2"/>${parts.join("")}${keep}<text x="2" y="57" font-family="Consolas, monospace" font-size="10" fill="#4a525e">0</text><text x="998" y="57" text-anchor="end" font-family="Consolas, monospace" font-size="10" fill="#4a525e">${fmt(bar.nominal, 0)}</text></svg>`;
}

/** Numéro affiché d'une coupe : 0 pour le dressage ou la coupe de bout, puis 1, 2, 3… */
const numberOf = (ops: SawOp[], index: number) => (ops[0] && ops[0].kind !== "piece" && ops[0].kind !== "recoupe" ? index : index + 1);

export function debitFiche(input: DebitFicheInput): FichePrint {
  const { plan, settings } = input;
  const angles = (piece: number): [number, number] => [input.pieces[piece]?.angleL ?? 0, input.pieces[piece]?.angleR ?? 0];
  const kg = (lengthMm: number) => (input.kgPerM ? ` · ${fmt((lengthMm / 1000) * input.kgPerM, 1)} kg` : "");
  const groups = groupBars(plan.bars);
  const newBars = plan.bars.filter((b) => b.source === "barre");
  const offcuts = plan.bars.filter((b) => b.source === "chute");
  const kept = plan.bars.filter((b) => b.reusable);
  const toBuy = newBars.filter((b) => input.isPurchase?.(b.nominal));
  const fromStock = newBars.filter((b) => !input.isPurchase?.(b.nominal));
  const byLength = (bars: BarPlan[]) =>
    [...new Set(bars.map((b) => b.nominal))].map((length) => `${bars.filter((b) => b.nominal === length).length} × ${fmt(length, 0)}`).join(" + ");
  const wasteGrow = plan.bars.filter((b) => !b.reusable).reduce((sum, b) => sum + b.grow, 0);

  // Numéro de barre sur la fiche : les barres identiques d'un groupe se suivent.
  let next = 1;
  const numbered = groups.map((g) => {
    const first = next;
    next += g.count;
    return { ...g, first, last: next - 1, ops: barOps(g.bar, angles, settings.trim) };
  });
  const barLabel = (g: (typeof numbered)[number], lower = false) => {
    const word = g.bar.source === "chute" ? (g.count > 1 ? "chutes" : "chute") : g.count > 1 ? "barres" : "barre";
    const text = `${word} ${g.first}${g.count > 1 ? ` à ${g.last}` : ""}`;
    return lower ? text : text[0]!.toUpperCase() + text.slice(1);
  };

  // ——— Page 1 ———
  const pieceRows = input.pieces
    .map((p, index) => ({ ...p, index }))
    .filter((p) => p.length > 0 && p.quantity > 0)
    .map((p) => {
      const where = numbered.filter((g) => g.bar.cuts.some((c) => c.piece === p.index)).map((g) => (g.count > 1 ? `${g.first}–${g.last}` : `${g.first}`));
      return [
        mark(p.mark, p.reserved ? "#d9a300" : input.colors(p.index)),
        p.reserved ? `<span class="reserve">Chute réservée${p.dest ? ` — ${esc(p.dest)}` : ""}</span>` : "",
        `<span class="num">${fmt(p.length)}</span>`,
        `<span class="num">${angleText(p.angleL)}</span>`,
        `<span class="num">${angleText(p.angleR)}</span>`,
        `<span class="num">${p.quantity}</span>`,
        esc(where.join(", ")),
        box,
      ];
    });

  const order = sawOrder(numbered.map((g) => g.ops));
  const orderList = order
    .map((step) => {
      const parts = step.bars.map(({ bar, from, to }) => {
        const g = numbered[bar]!;
        const [a, b] = [numberOf(g.ops, from), numberOf(g.ops, to)];
        const whole = from === 0 && to === g.ops.length - 1;
        return `${barLabel(g, true)}${whole ? " entière" : a === b ? ` (coupe ${a})` : ` (coupes ${a} à ${b})`}`;
      });
      return `<li><b>Scie à ${angleText(step.angle)}</b> : ${esc(parts.join(", "))}.</li>`;
    })
    .join("");
  const settingsCount = new Set(order.map((s) => s.angle)).size;
  const tolerances = [...new Set(newBars.filter((b) => b.grow > 0).map((b) => `${fmt(b.length, 0)} (longueur commerciale ${fmt(b.nominal, 0)})`))];

  const page1 = [
    section(
      "À sortir du stock",
      facts([
        { label: toBuy.length && !fromStock.length ? "Barres à acheter" : "Barres neuves", value: String(newBars.length), detail: byLength(newBars) || "aucune" },
        { label: "Chutes du stock", value: String(offcuts.length), detail: offcuts.map((b) => fmt(b.nominal, 0)).join(", ") || "aucune" },
        { label: "Chutes à garder", value: String(kept.length), detail: kept.map((b) => range(b.remnant, b.grow)).join(" ; ") || "aucune" },
        { label: "Perte", value: `${range(plan.waste, wasteGrow)} mm`, detail: "traits de scie, dressage, coins d'angle, restes courts" },
      ]),
    ) +
      (toBuy.length && fromStock.length ? `<p class="small">Dont <b>à acheter : ${esc(byLength(toBuy))}</b> ; en stock : ${esc(byLength(fromStock))}.</p>` : "") +
      (input.kgPerM
        ? `<p class="small">${esc(input.material ?? "")} · ${fmt(input.kgPerM, 3)} kg/m · barres ${fmt((newBars.reduce((s, b) => s + b.nominal, 0) / 1000) * input.kgPerM, 1)} kg · pièces ${fmt((plan.piecesLength / 1000) * input.kgPerM, 1)} kg (poids approximatif).</p>`
        : ""),
    plan.unplaced.length ? `<p class="tip">Pièces non placées : ${esc(plan.unplaced.map((c) => `${c.mark} ${fmt(c.length)}`).join(", "))}.</p>` : "",
    section(
      "Pièces à obtenir",
      table(
        [
          { label: "Rep." },
          { label: "Désignation" },
          { label: "Longueur", right: true },
          { label: "Angle G", right: true },
          { label: "Angle D", right: true },
          { label: "Qté", right: true },
          { label: "Barres" },
          { label: "Compté", right: true },
        ],
        pieceRows,
      ) + '<p class="small">Longueurs en mm, <b>pointe à pointe</b> (côté le plus long). Angle mesuré depuis la coupe d\'équerre : 0° = droit.</p>',
    ),
    section(
      "Réglages",
      `<div class="settings">${input.machine ? `<span>Scie <b>${esc(input.machine)}</b></span>` : ""}<span>Trait de scie <b>${fmt(settings.kerf)} mm</b></span><span>Dressage en bout <b>${fmt(settings.trim)} mm</b></span><span>Chute gardée dès <b>${fmt(settings.keepMin, 0)} mm</b></span>${
        input.stopMax ? `<span>Butée <b>jusqu'à ${fmt(input.stopMax, 0)} mm</b></span>` : ""
      }${tolerances.length ? `<span>Barres calculées sur <b>${esc(tolerances.join(", "))}</b></span>` : ""}<span>Priorité <b>${input.priority === "temps" ? "temps (réglages)" : "matière"}</b></span></div>`,
    ),
    section(
      "Ordre conseillé",
      `<ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;font-size:12px">${orderList}<li>Marquer chaque pièce de son repère au feutre dès la coupe ; étiqueter les chutes réservées et les chutes à garder.</li></ol><p class="small">${settingsCount} réglage${settingsCount > 1 ? "s" : ""} d'angle de scie pour toute la fiche.</p>`,
    ),
    signature,
  ].join("");

  // ——— Barre par barre ———
  const blocks = numbered.map((g, i) => {
    const rows = g.ops.map((op, k) => {
      const n = `<span class="num">${numberOf(g.ops, k)}</span>`;
      const angle = `<span class="num">${angleText(op.angle)}</span>`;
      if (op.kind === "dressage") return [n, "—", angle, `<span class="num">${fmt(settings.trim)}</span>`, "Dresser le bout de barre", box];
      if (op.kind === "bout") return [n, "—", angle, "—", "Première coupe d'angle en bout de barre (perte)", box];
      if (op.kind === "recoupe") return [n, "—", angle, "—", `Recouper ${op.angle > 0 ? `à ${angleText(op.angle)}` : "d'équerre"} avant la pièce suivante`, box];
      const cut = g.bar.cuts[op.cut!]!;
      const piece = input.pieces[cut.piece];
      const [left] = placedAngles(cut, angles);
      const notes: string[] = [];
      if (op.flip) notes.push('<span class="reserve">⟲ retourner le tube</span>');
      if (op.shared) notes.push("coupe partagée avec la précédente");
      if (left !== op.angle && left > 0 && !op.shared) notes.push(`bout gauche à ${angleText(left)}`);
      if (piece?.reserved) notes.push(`<span class="reserve">chute réservée${piece.dest ? ` → ${esc(piece.dest)}` : ""} : étiqueter</span>`);
      const stop = input.stopMax && cut.length <= input.stopMax;
      return [
        n,
        mark(cut.mark, piece?.reserved ? "#d9a300" : input.colors(cut.piece)),
        angle,
        `<span class="num">${fmt(cut.length)}</span>${stop ? ' <span class="tag">butée</span>' : ""}`,
        notes.join(" · "),
        box,
      ];
    });
    const tol = g.bar.grow > 0 ? ` (−${fmt(g.bar.nominal - g.bar.length)} / +${fmt(g.bar.grow - (g.bar.nominal - g.bar.length))})` : "";
    const buy = g.bar.source === "barre" && input.isPurchase?.(g.bar.nominal);
    return `<article class="block">
      <div class="block-head"><h3>${esc(barLabel(g))}</h3><span class="tag">${g.bar.source === "chute" ? "stock" : buy ? "à acheter" : "neuve"}</span>${
        g.count > 1 ? `<span class="tag">× ${g.count} identiques</span>` : ""
      }<span class="len">${fmt(g.bar.nominal, 0)} mm${tol}${kg(g.bar.nominal)}</span></div>
      ${scheme(g.bar, input, `h${i}`)}
      ${table(
        [{ label: "N°" }, { label: "Rep." }, { label: "Angle scie", right: true }, { label: "Mesurer", right: true }, { label: "Remarque" }, { label: "Fait", right: true }],
        rows,
      )}
      <div class="end"><span>Reste :</span><b class="num ${g.bar.reusable ? "keep" : ""}">${range(g.bar.remnant, g.bar.grow)} mm</b><span class="${g.bar.reusable ? "keep" : "lost"}">→ ${
        g.bar.reusable ? "à garder" : "perte"
      }</span>${g.bar.reusable ? `<span class="hint">Étiqueter « ${esc(input.profile)} — ${fmt(g.bar.remnant, 0)} » avant de ranger.</span>` : ""}</div>
    </article>`;
  });

  const cuts = plan.bars.reduce((n, b) => n + b.cuts.length, 0);
  return {
    kind: "Fiche de coupe",
    title: input.title,
    subtitle: `${input.profile} — ${plan.bars.length} barre${plan.bars.length > 1 ? "s" : ""}, ${cuts} pièce${cuts > 1 ? "s" : ""}`,
    ident: input.machine ? [["Poste", input.machine]] : [],
    pages: [
      page1,
      `<div class="section"><h2>Découpe barre par barre</h2><div class="legend"><span>▭ pièce</span><span>▨ perte (dressage, trait de scie, coins d'angle)</span><span>▭ vert : chute à garder</span><span>▭ pointillé : chute réservée</span><span>Mesurer : pointe à pointe</span></div></div>${blocks.join("")}`,
    ],
  };
}
