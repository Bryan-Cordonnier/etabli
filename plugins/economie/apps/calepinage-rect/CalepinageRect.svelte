<script lang="ts">
  import { Card, Check, Field, MiniAppDocument, colorOf, format } from "@etabli/ui";
  import { groupSheets, nest, type NestResult } from "../../src/nesting";
  import { nextMark, num, quantity, rowsFromPaste } from "../../src/pieces";

  interface Data {
    sheets: { length: string; width: string; quantity: string }[];
    spacing: string;
    margin: string;
    guillotine: boolean;
    pieces: { mark: string; length: string; width: string; quantity: string; rotate: boolean }[];
  }

  const DEFAULTS: Data = {
    sheets: [{ length: "2500", width: "1250", quantity: "" }],
    spacing: "5",
    margin: "10",
    guillotine: false,
    pieces: [{ mark: "A", length: "", width: "", quantity: "1", rotate: true }],
  };

  const FORMATS = [
    [2000, 1000],
    [2500, 1250],
    [3000, 1500],
    [4000, 2000],
  ] as const;

  function compute(data: Data): NestResult | null {
    const pieces = data.pieces.map((p) => ({
      mark: p.mark || "?",
      length: num(p.length),
      width: num(p.width),
      quantity: num(p.quantity) || 0,
      rotate: p.rotate,
    }));
    if (!pieces.some((p) => p.length > 0 && p.width > 0 && p.quantity > 0)) return null;
    return nest(
      data.sheets
        .map((s) => ({ length: num(s.length), width: num(s.width), quantity: quantity(s.quantity) }))
        .filter((s) => s.length > 0 && s.width > 0),
      pieces,
      { spacing: num(data.spacing) || 0, margin: num(data.margin) || 0, guillotine: data.guillotine },
    );
  }

  const summarize = (r: NestResult | null) => {
    if (!r?.sheets.length) return "";
    const rate = Math.round((r.piecesArea / r.sheetsArea) * 100);
    return `${r.sheets.length} tôle${r.sheets.length > 1 ? "s" : ""} · ${rate} % utilisé`;
  };

  const doc = new MiniAppDocument<Data>(DEFAULTS, (data) => summarize(compute(data)));

  // Calcul un peu après la dernière frappe : la saisie reste fluide même avec beaucoup de pièces.
  let result = $state<NestResult | null>(null);
  let computing = $state(false);
  $effect(() => {
    const snapshot = JSON.parse(JSON.stringify(doc.data)) as Data;
    computing = true;
    const timer = setTimeout(() => {
      result = compute(snapshot);
      computing = false;
    }, 300);
    return () => clearTimeout(timer);
  });

  const groups = $derived(result ? groupSheets(result.sheets) : []);

  function addPiece(): void {
    doc.data.pieces.push({ mark: nextMark(doc.data.pieces.map((p) => p.mark)), length: "", width: "", quantity: "1", rotate: true });
  }

  function addFormat(length: number, width: number): void {
    const empty = doc.data.sheets.find((s) => s.length.trim() === "" && s.width.trim() === "");
    if (empty) Object.assign(empty, { length: String(length), width: String(width) });
    else doc.data.sheets.push({ length: String(length), width: String(width), quantity: "" });
  }

  function onpaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData("text") ?? "";
    if (!/[\t\n]/.test(text.trim())) return;
    event.preventDefault();
    const rows = rowsFromPaste(text, 2, doc.data.pieces.map((p) => p.mark));
    const kept = doc.data.pieces.filter((p) => p.length.trim() !== "" || p.width.trim() !== "");
    doc.data.pieces = [
      ...kept,
      ...rows.map(([mark, length, width, qty]) => ({ mark: mark!, length: length!, width: width ?? "", quantity: qty!, rotate: true })),
    ];
    doc.notify(`${rows.length} pièce${rows.length > 1 ? "s" : ""} collée${rows.length > 1 ? "s" : ""}`);
  }

  function copyList(): void {
    if (!result) return;
    const lines = ["Calepinage", ""];
    groups.forEach(({ sheet, count }, i) => {
      lines.push(`Tôle ${i + 1}${count > 1 ? ` (× ${count})` : ""} — ${format(sheet.length)} × ${format(sheet.width)} mm — ${format((sheet.usedArea / (sheet.length * sheet.width)) * 100, 0)} %`);
      const byMark = new Map<string, number>();
      for (const p of sheet.placements) byMark.set(`${p.mark} ${format(p.length)} × ${format(p.width)}`, (byMark.get(`${p.mark} ${format(p.length)} × ${format(p.width)}`) ?? 0) + 1);
      for (const [label, n] of byMark) lines.push(`   ${n} × ${label}`);
    });
    doc.copy(lines.join("\n"));
  }

  /** Taille du texte dans un schéma de tôle, en mm (le schéma est à l'échelle de la tôle). */
  const fontSize = (l: number, w: number) => Math.max(l, w) / 45;
