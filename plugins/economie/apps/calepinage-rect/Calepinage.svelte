<script lang="ts">
  // Calepinage de tôles à la cisaille guillotine (cahier des charges, section 9.4).
  import type { Shear } from "@etabli/sdk";
  import { Card, Field, Libraries, MiniAppDocument, SelectField, colorOf, format, onIncoming, printFiche } from "@etabli/ui";
  import { groupPlates, planPlates, type Chute, type PlatePlan, type ShearSettings } from "../../src/cisaille";
  import { calepinageFiche } from "../../src/fiche-calepinage";
  import { MATERIALS, materialOf, plateWeight, type MaterialId } from "../../src/matiere";
  import { nextMark, num, quantity, rowsFromPaste } from "../../src/pieces";

  interface SheetRow {
    length: string;
    width: string;
    quantity: string;
    tolMinus: string;
    tolPlus: string;
  }

  interface PieceRow {
    mark: string;
    name: string;
    length: string;
    width: string;
    quantity: string;
    /** Sens imposé : la longueur suit le sens de laminage. */
    grain: boolean;
  }

  interface Data {
    /** Cisaille de la bibliothèque Machines ; vide : réglages saisis à la main. */
    machine: string;
    material: MaterialId;
    thickness: string;
    sheets: SheetRow[];
    offcuts: { length: string; width: string }[];
    bladeLength: string;
    gaugeMax: string;
    trim: string;
    keepA: string;
    keepB: string;
    pieces: PieceRow[];
  }

  const newPiece = (mark: string, rest: Partial<PieceRow> = {}): PieceRow => ({
    mark,
    name: "",
    length: "",
    width: "",
    quantity: "1",
    grain: false,
    ...rest,
  });

  const DEFAULTS: Data = {
    machine: "",
    material: "acier",
    thickness: "2",
    sheets: [{ length: "2500", width: "1250", quantity: "", tolMinus: "0", tolPlus: "0" }],
    offcuts: [],
    bladeLength: "",
    gaugeMax: "",
    trim: "5",
    keepA: "100",
    keepB: "200",
    pieces: [newPiece("A")],
  };

  /** Anciens calculs (calepinage de rectangles) : formats sans tolérance, « rotation » devenue « sens imposé ». */
  function migrate(saved: Record<string, unknown>): Partial<Data> {
    const sheets = Array.isArray(saved.sheets) ? (saved.sheets as Partial<SheetRow>[]) : DEFAULTS.sheets;
    const pieces = Array.isArray(saved.pieces) ? (saved.pieces as (Partial<PieceRow> & { rotate?: boolean })[]) : DEFAULTS.pieces;
    return {
      ...(saved as Partial<Data>),
      sheets: sheets.map((s) => ({ length: "", width: "", quantity: "", tolMinus: "0", tolPlus: "0", ...s })),
      offcuts: Array.isArray(saved.offcuts) ? (saved.offcuts as Data["offcuts"]) : [],
      pieces: pieces.map((p) => newPiece(p.mark ?? "?", { ...p, grain: p.grain ?? p.rotate === false })),
    };
  }

  const libraries = new Libraries();
  const ADD = "__ajouter__";
  const shears = $derived(libraries.machines.filter((m): m is Shear => m.kind === "cisaille"));
  const shear = $derived(shears.find((s) => s.id === doc.data.machine));

  function settingsOf(data: Data): ShearSettings {
    const chosen = shears.find((s) => s.id === data.machine);
    return {
      bladeLength: chosen ? chosen.bladeLength : num(data.bladeLength) || 0,
      gaugeMax: chosen ? chosen.gaugeMax : num(data.gaugeMax) || 0,
      trim: chosen ? chosen.trim : num(data.trim) || 0,
      keep: [num(data.keepA) || 0, num(data.keepB) || 0],
    };
  }

  function compute(data: Data, settings = settingsOf(data)): PlatePlan | null {
    const pieces = data.pieces.map((p) => ({
      mark: p.mark || "?",
      length: num(p.length),
      width: num(p.width),
      quantity: num(p.quantity) || 0,
      grain: p.grain,
    }));
    if (!pieces.some((p) => p.length > 0 && p.width > 0 && p.quantity > 0)) return null;
    return planPlates(
      data.sheets
        .map((s) => ({
          length: num(s.length),
          width: num(s.width),
          quantity: quantity(s.quantity),
          tolMinus: Math.max(0, num(s.tolMinus) || 0),
          tolPlus: Math.max(0, num(s.tolPlus) || 0),
        }))
        .filter((s) => s.length > 0 && s.width > 0),
      data.offcuts.map((o) => ({ length: num(o.length), width: num(o.width) })).filter((o) => o.length > 0 && o.width > 0),
      pieces,
      settings,
    );
  }

  const summarize = (plan: PlatePlan | null) => {
    if (!plan?.sheets.length) return "";
    const sheets = plan.sheets.filter((s) => s.source === "tole").length;
    return `${sheets} tôle${sheets > 1 ? "s" : ""} · ${Math.round((plan.piecesArea / plan.sheetsArea) * 100)} % utilisé`;
  };

  const doc = new MiniAppDocument<Data>(DEFAULTS, (data) => summarize(compute(data)), migrate);

  // Pièce envoyée par une autre mini-app (un flan plié de la Tôlerie, par exemple).
  onIncoming("piece-plate", (raw, from) => {
    const p = raw as Partial<{ name: string; length: number; width: number; quantity: number; grain: boolean; thickness: number; family: string }>;
    if (!(Number(p.length) > 0 && Number(p.width) > 0)) return;
    const fresh = doc.data.pieces.every((x) => x.length.trim() === "" && x.width.trim() === "");
    if (fresh) {
      doc.data.pieces = [];
      if (Number(p.thickness) > 0) doc.data.thickness = String(p.thickness);
      if (MATERIALS.some((m) => m.id === p.family)) doc.data.material = p.family as MaterialId;
    }
    doc.data.pieces.push(
      newPiece(nextMark(doc.data.pieces.map((x) => x.mark)), {
        name: p.name ?? "",
        length: String(p.length),
        width: String(p.width),
        quantity: String(p.quantity ?? 1),
        grain: p.grain ?? false,
      }),
    );
    doc.notify(`Pièce reçue de « ${from} »`);
  });

  let plan = $state<PlatePlan | null>(null);
  let computing = $state(false);
  $effect(() => {
    const snapshot = JSON.parse(JSON.stringify(doc.data)) as Data;
    // Lu ici : une cisaille modifiée dans les Paramètres relance aussi le calcul.
    const settings = settingsOf(snapshot);
    computing = true;
    const timer = setTimeout(() => {
      plan = compute(snapshot, settings);
      computing = false;
    }, 250);
    return () => clearTimeout(timer);
  });

  const groups = $derived(plan ? groupPlates(plan.sheets) : []);
  const material = $derived(materialOf(doc.data.material));
  const thickness = $derived(Math.max(0, num(doc.data.thickness) || 0));
  const weight = (area: number) => plateWeight(area, thickness, material.density);
  const newSheets = $derived(plan ? plan.sheets.filter((s) => s.source === "tole") : []);
  const keptChutes = $derived(plan ? plan.sheets.flatMap((s) => s.chutes.filter((c) => c.keep)) : []);
  const wasteArea = $derived(plan ? plan.sheetsArea - plan.piecesArea - plan.keptArea : 0);

  // ——— Cisaille : « + Ajouter une machine… » ouvre les Paramètres, la nouvelle est choisie ici ———
  const shearOptions = $derived([
    { value: "", label: "Réglages saisis à la main" },
    ...shears.map((s) => ({ value: s.id, label: s.name || "Cisaille sans nom" })),
    { value: ADD, label: "+ Ajouter une machine…" },
  ]);
  let knownShears = $state<Set<string> | null>(null);
  let previous = "";
  $effect(() => {
    if (doc.data.machine !== ADD) previous = doc.data.machine;
  });
  function pickShear(id: string): void {
    if (id !== ADD) return;
    doc.data.machine = previous;
    knownShears = new Set(shears.map((s) => s.id));
    libraries.addMachine("cisaille");
  }
  $effect(() => {
    const added = knownShears && shears.find((s) => !knownShears!.has(s.id));
    if (!added) return;
    knownShears = null;
    doc.data.machine = added.id;
  });

  // ——— Formats des fournisseurs ———
  const sheetOffers = $derived(
    libraries.suppliers.flatMap((s) =>
      s.items
        .filter((item) => item.kind === "tole" && item.length > 0 && (item.width ?? 0) > 0)
        .map((item) => ({
          value: `${s.id}/${item.id}`,
          label: `${s.name || "Fournisseur"} — ${[item.material, item.designation].filter(Boolean).join(" ") || "tôle"} · ${format(item.length, 0)} × ${format(item.width ?? 0, 0)}`,
          item,
        })),
    ),
  );
  let offer = $state("");
  function pickOffer(value: string): void {
    const found = sheetOffers.find((o) => o.value === value)?.item;
    offer = "";
    if (!found) return;
    const row: SheetRow = {
      length: String(found.length),
      width: String(found.width ?? ""),
      quantity: "",
      tolMinus: String(found.tolMinus),
      tolPlus: String(found.tolPlus),
    };
    const empty = doc.data.sheets.find((s) => num(s.length) <= 0 || doc.data.sheets.length === 1);
    if (empty) Object.assign(empty, row);
    else doc.data.sheets.push(row);
  }

  // ——— Pièces ———
  function addPiece(): void {
    doc.data.pieces.push(newPiece(nextMark(doc.data.pieces.map((p) => p.mark))));
  }

  function onpaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData("text") ?? "";
    if (!/[\t\n]/.test(text.trim())) return;
    event.preventDefault();
    const rows = rowsFromPaste(text, 2, doc.data.pieces.map((p) => p.mark));
    const kept = doc.data.pieces.filter((p) => p.length.trim() !== "" || p.width.trim() !== "");
    doc.data.pieces = [...kept, ...rows.map(([mark, length, width, qty]) => newPiece(mark!, { length, width: width ?? "", quantity: qty }))];
    doc.notify(`${rows.length} pièce${rows.length > 1 ? "s" : ""} collée${rows.length > 1 ? "s" : ""}`);
  }

  // ——— Contrôles ———
  const warnings = $derived.by(() => {
    const list: string[] = [];
    if (shear && thickness > 0) {
      const capacity = shear.maxThickness * material.shearFactor;
      if (thickness > capacity + 1e-9) {
        list.push(`Épaisseur ${format(thickness)} mm : au-delà de la capacité de « ${shear.name} » en ${material.label.toLowerCase()} (${format(capacity, 1)} mm).`);
      }
    }
    const over = plan?.sheets.flatMap((s) => s.cuts).filter((c) => c.overGauge) ?? [];
    if (over.length) list.push(`${over.length} cote${over.length > 1 ? "s" : ""} au-delà de la course de la butée : à tracer à la main (signalé sur la fiche).`);
    const blade = plan?.sheets.flatMap((s) => s.cuts).filter((c) => c.overBlade) ?? [];
    if (blade.length) list.push(`${blade.length} coupe${blade.length > 1 ? "s" : ""} plus longue${blade.length > 1 ? "s" : ""} que la lame : impossible sur cette cisaille.`);
    return list;
  });

  const chuteText = (c: Chute) =>
    `${format(c.length, 0)}${c.grow[0] ? `–${format(c.length + c.grow[0], 0)}` : ""} × ${format(c.width, 0)}${c.grow[1] ? `–${format(c.width + c.grow[1], 0)}` : ""}`;

  function print(): void {
    if (!plan) return;
    printFiche(
      calepinageFiche({
        title: "",
        material: material.label,
        thickness,
        density: material.density,
        plan,
        pieces: doc.data.pieces.map((p) => ({
          mark: p.mark || "?",
          name: p.name,
          length: num(p.length),
          width: num(p.width),
          quantity: num(p.quantity) || 0,
          grain: p.grain,
        })),
        colors: colorOf,
        machine: shear?.name ?? "",
        settings: settingsOf(doc.data),
      }),
    );
  }

  function copyList(): void {
    if (!plan) return;
    const lines = [`Calepinage — ${material.label} ${format(thickness)} mm`, ""];
    groups.forEach(({ sheet, count }, i) => {
      lines.push(`${i + 1}. ${count > 1 ? `${count} × ` : ""}${sheet.source === "chute" ? "chute" : "tôle"} ${format(sheet.nominal[0])} × ${format(sheet.nominal[1])}`);
      const byMark = new Map<string, number>();
      for (const p of sheet.pieces) {
        const key = `${p.mark} ${format(p.length)} × ${format(p.width)}`;
        byMark.set(key, (byMark.get(key) ?? 0) + 1);
      }
      for (const [label, n] of byMark) lines.push(`   ${n} × ${label}`);
      const keep = sheet.chutes.filter((c) => c.keep);
      if (keep.length) lines.push(`   chutes à garder : ${keep.map(chuteText).join(", ")}`);
    });
    doc.copy(lines.join("\n"));
  }

  /** Taille du texte dans un schéma de tôle, en mm (le schéma est à l'échelle de la tôle). */
  const fontSize = (l: number, w: number) => Math.max(l, w) / 45;
