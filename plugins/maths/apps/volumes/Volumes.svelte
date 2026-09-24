<script lang="ts">
  // Volumes et contenances : cuve, bac, trémie ronde ou rectangulaire, réservoir sphérique.
  // Volume plein ou à une hauteur de liquide, barème de jaugeage, surfaces de tôle.
  import { Card, Field, MiniAppDocument, Result, Segmented, evaluate, format } from "@etabli/ui";
  import { gaugeTable, volume, type ShapeInput, type ShapeKind, type Volume } from "../../src/volumes";

  interface Data {
    kind: ShapeKind;
    d1: string;
    d2: string;
    a: string;
    b: string;
    a2: string;
    b2: string;
    h: string;
    horizontal: boolean;
    fill: string;
    step: string;
  }

  const DEFAULTS: Data = { kind: "cylindre", d1: "", d2: "", a: "", b: "", a2: "", b2: "", h: "", horizontal: false, fill: "", step: "100" };

  const SHAPES: { value: ShapeKind; label: string }[] = [
    { value: "cylindre", label: "Cylindre" },
    { value: "bac", label: "Bac" },
    { value: "cone", label: "Trémie ronde" },
    { value: "tremie", label: "Trémie carrée" },
    { value: "sphere", label: "Sphère" },
  ];

  const num = (text: string) => (text.trim() === "" ? NaN : evaluate(text));
  const input = (d: Data): ShapeInput => ({
    kind: d.kind,
    d1: num(d.d1),
    d2: d.d2.trim() === "" ? 0 : num(d.d2),
    a: num(d.a),
    b: num(d.b),
    a2: num(d.a2),
    b2: num(d.b2),
    h: num(d.h),
    horizontal: d.horizontal,
    fill: num(d.fill),
  });

  function solve(d: Data): Volume | string {
    const needed: Record<ShapeKind, (keyof Data)[]> = {
      cylindre: ["d1", "h"],
      bac: ["a", "b", "h"],
      cone: ["d1", "h"],
      tremie: ["a", "b", "a2", "b2", "h"],
      sphere: ["d1"],
    };
    if (needed[d.kind].some((k) => String(d[k]).trim() === "")) return "Renseignez les dimensions intérieures de la cuve.";
    return volume(input(d));
  }

  const doc = new MiniAppDocument<Data>(DEFAULTS, (d) => {
    const v = solve(d);
    if (typeof v === "string") return "";
    return d.fill.trim() !== "" ? `${format(v.filled, 1)} L sur ${format(v.total, 1)} L` : `${format(v.total, 1)} L`;
  });

  const result = $derived(solve(doc.data));
  const v = $derived(typeof result === "string" ? null : result);
  const partial = $derived(doc.data.fill.trim() !== "");
  const kind = $derived(doc.data.kind);
  const table = $derived(v ? gaugeTable(input(doc.data), num(doc.data.step)) : []);
  let showTable = $state(false);

  function copyTable(): void {
    doc.copy(["Hauteur (mm)\tVolume (L)", ...table.map((r) => `${format(r.height, 1)}\t${format(r.litres, 1)}`)].join("\n"));
  }

  // Schéma en coupe : la cuve et le liquide à la hauteur saisie.
  const drawing = $derived.by(() => {
    if (!v) return null;
    const d = input(doc.data);
    const [W, H] = [240, 170];
    const level = partial ? Math.min(1, Math.max(0, d.fill / v.depth)) : 1;
    if (kind === "cylindre" && d.horizontal) {
      const r = Math.min(W, H) / 2 - 6;
      return { type: "round" as const, W, H, r, level };
    }
    if (kind === "sphere") return { type: "round" as const, W, H, r: H / 2 - 6, level };
    // Profil en coupe (haut → bas) : largeur en haut et en bas, rapportées à la plus grande.
    const [top, bottom, height] =
      kind === "cylindre" ? [d.d1, d.d1, d.h] : kind === "bac" ? [d.a, d.a, d.h] : kind === "cone" ? [d.d1, d.d2, d.h] : [d.a2, d.a, d.h];
    const scale = Math.min((W - 20) / Math.max(top, bottom), (H - 12) / height);
    return { type: "profile" as const, W, H, top: top * scale, bottom: bottom * scale, height: height * scale, level };
  });
</script>

