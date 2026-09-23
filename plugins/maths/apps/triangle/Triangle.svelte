<script lang="ts">
  import { Card, Field, MiniAppDocument, Result, Segmented, evaluate, format } from "@etabli/ui";
  import { solveTriangle, type Triangle, type TriangleInput } from "../../src/geometry";

  const KEYS = ["a", "b", "c", "A", "B", "C"] as const;
  type Key = (typeof KEYS)[number];
  type Data = Record<Key, string>;

  function solve(data: Data) {
    const input: TriangleInput = {};
    for (const key of KEYS) if (data[key].trim() !== "") input[key] = evaluate(data[key]);
    return solveTriangle(input);
  }

  const summarize = (data: Data) => {
    const result = solve(data);
    if (!("solutions" in result)) return "";
    const t = result.solutions[0]!;
    return `a ${format(t.a)} · b ${format(t.b)} · c ${format(t.c)} mm`;
  };

  const doc = new MiniAppDocument<Data>({ a: "", b: "", c: "", A: "", B: "", C: "" }, summarize);

  const result = $derived(solve(doc.data));
  let choice = $state("0");
  const solutions = $derived("solutions" in result ? result.solutions : []);
  const t = $derived<Triangle | undefined>(solutions[Number(choice)] ?? solutions[0]);

  /** Valeur calculée affichée en filigrane dans les champs laissés vides. */
  const hint = (key: Key, unit: string) => (t && doc.data[key].trim() === "" ? `${format(t[key])} ${unit}` : "");

  // Schéma : côté c à plat, sommet C au-dessus, à l'échelle dans un cadre de 420 × 240.
  const drawing = $derived.by(() => {
    if (!t) return null;
    const cx = t.b * Math.cos((t.A * Math.PI) / 180);
    const cy = t.b * Math.sin((t.A * Math.PI) / 180);
    const minX = Math.min(0, cx);
    const maxX = Math.max(t.c, cx);
    const scale = Math.min(320 / (maxX - minX), 170 / cy);
    const X = (x: number) => 50 + (x - minX) * scale;
    const Y = (y: number) => 205 - y * scale;
    return { A: [X(0), Y(0)], B: [X(t.c), Y(0)], C: [X(cx), Y(cy)] } as const;
  });
</script>

<div class="split">
  <Card title="Entrées">
    <div class="pairs">
      <Field label="Côté a" unit="mm" bind:value={doc.data.a} placeholder={hint("a", "mm")} />
      <Field label="Angle A (opposé à a)" unit="°" bind:value={doc.data.A} placeholder={hint("A", "°")} />
      <Field label="Côté b" unit="mm" bind:value={doc.data.b} placeholder={hint("b", "mm")} />
      <Field label="Angle B (opposé à b)" unit="°" bind:value={doc.data.B} placeholder={hint("B", "°")} />
      <Field label="Côté c" unit="mm" bind:value={doc.data.c} placeholder={hint("c", "mm")} />
      <Field label="Angle C (opposé à c)" unit="°" bind:value={doc.data.C} placeholder={hint("C", "°")} />
    </div>
    <p class="hint">Renseignez 3 valeurs, dont au moins un côté. Les calculs sont acceptés : <code>1200 - 2*15</code></p>
  </Card>

  <Card title="Résultats">
    {#if t}
      {#if solutions.length > 1}
        <p class="warn">Deux triangles répondent à ces valeurs : choisissez celui qui correspond à votre pièce.</p>
        <Segmented
          label="Solution"
          bind:value={choice}
          options={solutions.map((_, i) => ({ value: String(i), label: `Solution ${i + 1}` }))}
        />
      {/if}
      <div class="grid">
        <Result label="Côté a" value={t.a} unit="mm" oncopy={doc.copy} />
        <Result label="Angle A" value={t.A} unit="°" oncopy={doc.copy} />
        <Result label="Côté b" value={t.b} unit="mm" oncopy={doc.copy} />
        <Result label="Angle B" value={t.B} unit="°" oncopy={doc.copy} />
        <Result label="Côté c" value={t.c} unit="mm" oncopy={doc.copy} />
        <Result label="Angle C" value={t.C} unit="°" oncopy={doc.copy} />
        <Result label="Aire" value={t.area} unit="mm²" oncopy={doc.copy} />
        <Result label="Périmètre" value={t.perimeter} unit="mm" oncopy={doc.copy} />
      </div>
      <details>
        <summary>Hauteurs</summary>
        <div class="grid">
          <Result label="Hauteur issue de A" value={t.ha} unit="mm" oncopy={doc.copy} />
          <Result label="Hauteur issue de B" value={t.hb} unit="mm" oncopy={doc.copy} />
          <Result label="Hauteur issue de C" value={t.hc} unit="mm" oncopy={doc.copy} />
        </div>
      </details>
      {#if drawing}
        {@const d = drawing}
        <svg viewBox="0 0 420 240" role="img" aria-label="Schéma du triangle">
          <path class="shape" d="M{d.A[0]} {d.A[1]} L{d.B[0]} {d.B[1]} L{d.C[0]} {d.C[1]} Z" />
          <text x={d.A[0] - 14} y={d.A[1] + 16}>A</text>
          <text x={d.B[0] + 6} y={d.B[1] + 16}>B</text>
          <text x={d.C[0] - 4} y={d.C[1] - 10}>C</text>
          <text class="side" x={(d.A[0] + d.B[0]) / 2} y={d.A[1] + 22} text-anchor="middle">c = {format(t.c)}</text>
          <text class="side" x={(d.B[0] + d.C[0]) / 2 + 8} y={(d.B[1] + d.C[1]) / 2} >a = {format(t.a)}</text>
          <text class="side" x={(d.A[0] + d.C[0]) / 2 - 8} y={(d.A[1] + d.C[1]) / 2} text-anchor="end">b = {format(t.b)}</text>
        </svg>
      {/if}
    {:else}
      <p class="empty">{"error" in result ? result.error : ""}</p>
    {/if}
  </Card>
</div>

<style>
  .split {
    display: grid;
    grid-template-columns: 380px 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 760px) {
    .split {
      grid-template-columns: 1fr;
    }
  }
  .pairs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 10px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 8px;
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
  .warn {
    margin: 0;
    padding: 8px 12px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--warn) 14%, transparent);
    font-size: 13px;
  }
  code {
    font-family: var(--mono);
    color: var(--muted);
  }
  details summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 13px;
    margin-bottom: 8px;
  }
  svg {
    width: 100%;
    max-width: 440px;
    align-self: center;
  }
  .shape {
    fill: color-mix(in srgb, var(--accent) 10%, transparent);
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-linejoin: round;
  }
  text {
    font: 600 13px var(--mono);
    fill: var(--text);
  }
  .side {
    font-weight: 500;
    fill: var(--muted);
  }
</style>
