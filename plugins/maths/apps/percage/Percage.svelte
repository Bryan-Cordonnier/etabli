<script lang="ts">
  // Perçage sur cercle (bride, couronne, flasque) : coordonnées de chaque trou et entraxe.
  import { Card, Field, MiniAppDocument, Result, Segmented, evaluate, format } from "@etabli/ui";
  import { boltCircle, type BoltCircle } from "../../src/formes";

  interface Data {
    count: string;
    diameter: string;
    hole: string;
    startAngle: string;
    arc: boolean;
    span: string;
    clockwise: boolean;
    cx: string;
    cy: string;
  }

  const DEFAULTS: Data = { count: "6", diameter: "", hole: "", startAngle: "0", arc: false, span: "120", clockwise: false, cx: "0", cy: "0" };

  const value = (text: string, fallback: number) => (text.trim() === "" ? fallback : evaluate(text));

  function solve(d: Data): BoltCircle | string {
    if (d.diameter.trim() === "") return "Renseignez le nombre de trous et le diamètre du cercle de perçage.";
    const input = {
      count: value(d.count, NaN),
      diameter: value(d.diameter, NaN),
      startAngle: value(d.startAngle, 0),
      span: d.arc ? value(d.span, NaN) : 360,
      clockwise: d.clockwise,
      cx: value(d.cx, 0),
      cy: value(d.cy, 0),
    };
    for (const [label, v] of [["Le nombre de trous", input.count], ["Le diamètre", input.diameter], ["L'angle", input.startAngle], ["La position du centre", input.cx + input.cy]] as const) {
      if (!Number.isFinite(v)) return `${label} n'est pas un nombre valide.`;
    }
    return boltCircle(input);
  }

  const doc = new MiniAppDocument<Data>(DEFAULTS, (d) => {
    const r = solve(d);
    return typeof r === "string" ? "" : `${r.holes.length} trous sur Ø ${format(evaluate(d.diameter))} · entraxe ${format(r.pitch)} mm`;
  });

  const result = $derived(solve(doc.data));
  const circle = $derived(typeof result === "string" ? null : result);
  const center = $derived({ x: value(doc.data.cx, 0), y: value(doc.data.cy, 0) });
  const holeDiameter = $derived(Math.max(0, value(doc.data.hole, 0) || 0));

  const SPREAD = [
    { value: "full", label: "Cercle complet" },
    { value: "arc", label: "Sur un arc" },
  ] as const;
  const DIRECTIONS = [
    { value: "ccw", label: "Anti-horaire" },
    { value: "cw", label: "Horaire" },
  ] as const;

  function copyTable(): void {
    if (!circle) return;
    const lines = ["N°\tAngle (°)\tX (mm)\tY (mm)", ...circle.holes.map((h) => `${h.n}\t${format(h.angle, 3)}\t${format(h.x, 3)}\t${format(h.y, 3)}`)];
    doc.copy(lines.join("\n"));
  }

  // Schéma à l'échelle : cercle de perçage, axes, trous numérotés (le premier en couleur).
  const drawing = $derived.by(() => {
    if (!circle) return null;
    const D = evaluate(doc.data.diameter);
    const size = 300;
    const scale = (size * 0.78) / D;
    const c = size / 2;
    const hole = Math.max(5, (holeDiameter || D / 12) * scale * 0.5);
    return {
      size,
      c,
      r: (D / 2) * scale,
      hole,
      points: circle.holes.map((h) => ({
        n: h.n,
        x: c + (h.x - center.x) * scale,
        // Y vers le haut, comme sur un plan.
        y: c - (h.y - center.y) * scale,
        lx: c + (h.x - center.x) * scale * 1.2,
        ly: c - (h.y - center.y) * scale * 1.2,
      })),
    };
  });
</script>