</script>

<div class="split">
  <div class="inputs">
    <Card title="Tôles disponibles">
      <div class="table sheets">
        <span class="head">Longueur</span>
        <span class="head">Largeur</span>
        <span class="head">Quantité</span>
        <span></span>
        {#each doc.data.sheets as sheet, i (i)}
          <Field compact label="Longueur de tôle" unit="mm" bind:value={sheet.length} />
          <Field compact label="Largeur de tôle" unit="mm" bind:value={sheet.width} />
          <Field compact label="Quantité de tôles" placeholder="illimitée" bind:value={sheet.quantity} />
          <button class="remove" onclick={() => doc.data.sheets.splice(i, 1)} disabled={doc.data.sheets.length === 1} aria-label="Retirer ce format">✕</button>
        {/each}
      </div>
      <div class="formats">
        {#each FORMATS as [l, w] (l)}
          <button class="btn" onclick={() => addFormat(l, w)}>+ {l} × {w}</button>
        {/each}
      </div>
      <div class="two">
        <Field label="Espacement entre pièces" unit="mm" bind:value={doc.data.spacing} />
        <Field label="Marge au bord" unit="mm" bind:value={doc.data.margin} />
      </div>
      <Check
        label="Découpe à la cisaille (coupes guillotine)"
        hint="Uniquement des coupes droites de bord à bord."
        bind:checked={doc.data.guillotine}
      />
    </Card>

    <Card title="Pièces">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="table pieces" {onpaste}>
        <span></span>
        <span class="head">Repère</span>
        <span class="head">Longueur</span>
        <span class="head">Largeur</span>
        <span class="head">Qté</span>
        <span class="head" title="Rotation autorisée">↻</span>
        <span></span>
        {#each doc.data.pieces as piece, i (i)}
          <span class="swatch" style:background={colorOf(i)}></span>
          <Field compact numeric={false} label="Repère" bind:value={piece.mark} />
          <Field compact label="Longueur" bind:value={piece.length} />
          <Field compact label="Largeur" bind:value={piece.width} />
          <Field compact label="Quantité" bind:value={piece.quantity} />
          <input
            type="checkbox"
            bind:checked={piece.rotate}
            title="Rotation autorisée (décocher si le sens de laminage compte)"
            aria-label="Rotation autorisée pour {piece.mark}"
          />
          <button class="remove" onclick={() => doc.data.pieces.splice(i, 1)} disabled={doc.data.pieces.length === 1} aria-label="Retirer la pièce {piece.mark}">✕</button>
        {/each}
      </div>
      <button class="btn" onclick={addPiece}>+ Ajouter une pièce</button>
      <p class="hint">
        Dimensions en mm. ↻ : rotation autorisée (décochez pour une pièce pliée, à cause du sens de laminage).
        Collez des lignes depuis Excel : repère, longueur, largeur, quantité.
      </p>
    </Card>
  </div>

  <Card title="Calepinage">
    {#snippet actions()}
      {#if result?.sheets.length}<button class="btn" onclick={copyList}>Copier la liste</button>{/if}
    {/snippet}
    {#if result && (result.sheets.length || result.unplaced.length)}
      <div class="kpis" class:stale={computing}>
        <div class="kpi main">
          <span>Tôles</span>
          <b>{result.sheets.length}</b>
        </div>
        <div class="kpi">
          <span>Utilisation</span>
          <b>{result.sheetsArea ? format((result.piecesArea / result.sheetsArea) * 100, 1) : "—"} %</b>
        </div>
        <div class="kpi">
          <span>Surface de chute</span>
          <b>{format((result.sheetsArea - result.piecesArea) / 1e6, 2)} m²</b>
        </div>
      </div>

      {#if result.unplaced.length}
        <p class="warn">
          {result.unplaced.length} pièce{result.unplaced.length > 1 ? "s" : ""} non placée{result.unplaced.length > 1 ? "s" : ""} :
          {[...new Set(result.unplaced.map((p) => `${p.mark} (${format(p.length)} × ${format(p.width)})`))].join(", ")}.
          Trop grandes pour les tôles, ou plus assez de tôles.
        </p>
      {/if}

      <div class="sheets-list" class:stale={computing}>
        {#each groups as { sheet, count }, i (i)}
          {@const fs = fontSize(sheet.length, sheet.width)}
          <figure>
            <figcaption>
              <b>Tôle {i + 1}{count > 1 ? ` × ${count}` : ""}</b>
              <span>{format(sheet.length)} × {format(sheet.width)} mm</span>
              <span class="rate">{format((sheet.usedArea / (sheet.length * sheet.width)) * 100, 1)} %</span>
            </figcaption>
            <svg viewBox="0 0 {sheet.length} {sheet.width}" role="img" aria-label="Disposition de la tôle {i + 1}">
              <rect class="plate" width={sheet.length} height={sheet.width} />
              {#each sheet.placements as p, j (j)}
                <g>
                  <rect x={p.x} y={p.y} width={p.length} height={p.width} fill={colorOf(p.piece)} class="piece">
                    <title>{p.mark} — {format(p.length)} × {format(p.width)}{p.rotated ? " (tournée)" : ""}</title>
                  </rect>
                  {#if p.length > fs * 4 && p.width > fs * 1.6}
                    <text x={p.x + p.length / 2} y={p.y + p.width / 2} font-size={fs} dominant-baseline="middle" text-anchor="middle">
                      {p.mark}{p.length > fs * 9 ? ` ${format(p.length, 0)}×${format(p.width, 0)}` : ""}
                    </text>
                  {/if}
                </g>
              {/each}
            </svg>
            {#if sheet.offcut && sheet.offcut.length > 50 && sheet.offcut.width > 50}
              <small>Plus grande chute : {format(sheet.offcut.length, 0)} × {format(sheet.offcut.width, 0)} mm</small>
            {/if}
          </figure>
        {/each}
      </div>
    {:else}
      <p class="empty">Ajoutez les dimensions des pièces : la disposition sur les tôles s'affiche ici.</p>
    {/if}
  </Card>
</div>

<style>
  .split {
    display: grid;
    grid-template-columns: minmax(360px, 440px) 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 860px) {
    .split {
      grid-template-columns: 1fr;
    }
  }
  .inputs {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .table {
    display: grid;
    gap: 4px 6px;
    align-items: center;
  }
  .table.sheets {
    grid-template-columns: 1fr 1fr 100px 28px;
  }
  .table.pieces {
    grid-template-columns: 10px 58px 1fr 1fr 52px 18px 28px;
  }
  .head {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--faint);
  }
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: var(--accent);
  }
  .formats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .remove {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--faint);
  }
  .remove:hover:not(:disabled) {
    background: var(--field);
    color: var(--err);
  }
  .remove:disabled {
    opacity: 0.3;
  }
  .btn {
    align-self: flex-start;
  }
  .hint,
  .empty {
    margin: 0;
    font-size: 12.5px;
    color: var(--faint);
  }
  .empty {
    padding: 32px 0;
    text-align: center;
  }
  .warn {
    margin: 0;
    padding: 8px 12px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--err) 12%, transparent);
    font-size: 13px;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
    transition: opacity 0.15s;
  }
  .kpi {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface-2);
  }
  .kpi span {
    color: var(--muted);
    font-size: 12.5px;
  }
  .kpi b {
    font: 600 22px var(--mono);
  }
  .kpi.main b {
    font-size: 30px;
    color: var(--accent);
  }
  .stale {
    opacity: 0.55;
  }
  .sheets-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
    transition: opacity 0.15s;
  }
  figure {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  figcaption {
    display: flex;
    gap: 10px;
    align-items: baseline;
    font-size: 13px;
  }
  figcaption span {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 12px;
  }
  figcaption .rate {
    margin-left: auto;
    color: var(--ok);
    font-weight: 700;
  }
  figure small {
    color: var(--faint);
    font-size: 12px;
  }
  svg {
    width: 100%;
    height: auto;
    border-radius: 4px;
  }
  .plate {
    fill: var(--field);
    stroke: var(--border);
    stroke-width: 0.3%;
  }
  .piece {
    stroke: var(--surface);
    stroke-width: 0.25%;
    opacity: 0.9;
  }
  text {
    fill: #fff;
    font-family: var(--mono);
    font-weight: 600;
    pointer-events: none;
  }
</style>