</script>

<div class="split">
  <div class="inputs">
    <Card title="Tôle">
      <div class="two">
        <SelectField label="Matière" options={MATERIALS.map((m) => ({ value: m.id, label: m.label }))} bind:value={doc.data.material} />
        <Field label="Épaisseur" unit="mm" bind:value={doc.data.thickness} />
      </div>

      <div class="table sheets">
        <span class="head">Longueur</span>
        <span class="head">Largeur</span>
        <span class="head">Qté</span>
        <span class="head" title="Tolérance du format">Tol. − / +</span>
        <span></span>
        {#each doc.data.sheets as sheet, i (i)}
          <Field compact label="Longueur de tôle" unit="mm" bind:value={sheet.length} />
          <Field compact label="Largeur de tôle" unit="mm" bind:value={sheet.width} />
          <Field compact label="Quantité de tôles" placeholder="illimitée" bind:value={sheet.quantity} />
          <span class="tol">
            <Field compact label="Tolérance en moins" bind:value={sheet.tolMinus} />
            <Field compact label="Tolérance en plus" bind:value={sheet.tolPlus} />
          </span>
          <button class="remove" onclick={() => doc.data.sheets.splice(i, 1)} disabled={doc.data.sheets.length === 1} aria-label="Retirer ce format">✕</button>
        {/each}
      </div>
      <div class="row-actions">
        <button class="btn" onclick={() => doc.data.sheets.push({ length: "", width: "", quantity: "", tolMinus: "0", tolPlus: "0" })}>+ Autre format</button>
        {#if sheetOffers.length}
          <SelectField
            compact
            label="Format d'un fournisseur"
            options={[{ value: "", label: "Format d'un fournisseur…" }, ...sheetOffers.map(({ value, label }) => ({ value, label }))]}
            bind:value={offer}
            onchange={pickOffer}
          />
        {/if}
      </div>
      <p class="hint">Quantité vide : autant que nécessaire (le plan dit combien en acheter). Le calcul se fait sur la plus petite tôle possible (longueur − tolérance).</p>

      <div class="subhead">Chutes déjà en stock <small>utilisées en premier, sans dressage</small></div>
      {#if doc.data.offcuts.length}
        <div class="table offcuts">
          {#each doc.data.offcuts as offcut, i (i)}
            <Field compact label="Longueur de la chute" unit="mm" bind:value={offcut.length} />
            <Field compact label="Largeur de la chute" unit="mm" bind:value={offcut.width} />
            <button class="remove" onclick={() => doc.data.offcuts.splice(i, 1)} aria-label="Retirer cette chute">✕</button>
          {/each}
        </div>
      {/if}
      <button class="btn" onclick={() => doc.data.offcuts.push({ length: "", width: "" })}>+ Chute du stock</button>
    </Card>

    <Card title="Cisaille et chutes">
      <SelectField label="Cisaille" options={shearOptions} bind:value={doc.data.machine} onchange={pickShear} />
      {#if shear}
        <!-- Réglages de la cisaille : modifiables dans Paramètres → Bibliothèques → Machines. -->
        <p class="machine-settings">
          Lame <b>{format(shear.bladeLength)} mm</b> · butée arrière <b>{format(shear.gaugeMax)} mm</b> · dressage <b>{format(shear.trim)} mm</b> ·
          capacité <b>{format(shear.maxThickness)} mm</b> (acier)
        </p>
      {:else}
        <div class="three">
          <Field label="Longueur de lame" unit="mm" placeholder="illimitée" bind:value={doc.data.bladeLength} />
          <Field label="Butée arrière maxi" unit="mm" placeholder="illimitée" bind:value={doc.data.gaugeMax} />
          <Field label="Dressage" unit="mm" bind:value={doc.data.trim} />
        </div>
      {/if}
      <div class="keep">
        <span class="keep-label">Chute gardée si au moins</span>
        <Field compact label="Petit côté mini" unit="mm" bind:value={doc.data.keepA} />
        <span class="times">×</span>
        <Field compact label="Grand côté mini" unit="mm" bind:value={doc.data.keepB} />
      </div>
    </Card>

    <Card title="Pièces">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="table pieces" {onpaste}>
        <span></span>
        <span class="head">Repère</span>
        <span class="head">Longueur</span>
        <span class="head">Largeur</span>
        <span class="head">Qté</span>
        <span class="head" title="Sens imposé : la longueur suit le sens de laminage">Sens</span>
        <span></span>
        {#each doc.data.pieces as p, i (i)}
          <span class="swatch" style:background={colorOf(i)}></span>
          <Field compact numeric={false} label="Repère" bind:value={p.mark} />
          <Field compact label="Longueur" unit="mm" bind:value={p.length} />
          <Field compact label="Largeur" unit="mm" bind:value={p.width} />
          <Field compact label="Quantité" bind:value={p.quantity} />
          <button
            class="grain"
            class:on={p.grain}
            onclick={() => (p.grain = !p.grain)}
            aria-pressed={p.grain}
            title={p.grain ? "Sens imposé : la longueur suit le sens de laminage" : "Libre : la pièce peut pivoter sur la tôle"}
          >
            {p.grain ? "→" : "↻"}
          </button>
          <button class="remove" onclick={() => doc.data.pieces.splice(i, 1)} disabled={doc.data.pieces.length === 1} aria-label="Retirer la pièce {p.mark}">✕</button>
        {/each}
      </div>
      <button class="btn" onclick={addPiece}>+ Ajouter une pièce</button>
      <p class="hint">
        ↻ libre : la pièce peut pivoter. → sens imposé : sa longueur suit le sens de laminage (pièce pliée, inox brossé).
        Collez des lignes depuis Excel : repère, longueur, largeur, quantité.
      </p>
    </Card>
  </div>

  <Card title="Calepinage">
    {#snippet actions()}
      {#if plan?.sheets.length}
        <button class="btn" onclick={copyList}>Copier la liste</button>
        <button class="btn primary" onclick={print}>Imprimer la fiche</button>
      {/if}
    {/snippet}
    {#each warnings as warning (warning)}
      <p class="warn">{warning}</p>
    {/each}
    {#if plan && (plan.sheets.length || plan.unplaced.length)}
      <div class="kpis" class:stale={computing}>
        <div class="kpi main">
          <span>Tôles neuves</span>
          <b>{newSheets.length}</b>
          <small>{[...new Set(newSheets.map((s) => `${format(s.nominal[0])} × ${format(s.nominal[1])}`))].join(", ") || "aucune"}</small>
        </div>
        <div class="kpi">
          <span>Utilisation</span>
          <b>{plan.sheetsArea ? format((plan.piecesArea / plan.sheetsArea) * 100, 1) : "—"} %</b>
          <small>{format(weight(plan.piecesArea), 1)} kg de pièces</small>
        </div>
        <div class="kpi">
          <span>Perte</span>
          <b>{format(weight(wasteArea), 1)} kg</b>
          <small>{format((wasteArea / Math.max(1, plan.sheetsArea)) * 100, 1)} % · dressage, bords</small>
        </div>
        <div class="kpi">
          <span>Chutes à garder</span>
          <b>{keptChutes.length}</b>
          <small>{format(plan.keptArea / 1e6, 2)} m² · {format(weight(plan.keptArea), 1)} kg</small>
        </div>
      </div>

      {#if plan.unplaced.length}
        <p class="warn">
          {plan.unplaced.length} pièce{plan.unplaced.length > 1 ? "s" : ""} non placée{plan.unplaced.length > 1 ? "s" : ""} :
          {[...new Set(plan.unplaced.map((p) => `${p.mark} (${format(p.length)} × ${format(p.width)})`))].join(", ")}.
          Trop grandes pour les tôles, ou plus assez de tôles.
        </p>
      {/if}

      <div class="sheets-list" class:stale={computing}>
        {#each groups as { sheet, count }, i (i)}
          {@const fs = fontSize(sheet.length, sheet.width)}
          <figure>
            <figcaption>
              <b>{sheet.source === "chute" ? "Chute" : "Tôle"} {i + 1}{count > 1 ? ` × ${count}` : ""}</b>
              <span>{format(sheet.nominal[0])} × {format(sheet.nominal[1])} mm · {format(weight(sheet.nominal[0] * sheet.nominal[1]), 1)} kg</span>
              <span class="rate">{format((sheet.piecesArea / (sheet.length * sheet.width)) * 100, 1)} %</span>
            </figcaption>
            <svg viewBox="0 0 {sheet.length} {sheet.width}" role="img" aria-label="Disposition de la tôle {i + 1}">
              <rect class="plate" width={sheet.length} height={sheet.width} />
              {#each sheet.chutes.filter((c) => c.keep) as c, j (j)}
                <rect class="chute" x={c.x} y={c.y} width={c.length} height={c.width}>
                  <title>Chute à garder : {chuteText(c)}</title>
                </rect>
              {/each}
              {#each sheet.pieces as p, j (j)}
                <g>
                  <rect x={p.x} y={p.y} width={p.length} height={p.width} fill={colorOf(p.piece)} class="piece">
                    <title>{p.mark} — {format(p.length)} × {format(p.width)}{p.rotated ? " (tournée)" : ""}</title>
                  </rect>
                  {#if p.length > fs * 7 && p.width > fs * 1.6}
                    <text x={p.x + p.length / 2} y={p.y + p.width / 2} font-size={fs} dominant-baseline="middle" text-anchor="middle">
                      {format(p.length, 0)}×{format(p.width, 0)}
                    </text>
                  {/if}
                </g>
              {/each}
              {#each sheet.bands as band, j (j)}
                {@const at = band.offset + band.size}
                {#if sheet.axis === "x"}
                  <line class="band" x1={at} y1={0} x2={at} y2={sheet.width} />
                {:else}
                  <line class="band" x1={0} y1={at} x2={sheet.length} y2={at} />
                {/if}
              {/each}
            </svg>
            <small>
              {sheet.bands.length} bande{sheet.bands.length > 1 ? "s" : ""} · {sheet.cuts.filter((c) => c.stage > 0).length} coupes ·
              {new Set(sheet.cuts.filter((c) => c.stage > 0).map((c) => c.gauge)).size} réglages de butée
              {#if sheet.chutes.some((c) => c.keep)}· à garder : {sheet.chutes.filter((c) => c.keep).map(chuteText).join(", ")}{/if}
            </small>
          </figure>
        {/each}
      </div>
      <p class="hint">Traits épais : coupes de bande (1er passage). En vert : chutes à garder. Le sens de laminage suit la longueur de la tôle (→).</p>
    {:else}
      <p class="empty">Ajoutez les dimensions des pièces : la disposition sur les tôles s'affiche ici.</p>
    {/if}
  </Card>
</div>

<style>
  .split {
    display: grid;
    grid-template-columns: minmax(380px, 460px) 1fr;
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
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .three {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .table {
    display: grid;
    gap: 4px 6px;
    align-items: center;
  }
  .table.sheets {
    grid-template-columns: 1fr 1fr 64px 104px 28px;
  }
  .table.offcuts {
    grid-template-columns: 1fr 1fr 28px;
  }
  .table.pieces {
    grid-template-columns: 10px 58px 1fr 1fr 52px 32px 28px;
  }
  .tol {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }
  .head {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--faint);
  }
  .subhead {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
  }
  .subhead small {
    font-weight: 400;
    color: var(--faint);
  }
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  .grain {
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface);
    color: var(--muted);
    font-size: 15px;
    cursor: pointer;
    user-select: none;
  }
  .grain.on {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 700;
  }
  .row-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .row-actions :global(.field) {
    flex: 1;
    min-width: 180px;
  }
  .machine-settings {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }
  .machine-settings b {
    font-family: var(--mono);
    color: var(--text);
  }
  .keep {
    display: grid;
    grid-template-columns: auto 1fr auto 1fr;
    gap: 6px;
    align-items: center;
  }
  .keep-label,
  .times {
    font-size: 12.5px;
    color: var(--muted);
  }
  .remove {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--r-md);
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
  .kpi small {
    color: var(--faint);
    font-size: 11.5px;
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
    border-radius: var(--r-xs);
  }
  .plate {
    fill: var(--field);
    stroke: var(--border);
    stroke-width: 0.3%;
  }
  .chute {
    fill: color-mix(in srgb, var(--ok) 14%, transparent);
    stroke: var(--ok);
    stroke-width: 0.35%;
  }
  .piece {
    stroke: var(--surface);
    stroke-width: 0.25%;
    opacity: 0.9;
  }
  .band {
    stroke: var(--text);
    stroke-width: 0.45%;
  }
  text {
    fill: #fff;
    font-family: var(--mono);
    font-weight: 600;
    pointer-events: none;
  }
</style>