<div class="split">
  <Card title="Entrées">
    <div class="two">
      <Field label="Nombre de trous" bind:value={doc.data.count} />
      <Field label="Ø du cercle de perçage" unit="mm" bind:value={doc.data.diameter} placeholder="ex. 200" />
    </div>
    <Field label="Angle du premier trou" unit="°" bind:value={doc.data.startAngle} />
    <Segmented
      label="Répartition"
      options={[...SPREAD]}
      value={doc.data.arc ? "arc" : "full"}
      onchange={(v) => (doc.data.arc = v === "arc")}
    />
    {#if doc.data.arc}
      <Field label="Angle entre le premier et le dernier trou" unit="°" bind:value={doc.data.span} />
    {/if}
    <Segmented label="Sens" options={[...DIRECTIONS]} value={doc.data.clockwise ? "cw" : "ccw"} onchange={(v) => (doc.data.clockwise = v === "cw")} />
    <div class="two">
      <Field label="Centre X" unit="mm" bind:value={doc.data.cx} />
      <Field label="Centre Y" unit="mm" bind:value={doc.data.cy} />
    </div>
    <Field label="Ø des trous (pour le schéma)" unit="mm" bind:value={doc.data.hole} placeholder="facultatif" />
    <p class="hint">
      0° = trou à droite du centre (3 h), 90° = en haut. Centre X / Y : cotes du centre depuis l'origine de la pièce (un coin,
      par exemple) pour lire directement les cotes de traçage ou de la table croisée.
    </p>
  </Card>

  <Card title="Résultats">
    {#snippet actions()}
      {#if circle}<button class="btn" onclick={copyTable}>Copier le tableau</button>{/if}
    {/snippet}
    {#if circle && drawing}
      {@const d = drawing}
      <Result label="Entraxe entre deux trous voisins" value={circle.pitch} unit="mm" big oncopy={doc.copy} />
      <div class="grid">
        <Result label="Angle entre deux trous" value={circle.step} unit="°" oncopy={doc.copy} />
        <Result label="Arc entre deux trous" value={circle.arcPitch} unit="mm" oncopy={doc.copy} />
      </div>
      <div class="body">
        <svg viewBox="0 0 {d.size} {d.size}" role="img" aria-label="Schéma du perçage">
          <line class="axis" x1="10" y1={d.c} x2={d.size - 10} y2={d.c} />
          <line class="axis" x1={d.c} y1="10" x2={d.c} y2={d.size - 10} />
          <circle class="pcd" cx={d.c} cy={d.c} r={d.r} />
          {#each d.points as p (p.n)}
            <circle class="hole" class:first={p.n === 1} cx={p.x} cy={p.y} r={d.hole} />
            <text x={p.lx} y={p.ly} dominant-baseline="middle" text-anchor="middle">{p.n}</text>
          {/each}
        </svg>
        <table>
          <thead>
            <tr><th>N°</th><th class="r">Angle</th><th class="r">X</th><th class="r">Y</th></tr>
          </thead>
          <tbody>
            {#each circle.holes as h (h.n)}
              <tr>
                <td>{h.n}</td>
                <td class="r">{format(h.angle, 2)}°</td>
                <td class="r"><button onclick={() => doc.copy(format(h.x, 3))} title="Copier">{format(h.x, 2)}</button></td>
                <td class="r"><button onclick={() => doc.copy(format(h.y, 3))} title="Copier">{format(h.y, 2)}</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="empty">{result}</p>
    {/if}
  </Card>
</div>

<style>
  .split {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 720px) {
    .split {
      grid-template-columns: 1fr;
    }
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 8px;
  }
  .body {
    display: grid;
    grid-template-columns: minmax(200px, 300px) 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .body {
      grid-template-columns: 1fr;
    }
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
    max-width: 300px;
  }
  .axis {
    stroke: var(--faint);
    stroke-width: 1;
    stroke-dasharray: 8 3 2 3;
  }
  .pcd {
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.2;
    stroke-dasharray: 6 4;
  }
  .hole {
    fill: var(--surface);
    stroke: var(--text);
    stroke-width: 1.8;
  }
  .hole.first {
    fill: var(--accent-soft);
    stroke: var(--accent);
  }
  text {
    font: 600 12px var(--mono);
    fill: var(--muted);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--faint);
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 2px 8px;
    border-bottom: 1px solid var(--border);
    font-family: var(--mono);
  }
  .r {
    text-align: right;
  }
  td button {
    border: 0;
    background: none;
    padding: 3px 6px;
    margin: 0 -6px;
    border-radius: var(--r-xs);
    font: 500 13px var(--mono);
    color: var(--text);
    cursor: copy;
  }
  td button:hover {
    background: var(--accent-soft);
  }
</style>
