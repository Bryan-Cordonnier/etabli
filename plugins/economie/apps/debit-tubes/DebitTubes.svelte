<script lang="ts">
  import { STOCK_KINDS } from "@etabli/sdk";
  import { Card, Field, MiniAppDocument, PluginSettings, SelectField, Suppliers, colorOf, format, printFiche } from "@etabli/ui";
  import { groupBars, planCuts, type CutPlan } from "../../src/debit";
  import { debitFiche } from "../../src/fiche-debit";
  import { DEFAULT_SETTINGS, cleanSettings } from "../../src/machines";
  import MachinesPanel from "../../src/MachinesPanel.svelte";
  import { nextMark, num, quantity, rowsFromPaste } from "../../src/pieces";

  interface Data {
    /** Scie de la bibliothèque Machines ; vide : réglages saisis à la main. */
    machine: string;
    profile: string;
    stock: { length: string; quantity: string }[];
    /** Longueurs des chutes déjà en stock, séparées par des espaces ou des points-virgules. */
    offcuts: string;
    kerf: string;
    trim: string;
    keep: string;
    pieces: { mark: string; length: string; quantity: string }[];
  }

  const DEFAULTS: Data = {
    machine: "",
    profile: "Tube carré 40 × 40 × 2",
    stock: [{ length: "6000", quantity: "" }],
    offcuts: "",
    kerf: "3",
    trim: "0",
    keep: "300",
    pieces: [{ mark: "A", length: "", quantity: "1" }],
  };

  function compute(data: Data): CutPlan | null {
    const pieces = data.pieces
      .map((p) => ({ mark: p.mark || "?", length: num(p.length), quantity: num(p.quantity) || 0 }))
      .filter((p) => p.length > 0 && p.quantity > 0);
    if (!pieces.length) return null;
    // Les lignes vides gardent leur place : l'indice de la pièce sert à sa couleur.
    const all = data.pieces.map((p) => ({ mark: p.mark || "?", length: num(p.length), quantity: num(p.quantity) || 0 }));
    return planCuts(
      data.stock.map((b) => ({ length: num(b.length), quantity: quantity(b.quantity) })).filter((b) => b.length > 0),
      data.offcuts.split(/[\s;]+/).map(num).filter((l) => l > 0),
      all,
      { kerf: num(data.kerf) || 0, trim: num(data.trim) || 0, keepMin: num(data.keep) || 0 },
    );
  }

  const summarize = (plan: CutPlan | null) => {
    if (!plan?.bars.length) return "";
    const bars = plan.bars.filter((b) => b.source === "barre").length;
    const rate = Math.round((plan.piecesLength / plan.usedLength) * 100);
    return `${bars} barre${bars > 1 ? "s" : ""} · ${rate} % utilisé`;
  };

  const doc = new MiniAppDocument<Data>(DEFAULTS, (data) => summarize(compute(data)));

  // Calcul un peu après la dernière frappe : la saisie reste fluide même avec beaucoup de pièces.
  let plan = $state<CutPlan | null>(null);
  let computing = $state(false);
  $effect(() => {
    const snapshot = JSON.parse(JSON.stringify(doc.data)) as Data;
    computing = true;
    const timer = setTimeout(() => {
      plan = compute(snapshot);
      computing = false;
    }, 250);
    return () => clearTimeout(timer);
  });

  const groups = $derived(plan ? groupBars(plan.bars) : []);
  const newBars = $derived(plan ? plan.bars.filter((b) => b.source === "barre") : []);
  const byLength = $derived(
    [...new Set(newBars.map((b) => b.length))].map((length) => ({ length, count: newBars.filter((b) => b.length === length).length })),
  );
  const kept = $derived(plan ? plan.bars.filter((b) => b.reusable).map((b) => b.remnant) : []);

  function addPiece(): void {
    doc.data.pieces.push({ mark: nextMark(doc.data.pieces.map((p) => p.mark)), length: "", quantity: "1" });
  }

  function onpaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData("text") ?? "";
    if (!/[\t\n]/.test(text.trim())) return;
    event.preventDefault();
    const rows = rowsFromPaste(text, 1, doc.data.pieces.map((p) => p.mark));
    const kept = doc.data.pieces.filter((p) => p.length.trim() !== "");
    doc.data.pieces = [...kept, ...rows.map(([mark, length, qty]) => ({ mark: mark!, length: length!, quantity: qty! }))];
    doc.notify(`${rows.length} pièce${rows.length > 1 ? "s" : ""} collée${rows.length > 1 ? "s" : ""}`);
  }

  // Bibliothèques : machines d'Économie, fournisseurs d'Établi. Le calcul marche aussi sans.
  const reglages = new PluginSettings(DEFAULT_SETTINGS, cleanSettings);
  const suppliers = new Suppliers();
  let showMachines = $state(false);

  const saws = $derived(reglages.data.machines.saws);
  const saw = $derived(saws.find((s) => s.id === doc.data.machine));
  const sawOptions = $derived([
    { value: "", label: "Réglages saisis à la main" },
    ...saws.map((s) => ({ value: s.id, label: s.name || "Scie sans nom" })),
  ]);

  /** Choisir une scie reprend son trait de scie et son dressage. */
  function pickSaw(id: string): void {
    const picked = saws.find((s) => s.id === id);
    if (!picked) return;
    doc.data.kerf = picked.kerf;
    doc.data.trim = picked.trim;
  }

  const kindLabel = (kind: string) => STOCK_KINDS.find((k) => k.id === kind)?.label ?? kind;
  const barOffers = $derived(
    suppliers.list.flatMap((s) =>
      s.items
        .filter((item) => item.kind !== "tole" && item.length > 0)
        .map((item) => ({
          value: `${s.id}/${item.id}`,
          label: `${s.name || "Fournisseur"} — ${[kindLabel(item.kind), item.material, item.designation].filter(Boolean).join(" ")} · ${format(item.length, 0)} mm`,
          length: item.length,
        })),
    ),
  );
  let offer = $state("");

  /** Longueur de barre du fournisseur : remplace la ligne vide, sinon s'ajoute. */
  function pickOffer(value: string): void {
    const found = barOffers.find((o) => o.value === value);
    offer = "";
    if (!found) return;
    const empty = doc.data.stock.find((b) => num(b.length) <= 0 || doc.data.stock.length === 1);
    if (empty) empty.length = String(found.length);
    else doc.data.stock.push({ length: String(found.length), quantity: "" });
  }

  function print(): void {
    if (!plan) return;
    printFiche(
      debitFiche({
        title: "",
        profile: doc.data.profile,
        plan,
        pieces: doc.data.pieces.map((p) => ({ mark: p.mark || "?", length: num(p.length), quantity: num(p.quantity) || 0 })),
        colors: colorOf,
        settings: { kerf: num(doc.data.kerf) || 0, trim: num(doc.data.trim) || 0, keepMin: num(doc.data.keep) || 0 },
        machine: saw?.name ?? "",
      }),
    );
  }

  function copyPlan(): void {
    if (!plan) return;
    const lines = [`Plan de débit — ${doc.data.profile}`, ""];
    groups.forEach(({ bar, count }, i) => {
      const label = bar.source === "chute" ? `chute de ${format(bar.length)}` : `barre de ${format(bar.length)}`;
      lines.push(`${i + 1}. ${count} × ${label} : ${bar.cuts.map((c) => `${c.mark} ${format(c.length)}`).join(" | ")}`);
      lines.push(`   reste ${format(bar.remnant)} mm${bar.reusable ? " (à garder)" : ""}`);
    });
    doc.copy(lines.join("\n"));
  }
