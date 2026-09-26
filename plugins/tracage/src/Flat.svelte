<script lang="ts">
  // Aperçu du flan développé : contour, lignes de pliage léger ou génératrices, repères, encombrement.
  import { format } from "@etabli/ui";
  import { bounds, type FlatPattern, type Point } from "./developpes";

  interface Props {
    pattern: FlatPattern;
    /** Contours supplémentaires (gabarit du trou d'un piquage…). */
    extra?: Point[][];
    height?: number;
  }

  let { pattern, extra = [], height = 260 }: Props = $props();

  const box = $derived(bounds([...pattern.contour, ...extra.flat()]));
  const margin = $derived(Math.max(box.width, box.height) * 0.04 + 2);
  const view = $derived(`${box.minX - margin} ${-box.maxY - margin} ${box.width + 2 * margin} ${box.height + 2 * margin}`);
  // Y vers le haut dans le calcul, vers le bas en SVG.
  const path = (points: Point[], closed = true) =>
    points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${(-y).toFixed(2)}`).join(" ") + (closed ? " Z" : "");
  const font = $derived(Math.max(box.width, box.height) / 45);
</script>

<figure>
  <svg viewBox={view} style:max-height="{height}px" role="img" aria-label="Flan développé" preserveAspectRatio="xMidYMid meet">
    <path class="flat" d={path(pattern.contour)} vector-effect="non-scaling-stroke" />
    {#each extra as shape, i (i)}
      <path class="extra" d={path(shape)} vector-effect="non-scaling-stroke" />
    {/each}
    {#each pattern.lines as line, i (i)}
      <line
        class={line.kind}
        x1={line.from[0]}
        y1={-line.from[1]}
        x2={line.to[0]}
        y2={-line.to[1]}
        vector-effect="non-scaling-stroke"
      />
    {/each}
    {#each pattern.labels as label, i (i)}
      <text x={label.at[0]} y={-label.at[1]} font-size={font} text-anchor="middle">{label.text}</text>
    {/each}
  </svg>
  <figcaption>Encombrement du flan : {format(box.width, 1)} × {format(box.height, 1)} mm</figcaption>
</figure>

<style>
  figure {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  svg {
    width: 100%;
    height: auto;
  }
  .flat {
    fill: color-mix(in srgb, var(--accent) 10%, transparent);
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .extra {
    fill: none;
    stroke: var(--warn);
    stroke-width: 1.6;
  }
  .pli {
    stroke: var(--err);
    stroke-width: 1;
    stroke-dasharray: 6 4;
  }
  .trace {
    stroke: var(--faint);
    stroke-width: 0.8;
    stroke-dasharray: 2 3;
  }
  text {
    fill: var(--muted);
    font-family: var(--mono);
  }
  figcaption {
    font-size: 12.5px;
    color: var(--muted);
  }
</style>
