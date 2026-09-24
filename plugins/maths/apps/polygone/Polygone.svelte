<script lang="ts">
  // Polygone régulier : écrou, plaque hexagonale, cadre à n pans. Une dimension connue, le reste calculé.
  import { Card, Field, MiniAppDocument, Result, evaluate, format } from "@etabli/ui";
  import { solvePolygon, type Polygon, type PolygonKey } from "../../src/formes";

  interface Data {
    sides: string;
    side: string;
    flats: string;
    corners: string;
    area: string;
  }

  const KEYS: PolygonKey[] = ["side", "flats", "corners", "area"];
  const QUICK = [3, 4, 5, 6, 8, 12];

  function solve(d: Data): Polygon | string {
    const filled = KEYS.filter((k) => d[k].trim() !== "");
    if (!filled.length) return "Renseignez une dimension : côté, sur plats, sur angles ou aire.";
    if (filled.length > 1) return "Renseignez une seule dimension : les autres sont calculées.";
    const key = filled[0]!;
    const n = evaluate(d.sides);
    const v = evaluate(d[key]);
    if (!Number.isFinite(n) || !Number.isFinite(v)) return "Valeur non reconnue.";
    return solvePolygon(n, key, v);
  }

  const doc = new MiniAppDocument<Data>({ sides: "6", side: "", flats: "", corners: "", area: "" }, (d) => {
    const p = solve(d);
    return typeof p === "string" ? "" : `${p.sides} côtés · côté ${format(p.side)} · sur angles ${format(p.corners)} mm`;
  });

  const result = $derived(solve(doc.data));
  const polygon = $derived(typeof result === "string" ? null : result);
  const hint = (key: PolygonKey) => (polygon && doc.data[key].trim() === "" ? format(polygon[key]) : "");
  const even = $derived(polygon ? polygon.sides % 2 === 0 : true);

  // Schéma : polygone avec cercles inscrit et circonscrit, un plat en bas.
  const drawing = $derived.by(() => {
    if (!polygon) return null;
    const size = 260;
    const c = size / 2;
    const R = size * 0.4;
    const r = R * Math.cos(Math.PI / polygon.sides);
    // Premier sommet placé pour qu'un côté soit horizontal en bas.
    const offset = Math.PI / 2 + Math.PI / polygon.sides;
    const points = Array.from({ length: Math.min(polygon.sides, 200) }, (_, i) => {
      const a = offset + (2 * Math.PI * i) / polygon.sides;
      return `${(c + R * Math.cos(a)).toFixed(1)},${(c + R * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
    return { size, c, R, r, points };
  });
</script>

<div class="split">
  <Card title="Entrées">
    <Field label="Nombre de côtés" bind:value={doc.data.sides} />
    <div class="quick" role="group" aria-label="Nombre de côtés courant">
      {#each QUICK as n (n)}
        <button class:on={evaluate(doc.data.sides) === n} onclick={() => (doc.data.sides = String(n))}>{n}</button>
      {/each}
    </div>
    <Field label="Côté" unit="mm" bind:value={doc.data.side} placeholder={hint("side")} />
    <Field label={even ? "Sur plats (Ø du cercle inscrit)" : "Ø du cercle inscrit"} unit="mm" bind:value={doc.data.flats} placeholder={hint("flats")} />
    <Field label="Sur angles (Ø du cercle circonscrit)" unit="mm" bind:value={doc.data.corners} placeholder={hint("corners")} />
    <Field label="Aire" unit="mm²" bind:value={doc.data.area} placeholder={hint("area")} />
    <p class="hint">Renseignez une seule dimension. Écrou de M10 : 6 côtés, 16 sur plats.</p>
  </Card>

  <Card title="Résultats">
    {#if polygon && drawing}
      {@const d = drawing}
      <Result label="Côté" value={polygon.side} unit="mm" big oncopy={doc.copy} />
      <div class="grid">
        <Result label={even ? "Sur plats" : "Ø cercle inscrit"} value={polygon.flats} unit="mm" oncopy={doc.copy} />
        <Result label="Sur angles" value={polygon.corners} unit="mm" oncopy={doc.copy} />
        {#if !even}
          <Result label="Hauteur (plat → sommet)" value={polygon.height} unit="mm" oncopy={doc.copy} />
        {/if}
        <Result label="Périmètre" value={polygon.perimeter} unit="mm" oncopy={doc.copy} />
        <Result label="Aire" value={polygon.area} unit="mm²" oncopy={doc.copy} />
        <Result label="Angle intérieur" value={polygon.interiorAngle} unit="°" oncopy={doc.copy} />
        <Result label="Angle au centre" value={polygon.centralAngle} unit="°" oncopy={doc.copy} />
        <Result label="Coupe d'onglet (cadre)" value={polygon.miter} unit="°" oncopy={doc.copy} />
      </div>
      <svg viewBox="0 0 {d.size} {d.size}" role="img" aria-label="Schéma du polygone">
        <circle class="outer" cx={d.c} cy={d.c} r={d.R} />
        <circle class="inner" cx={d.c} cy={d.c} r={d.r} />
        <polygon class="shape" points={d.points} />
        <line class="axis" x1={d.c} y1={d.c - d.R - 8} x2={d.c} y2={d.c + d.R + 8} />
        <line class="axis" x1={d.c - d.R - 8} y1={d.c} x2={d.c + d.R + 8} y2={d.c} />
      </svg>
      <p class="hint">
        Coupe d'onglet : angle de chaque bout d'un tube, depuis la coupe d'équerre, pour fermer un cadre à {polygon.sides} pans
        (180° / {polygon.sides}).
      </p>
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
  .quick {
    display: flex;
    gap: 4px;
    margin-top: -6px;
  }
  .quick button {
    flex: 1;
    height: 28px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface);
    color: var(--muted);
    font: 600 12.5px var(--mono);
    cursor: pointer;
  }
  .quick button.on {
    border-color: var(--accent);
    color: var(--accent);
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
    max-width: 260px;
    align-self: center;
  }
  .shape {
    fill: color-mix(in srgb, var(--accent) 10%, transparent);
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-linejoin: round;
  }
  .outer,
  .inner {
    fill: none;
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 5 4;
  }
  .axis {
    stroke: var(--faint);
    stroke-width: 1;
    stroke-dasharray: 8 3 2 3;
  }
</style>