<div class="split">
  <Card title="Cuve">
    <Segmented label="Forme" options={SHAPES} bind:value={doc.data.kind} />
    {#if kind === "cylindre"}
      <Segmented
        label="Position"
        options={[
          { value: "debout", label: "Debout" },
          { value: "couche", label: "Couchée" },
        ]}
        value={doc.data.horizontal ? "couche" : "debout"}
        onchange={(p) => (doc.data.horizontal = p === "couche")}
      />
      <div class="two">
        <Field label="Ø intérieur" unit="mm" bind:value={doc.data.d1} />
        <Field label={doc.data.horizontal ? "Longueur" : "Hauteur"} unit="mm" bind:value={doc.data.h} />
      </div>
    {:else if kind === "bac"}
      <div class="three">
        <Field label="Longueur" unit="mm" bind:value={doc.data.a} />
        <Field label="Largeur" unit="mm" bind:value={doc.data.b} />
        <Field label="Hauteur" unit="mm" bind:value={doc.data.h} />
      </div>
    {:else if kind === "cone"}
      <div class="three">
        <Field label="Ø en haut" unit="mm" bind:value={doc.data.d1} />
        <Field label="Ø en bas" unit="mm" bind:value={doc.data.d2} placeholder="0 : pointe" />
        <Field label="Hauteur" unit="mm" bind:value={doc.data.h} />
      </div>
    {:else if kind === "tremie"}
      <div class="two">
        <Field label="Longueur en haut" unit="mm" bind:value={doc.data.a2} />
        <Field label="Largeur en haut" unit="mm" bind:value={doc.data.b2} />
        <Field label="Longueur en bas" unit="mm" bind:value={doc.data.a} />
        <Field label="Largeur en bas" unit="mm" bind:value={doc.data.b} />
      </div>
      <Field label="Hauteur" unit="mm" bind:value={doc.data.h} />
    {:else}
      <Field label="Ø intérieur" unit="mm" bind:value={doc.data.d1} />
    {/if}
    <Field label="Hauteur de liquide" unit="mm" bind:value={doc.data.fill} placeholder="vide : cuve pleine" />
    <p class="hint">
      Dimensions intérieures. Hauteur de liquide mesurée depuis le point le plus bas (la pige). Les trémies se remplissent
      par le bas, pointe en bas.
    </p>
  </Card>

  <Card title="Contenance">
    {#if v}
      {#if partial}
        <Result label="Volume à cette hauteur" value={v.filled} unit="L" decimals={1} big oncopy={doc.copy} />
        <div class="grid">
          <Result label="Remplissage" value={(v.filled / v.total) * 100} unit="%" decimals={1} oncopy={doc.copy} />
          <Result label="Volume total" value={v.total} unit="L" decimals={1} oncopy={doc.copy} />
          <Result label="Place restante" value={v.total - v.filled} unit="L" decimals={1} oncopy={doc.copy} />
        </div>
      {:else}
        <Result label="Volume total" value={v.total} unit="L" decimals={1} big oncopy={doc.copy} />
      {/if}
      <div class="grid">
        <Result label="Volume total" value={v.total / 1000} unit="m³" decimals={3} oncopy={doc.copy} />
        <Result label="Masse d'eau" value={partial ? v.filled : v.total} unit="kg" decimals={1} oncopy={doc.copy} />
      </div>

      <h4>Surfaces de tôle</h4>
      <div class="grid">
        <Result label={kind === "cylindre" ? "Virole" : kind === "sphere" ? "Sphère" : "Parois"} value={v.wall} unit="m²" decimals={3} oncopy={doc.copy} />
        {#if kind !== "sphere"}
          <Result label="Fond" value={v.bottom} unit="m²" decimals={3} oncopy={doc.copy} />
          <Result label="Dessus (si fermé)" value={v.top} unit="m²" decimals={3} oncopy={doc.copy} />
          <Result label="Total fermé" value={v.wall + v.bottom + v.top} unit="m²" decimals={3} oncopy={doc.copy} />
        {/if}
      </div>

      {#if drawing}
        {@const d = drawing}
        <svg viewBox="0 0 {d.W} {d.H}" role="img" aria-label="Coupe de la cuve">
          <defs>
            {#if d.type === "round"}
              <clipPath id="liquide"><rect x="0" y={d.H / 2 + d.r - 2 * d.r * d.level} width={d.W} height={d.H} /></clipPath>
            {:else}
              <clipPath id="liquide"><rect x="0" y={(d.H + d.height) / 2 - d.height * d.level} width={d.W} height={d.H} /></clipPath>
            {/if}
          </defs>
          {#if d.type === "round"}
            <circle class="liquid" cx={d.W / 2} cy={d.H / 2} r={d.r} clip-path="url(#liquide)" />
            <circle class="tank" cx={d.W / 2} cy={d.H / 2} r={d.r} />
          {:else}
            {@const y0 = (d.H - d.height) / 2}
            {@const points = `${(d.W - d.top) / 2},${y0} ${(d.W + d.top) / 2},${y0} ${(d.W + d.bottom) / 2},${y0 + d.height} ${(d.W - d.bottom) / 2},${y0 + d.height}`}
            <polygon class="liquid" {points} clip-path="url(#liquide)" />
            <polygon class="tank" {points} />
          {/if}
        </svg>
      {/if}

      <div class="gauge">
        <button class="btn" onclick={() => (showTable = !showTable)} aria-expanded={showTable}>
          {showTable ? "Masquer" : "Barème de jaugeage"}
        </button>
        {#if showTable}
          <Field label="Tous les" unit="mm" compact bind:value={doc.data.step} />
          <button class="btn" onclick={copyTable} disabled={!table.length}>Copier le barème</button>
        {/if}
      </div>
      {#if showTable && table.length}
        <table>
          <thead><tr><th class="r">Hauteur (mm)</th><th class="r">Volume (L)</th><th class="r">Remplissage</th></tr></thead>
          <tbody>
            {#each table as row (row.height)}
              <tr>
                <td class="r">{format(row.height, 1)}</td>
                <td class="r">{format(row.litres, 1)}</td>
                <td class="r">{format((row.litres / v.total) * 100, 1)} %</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {:else}
      <p class="empty">{result}</p>
    {/if}
  </Card>
</div>

<style>
  .split {
    display: grid;
    grid-template-columns: 360px 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 760px) {
    .split {
      grid-template-columns: 1fr;
    }
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
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 8px;
  }
  h4 {
    margin: 4px 0 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
  }
  .hint,
  .empty {
    margin: 0;
    font-size: 12.5px;
    color: var(--faint);
  }
  .empty {
    padding: 24px 0;
    text-align: center;
  }
  svg {
    width: 100%;
    max-width: 260px;
    align-self: center;
  }
  .tank {
    fill: none;
    stroke: var(--text);
    stroke-width: 2.5;
    stroke-linejoin: round;
  }
  .liquid {
    fill: color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .gauge {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .gauge :global(.field) {
    width: 130px;
  }
  table {
    width: 100%;
    max-width: 420px;
    border-collapse: collapse;
    font: 500 13px var(--mono);
  }
  th {
    font: 600 11.5px var(--font);
    color: var(--faint);
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  .r {
    text-align: right;
  }
</style>
