<script lang="ts">
  import { Card, Field, MiniAppDocument, Result, evaluate, format } from "@etabli/ui";
  import { solveArc, type Arc, type ArcInput } from "../../src/geometry";

  const KEYS = ["chord", "sagitta", "radius", "angle", "length"] as const;
  type Key = (typeof KEYS)[number];
  type Data = Record<Key, string>;

  function solve(data: Data): Arc | string {
    const input: ArcInput = {};
    for (const key of KEYS) if (data[key].trim() !== "") input[key] = evaluate(data[key]);
    return solveArc(input);
  }

  const doc = new MiniAppDocument<Data>(
    { chord: "", sagitta: "", radius: "", angle: "", length: "" },
    (data) => {
      const arc = solve(data);
      return typeof arc === "string" ? "" : `R ${format(arc.radius)} mm · arc ${format(arc.length)} mm`;
    },
  );

  const result = $derived(solve(doc.data));
  const arc = $derived(typeof result === "string" ? null : result);
  const hint = (key: Key, unit: string) => (arc && doc.data[key].trim() === "" ? `${format(arc[key])} ${unit}` : "");

  // Schéma : l'arc, sa corde et sa flèche, à l'échelle dans un cadre de 420 × 220.
  const drawing = $derived.by(() => {
    if (!arc) return null;
    const half = (arc.angle * Math.PI) / 360;
    // Boîte englobante de l'arc (vu depuis son centre, arc vers le haut).
    const width = arc.angle >= 180 ? 2 * arc.radius : arc.chord;
    const scale = Math.min(340 / width, 170 / arc.sagitta);
    const r = arc.radius * scale;
    const cx = 210;
    const baseY = 195;
    const cy = baseY + r * Math.cos(half);
    const x1 = cx - r * Math.sin(half);
    const x2 = cx + r * Math.sin(half);
    const large = arc.angle > 180 ? 1 : 0;
    return { path: `M${x1} ${baseY} A${r} ${r} 0 ${large} 1 ${x2} ${baseY}`, x1, x2, baseY, top: baseY - arc.sagitta * scale, cx };
  });
</script>

<div class="split">
  <Card title="Entrées">
    <Field label="Corde" unit="mm" bind:value={doc.data.chord} placeholder={hint("chord", "mm")} />
    <Field label="Flèche" unit="mm" bind:value={doc.data.sagitta} placeholder={hint("sagitta", "mm")} />
    <Field label="Rayon" unit="mm" bind:value={doc.data.radius} placeholder={hint("radius", "mm")} />
    <Field label="Angle au centre" unit="°" bind:value={doc.data.angle} placeholder={hint("angle", "°")} />
    <Field label="Longueur d'arc" unit="mm" bind:value={doc.data.length} placeholder={hint("length", "mm")} />
    <p class="hint">Renseignez deux valeurs, les trois autres sont calculées. Utile pour le roulage d'une virole ou d'un fer plat.</p>
  </Card>

  <Card title="Résultats">
    {#if arc}
      <Result label="Rayon" value={arc.radius} unit="mm" big oncopy={doc.copy} />
      <div class="grid">
        <Result label="Diamètre" value={arc.radius * 2} unit="mm" oncopy={doc.copy} />
        <Result label="Corde" value={arc.chord} unit="mm" oncopy={doc.copy} />
        <Result label="Flèche" value={arc.sagitta} unit="mm" oncopy={doc.copy} />
        <Result label="Angle au centre" value={arc.angle} unit="°" oncopy={doc.copy} />
        <Result label="Longueur d'arc" value={arc.length} unit="mm" oncopy={doc.copy} />
        <Result label="Aire du segment" value={arc.segmentArea} unit="mm²" oncopy={doc.copy} />
      </div>
      {#if drawing}
        {@const d = drawing}
        <svg viewBox="0 0 420 220" role="img" aria-label="Schéma de l'arc">
          <path class="arc" d={d.path} />
          <line class="chord" x1={d.x1} y1={d.baseY} x2={d.x2} y2={d.baseY} />
          <line class="sagitta" x1={d.cx} y1={d.baseY} x2={d.cx} y2={d.top} />
          <text x={d.cx} y={d.baseY + 20} text-anchor="middle">corde {format(arc.chord)}</text>
          <text x={d.cx + 8} y={(d.baseY + d.top) / 2}>flèche {format(arc.sagitta)}</text>
        </svg>
      {/if}
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
  svg {
    width: 100%;
    max-width: 440px;
    align-self: center;
  }
  .arc {
    fill: none;
    stroke: var(--accent);
    stroke-width: 3;
  }
  .chord {
    stroke: var(--muted);
    stroke-width: 1.5;
  }
  .sagitta {
    stroke: var(--warn);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }
  text {
    font: 500 12.5px var(--mono);
    fill: var(--muted);
  }
</style>