</script>

<div class="split">
  <div class="inputs">
    <Card title="Barres et réglages">
      <Field label="Profilé" numeric={false} bind:value={doc.data.profile} />
      <div class="table">
        <span class="head">Longueur des barres</span>
        <span class="head">Quantité</span>
        <span></span>
        {#each doc.data.stock as bar, i (i)}
          <Field compact label="Longueur de barre" unit="mm" bind:value={bar.length} />
          <Field compact label="Quantité de barres" placeholder="illimitée" bind:value={bar.quantity} />
          <button class="remove" onclick={() => doc.data.stock.splice(i, 1)} disabled={doc.data.stock.length === 1} aria-label="Retirer cette longueur">✕</button>
        {/each}
      </div>
      <div class="row-actions">
        <button class="btn" onclick={() => doc.data.stock.push({ length: "", quantity: "" })}>+ Autre longueur de barre</button>
        {#if barOffers.length}
          <SelectField
            compact
            label="Longueur d'un fournisseur"
            options={[{ value: "", label: "Longueur d'un fournisseur…" }, ...barOffers]}
            bind:value={offer}
            onchange={pickOffer}
          />
        {/if}
      </div>
      <Field label="Chutes déjà en stock (utilisées en premier)" numeric={false} placeholder="ex. 1200 850 640" unit="mm" bind:value={doc.data.offcuts} />
      <div class="machine">
        <SelectField label="Scie" options={sawOptions} bind:value={doc.data.machine} onchange={pickSaw} />
        <button class="btn" onclick={() => (showMachines = !showMachines)} aria-expanded={showMachines}>
          {showMachines ? "Fermer" : "Machines…"}
        </button>
      </div>
      <div class="three">
        <Field label="Trait de scie" unit="mm" bind:value={doc.data.kerf} />
        <Field label="Dressage en bout" unit="mm" bind:value={doc.data.trim} />
        <Field label="Chute gardée dès" unit="mm" bind:value={doc.data.keep} />
      </div>
    </Card>

    {#if showMachines}
      <Card title="Machines de l'atelier">
        <MachinesPanel store={reglages} kinds={["saws"]} />
      </Card>
    {/if}

    <Card title="Pièces à couper">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="table pieces" {onpaste}>
        <span></span>
        <span class="head">Repère</span>
        <span class="head">Longueur</span>
        <span class="head">Qté</span>
        <span></span>
        {#each doc.data.pieces as piece, i (i)}
          <span class="swatch" style:background={colorOf(i)}></span>
          <Field compact numeric={false} label="Repère" bind:value={piece.mark} />
          <Field compact label="Longueur" unit="mm" bind:value={piece.length} />
          <Field compact label="Quantité" bind:value={piece.quantity} />
          <button class="remove" onclick={() => doc.data.pieces.splice(i, 1)} disabled={doc.data.pieces.length === 1} aria-label="Retirer la pièce {piece.mark}">✕</button>
        {/each}
      </div>
      <button class="btn" onclick={addPiece}>+ Ajouter une pièce</button>
      <p class="hint">Astuce : collez directement des lignes copiées depuis Excel (repère, longueur, quantité).</p>
    </Card>
  </div>

  <Card title="Plan de débit">
    {#snippet actions()}
      {#if plan?.bars.length}
        <button class="btn" onclick={copyPlan}>Copier le plan</button>
        <button class="btn primary" onclick={print}>Imprimer la fiche</button>
      {/if}
    {/snippet}
    {#if plan && (plan.bars.length || plan.unplaced.length)}
      <div class="kpis" class:stale={computing}>
        <div class="kpi main">
          <span>Barres neuves</span>
          <b>{newBars.length}</b>
          <small>{byLength.map((g) => `${g.count} × ${format(g.length)} mm`).join(" + ") || "aucune"}</small>
        </div>
        <div class="kpi">
          <span>Utilisation</span>
          <b>{plan.usedLength ? format((plan.piecesLength / plan.usedLength) * 100, 1) : "—"} %</b>
        </div>
        <div class="kpi">
          <span>Perte</span>
          <b>{format(plan.waste, 0)} mm</b>
          <small>traits de scie et chutes trop courtes</small>
        </div>
        <div class="kpi">
          <span>Chutes à garder</span>
          <b>{kept.length}</b>
          <small>{kept.map((l) => format(l, 0)).join(", ") || "aucune"}</small>
        </div>
      </div>

      {#if plan.unplaced.length}
        <p class="warn">
          {plan.unplaced.length} pièce{plan.unplaced.length > 1 ? "s" : ""} non placée{plan.unplaced.length > 1 ? "s" : ""} :
          {plan.unplaced.map((c) => `${c.mark} (${format(c.length)} mm)`).join(", ")}. Trop longues, ou plus assez de barres.
        </p>
      {/if}

      <div class="bars" class:stale={computing}>
        {#each groups as { bar, count }, i (i)}
          <div class="row">
            <span class="label">
              {count > 1 ? `${count} ×` : ""}
              {bar.source === "chute" ? "chute" : "barre"}
              <small>{format(bar.length, 0)}</small>
            </span>
            <div class="bar">
              {#each bar.cuts as cut, j (j)}
                <span
                  class="cut"
                  style:width="{(cut.length / bar.length) * 100}%"
                  style:background={colorOf(cut.piece)}
                  title="{cut.mark} — {format(cut.length)} mm"
                >{cut.mark} {format(cut.length, 0)}</span>
              {/each}
            </div>
            <span class="rest" class:keep={bar.reusable} title={bar.reusable ? "Chute à garder" : "Perte"}>
              {format(bar.remnant, 0)}
            </span>
          </div>
        {/each}
      </div>
      <p class="hint">Longueurs en mm. En vert : chutes à garder (≥ {format(num(doc.data.keep) || 0, 0)} mm). Traits de scie inclus.</p>
    {:else}
      <p class="empty">Ajoutez les longueurs à couper : le plan de débit s'affiche ici, barre par barre.</p>
    {/if}
  </Card>
</div>

<style>
  .split {
    display: grid;
    grid-template-columns: minmax(340px, 400px) 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 820px) {
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
    grid-template-columns: 1fr 110px 28px;
    gap: 4px 6px;
    align-items: center;
  }
  .table.pieces {
    grid-template-columns: 10px 70px 1fr 64px 28px;
  }
  .head {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--faint);
  }
  .swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  .three {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
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
  .machine {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: end;
  }
  /* Même hauteur que le sélecteur voisin. */
  .machine .btn {
    height: 36px;
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
  .bars {
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: opacity 0.15s;
  }
  .row {
    display: grid;
    grid-template-columns: 86px 1fr 52px;
    gap: 10px;
    align-items: center;
  }
  .label {
    font-size: 12px;
    color: var(--muted);
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .label small {
    font-family: var(--mono);
    color: var(--faint);
  }
  .bar {
    height: 30px;
    display: flex;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: repeating-linear-gradient(135deg, var(--field) 0 6px, var(--surface-2) 6px 12px);
  }
  .cut {
    height: 100%;
    display: grid;
    place-items: center;
    min-width: 0;
    overflow: hidden;
    border-right: 2px solid var(--surface);
    color: #fff;
    font: 600 11px var(--mono);
    white-space: nowrap;
  }
  .rest {
    text-align: right;
    font: 500 12px var(--mono);
    color: var(--faint);
  }
  .rest.keep {
    color: var(--ok);
    font-weight: 700;
  }
</style>
