<script lang="ts">
  // Courbe SVG d'une série (par exemple le solde jour après jour) : ligne de 2 px, aire discrète, repères de l'axe vertical, info-bulle au
  // survol ou au clavier, et un tableau des valeurs pour les lecteurs d'écran (docs/24, M9). Couleurs : jetons du thème, jamais en dur.
  // La géométrie est dans charts.ts (testée) ; ce composant ne fait que dessiner.
  import { cheminAire, cheminLigne, echelle, graduations, plusProche } from "./charts";

  interface Props {
    /** Une valeur par repère de l'axe horizontal, dans l'ordre (le libellé est le texte du repère : « 12 oct. »). */
    points: { label: string; value: number }[];
    /** Écrit une valeur (axe, info-bulle, tableau) ; défaut : le nombre tel quel. */
    format?: (value: number) => string;
    /** Titre lu par les lecteurs d'écran et affiché dans l'info-bulle de synthèse. */
    title: string;
    height?: number;
  }

  let { points, format = String, title, height = 180 }: Props = $props();

  const W = 600;
  const marge = { haut: 10, droite: 12, bas: 22, gauche: 64 };
  let actif = $state<number | null>(null);

  const bornes = $derived.by(() => {
    const valeurs = points.map((p) => p.value);
    return valeurs.length ? graduations(Math.min(...valeurs, 0), Math.max(...valeurs, 0)) : [0, 1];
  });
  const y = $derived(echelle([bornes[0]!, bornes[bornes.length - 1]!], [height - marge.bas, marge.haut]));
  const x = $derived(echelle([0, Math.max(1, points.length - 1)], [marge.gauche, W - marge.droite]));
  const xy = $derived(points.map((p, i) => ({ x: x(i), y: y(p.value) })));
  const reperesX = $derived(points.length <= 1 ? [0] : [0, Math.floor((points.length - 1) / 2), points.length - 1]);

  function survol(e: PointerEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    actif = plusProche(xy, ((e.clientX - r.left) / r.width) * W);
  }

  function clavier(e: KeyboardEvent) {
    if (points.length === 0) return;
    const pas = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (e.key === "Home") actif = 0;
    else if (e.key === "End") actif = points.length - 1;
    else if (pas) actif = Math.min(points.length - 1, Math.max(0, (actif ?? points.length - 1) + pas));
    else return;
    e.preventDefault();
  }

  const infobulle = $derived(actif === null || !points[actif] ? null : points[actif]);
</script>

<figure>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    viewBox={`0 0 ${W} ${height}`}
    role="img"
    aria-label={title}
    tabindex="0"
    onpointermove={survol}
    onpointerleave={() => (actif = null)}
    onkeydown={clavier}
    onblur={() => (actif = null)}
  >
    <title>{title}</title>
    {#each bornes as v (v)}
      <line class="grille" class:zero={v === 0} x1={marge.gauche} x2={W - marge.droite} y1={y(v)} y2={y(v)} />
      <text class="repere" x={marge.gauche - 8} y={y(v)} text-anchor="end" dominant-baseline="middle">{format(v)}</text>
    {/each}
    {#each reperesX as i (i)}
      {#if points[i]}
        <text class="repere" x={x(i)} y={height - 6} text-anchor={i === 0 && points.length > 1 ? "start" : i === points.length - 1 && points.length > 1 ? "end" : "middle"}>{points[i]!.label}</text>
      {/if}
    {/each}
    {#if points.length > 1}
      <path class="aire" d={cheminAire(xy, y(Math.max(0, bornes[0]!)))} />
      <path class="ligne" d={cheminLigne(xy)} />
    {:else if xy[0]}
      <circle class="point" cx={xy[0].x} cy={xy[0].y} r="4" />
    {/if}
    {#if actif !== null && xy[actif]}
      <line class="reticule" x1={xy[actif]!.x} x2={xy[actif]!.x} y1={marge.haut} y2={height - marge.bas} />
      <circle class="point" cx={xy[actif]!.x} cy={xy[actif]!.y} r="4.5" />
    {/if}
  </svg>
  {#if infobulle}
    <figcaption class="bulle" aria-live="polite"><span>{infobulle.label}</span> <strong>{format(infobulle.value)}</strong></figcaption>
  {/if}
  <table class="sr-only">
    <caption>{title}</caption>
    <thead><tr><th scope="col">Date</th><th scope="col">Valeur</th></tr></thead>
    <tbody>
      {#each points as p (p.label)}
        <tr><th scope="row">{p.label}</th><td>{format(p.value)}</td></tr>
      {/each}
    </tbody>
  </table>
</figure>

<style>
  figure {
    position: relative;
    margin: 0;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
    border-radius: var(--r-sm);
    outline-offset: 2px;
  }
  .grille {
    stroke: var(--border);
    stroke-width: 1;
  }
  .grille.zero {
    stroke: var(--faint);
  }
  .repere {
    fill: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .ligne {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .aire {
    fill: var(--accent-soft);
    stroke: none;
  }
  .reticule {
    stroke: var(--faint);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  .point {
    fill: var(--accent);
    stroke: var(--surface);
    stroke-width: 2;
  }
  .bulle {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    gap: 6px;
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface);
    color: var(--text);
    font-size: 12px;
    pointer-events: none;
  }
  .bulle span {
    color: var(--muted);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
