<script lang="ts">
  // Mini écran 3D de la pièce sélectionnée : on règle avec les valeurs, on tourne pour vérifier.
  import { onMount } from "svelte";
  import { ends, type PieceShape } from "./coupe";
  import type { View, Viewer3D } from "./piece3d";
  import type { Section } from "./profil";

  interface Props {
    section: Section;
    length: number;
    shape: PieceShape;
    color: string;
    mark: string;
  }

  let { section, length, shape, color, mark }: Props = $props();

  let host: HTMLDivElement;
  let labelLeft = $state<HTMLSpanElement>();
  let labelRight = $state<HTMLSpanElement>();
  let viewer = $state<Viewer3D | null>(null);
  let failed = $state(false);
  let view = $state<View>("3d");

  const bounds = $derived({ width: section.width, height: section.height, round: section.round });
  const pieceEnds = $derived(ends(shape, bounds));

  // Une pièce de 6 m pour 40 mm de section serait un fil : au-delà de 6 fois la section, la vue
  // est raccourcie au milieu. Les bouts, qui sont ce qu'on vérifie, restent exacts.
  const size = $derived(Math.max(section.width, section.height, 1));
  const reculs = $derived(
    [pieceEnds.left, pieceEnds.right].map((e) => e.c + (Math.abs(e.a) * bounds.width + Math.abs(e.b) * bounds.height) / 2),
  );
  const shown = $derived(
    length > 6 * size ? Math.max(6 * size, reculs[0]! + reculs[1]! + 2 * size) : Math.max(length, reculs[0]! + reculs[1]! + size * 0.2),
  );
  const shortened = $derived(shown < length - 0.5);

  const angleText = (angle: number) => (angle > 0 ? `${angle.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}°` : "droit");

  onMount(() => {
    let current: Viewer3D | null = null;
    import("./piece3d")
      .then(({ Viewer3D }) => {
        current = new Viewer3D(host, (project) => {
          // Étiquettes des angles au-dessus de chaque bout.
          const top = section.height / 2 + size * 0.35;
          const place = (el: HTMLElement | undefined, x: number) => {
            if (!el) return;
            const p = project(x, top, 0);
            el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
          };
          place(labelLeft, -shown / 2 + pieceEnds.left.c);
          place(labelRight, shown / 2 - pieceEnds.right.c);
        });
        viewer = current;
      })
      .catch(() => (failed = true));
    return () => current?.dispose();
  });

  $effect(() => {
    if (!viewer || !section.valid) return;
    const edgeColor = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#141b24";
    viewer.show([{ model: { section, length: shown, ends: pieceEnds }, color, position: [0, 0, 0] }], edgeColor);
  });

  function setView(next: View): void {
    view = next;
    viewer?.setView(next);
  }
</script>

<div class="viewer">
  <div class="canvas" bind:this={host}></div>
  {#if !section.valid}
    <p class="empty">Renseignez les dimensions du profilé pour voir la pièce.</p>
  {:else if failed}
    <p class="empty">Aperçu 3D indisponible sur cet ordinateur (WebGL désactivé).</p>
  {:else}
    <span class="angle" bind:this={labelLeft}>{angleText(shape.angleL)}</span>
    <span class="angle" bind:this={labelRight}>{angleText(shape.angleR)}</span>
  {/if}
  <div class="views" role="group" aria-label="Vue">
    {#each [["3d", "3D"], ["dessus", "Dessus"], ["cote", "Côté"]] as [id, label] (id)}
      <button class:on={view === id} onclick={() => setView(id as View)}>{label}</button>
    {/each}
  </div>
  <p class="caption">
    <b>{mark}</b> · {length.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mm pointe à pointe
    {#if shortened}<span class="short">· vue raccourcie</span>{/if}
  </p>
  <p class="hint">Glissez pour tourner la pièce</p>
</div>

<style>
  .viewer {
    position: relative;
    height: 250px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background:
      radial-gradient(circle at 50% 40%, var(--surface) 0%, var(--surface-2) 75%);
    overflow: hidden;
  }
  .canvas {
    position: absolute;
    inset: 0;
    cursor: grab;
  }
  .canvas:active {
    cursor: grabbing;
  }
  .angle {
    position: absolute;
    top: 0;
    left: 0;
    padding: 1px 6px;
    border-radius: var(--r-xs);
    background: var(--surface);
    border: 1px solid var(--border);
    font: 600 12px var(--mono);
    color: var(--text);
    pointer-events: none;
    white-space: nowrap;
  }
  .views {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--r-sm);
    background: var(--field);
  }
  .views button {
    height: 24px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--r-xs);
    background: none;
    color: var(--muted);
    font: 500 12px var(--font);
    cursor: pointer;
  }
  .views button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }
  .caption,
  .hint {
    position: absolute;
    bottom: 8px;
    margin: 0;
    font-size: 12px;
    color: var(--muted);
    pointer-events: none;
  }
  .caption {
    left: 10px;
  }
  .caption b {
    color: var(--text);
  }
  .short {
    color: var(--faint);
  }
  .hint {
    right: 10px;
    color: var(--faint);
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 20px;
    text-align: center;
    font-size: 13px;
    color: var(--faint);
  }
</style>
