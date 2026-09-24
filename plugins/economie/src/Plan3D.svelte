<script lang="ts">
  // Plan de débit en 3D : toutes les barres, pièces écartées pour voir chaque coupe.
  import { onMount } from "svelte";
  import type { PieceShape } from "./coupe";
  import type { BarGroup } from "./debit";
  import type { View, Viewer3D } from "./piece3d";
  import { planScene } from "./plan3d";
  import type { Section } from "./profil";

  interface Props {
    groups: BarGroup[];
    shapes: PieceShape[];
    section: Section;
    colors: (piece: number) => string;
  }

  let { groups, shapes, section, colors }: Props = $props();

  let host: HTMLDivElement;
  let viewer = $state<Viewer3D | null>(null);
  let failed = $state(false);
  let view = $state<View>("3d");
  const labelElements: HTMLSpanElement[] = [];

  const scene = $derived(planScene(groups, shapes, section, colors));
  // Plus il y a de barres, plus la vue est haute (dans une limite raisonnable).
  const height = $derived(Math.min(520, Math.max(240, 120 + groups.length * 56)));

  onMount(() => {
    let current: Viewer3D | null = null;
    import("./piece3d")
      .then(({ Viewer3D }) => {
        current = new Viewer3D(host, (project) => {
          scene.labels.forEach((label, i) => {
            const el = labelElements[i];
            if (!el) return;
            const p = project(...label.position);
            el.style.transform =
              label.kind === "bar" ? `translate(${p.x}px, ${p.y}px) translate(-100%, -50%)` : `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
          });
        });
        viewer = current;
      })
      .catch(() => (failed = true));
    return () => current?.dispose();
  });

  $effect(() => {
    if (!viewer || !section.valid) return;
    const edgeColor = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#141b24";
    viewer.show(scene.parts, edgeColor);
  });

  function setView(next: View): void {
    view = next;
    viewer?.setView(next);
  }
</script>

<div class="viewer" style:height="{height}px">
  <div class="canvas" bind:this={host}></div>
  {#if !section.valid}
    <p class="empty">Renseignez les dimensions du profilé pour voir les barres en 3D.</p>
  {:else if failed}
    <p class="empty">Vue 3D indisponible sur cet ordinateur (WebGL désactivé).</p>
  {:else}
    {#each scene.labels as label, i (i)}
      <span class="label {label.kind}" bind:this={labelElements[i]}>{label.text}</span>
    {/each}
  {/if}
  <div class="views" role="group" aria-label="Vue">
    {#each [["3d", "3D"], ["dessus", "Dessus"], ["cote", "Côté"]] as [id, label] (id)}
      <button class:on={view === id} onclick={() => setView(id as View)}>{label}</button>
    {/each}
  </div>
  <p class="hint">Pièces écartées et raccourcies au milieu ; les coupes sont à la vraie forme. Glissez pour tourner.</p>
</div>

<style>
  .viewer {
    position: relative;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: radial-gradient(circle at 50% 40%, var(--surface) 0%, var(--surface-2) 75%);
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
  .label {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    white-space: nowrap;
  }
  .label.bar {
    padding-right: 4px;
    font: 500 11.5px var(--font);
    color: var(--muted);
  }
  .label.piece {
    font: 700 11px var(--mono);
    color: var(--text);
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
  .hint {
    position: absolute;
    left: 10px;
    bottom: 8px;
    margin: 0;
    font-size: 12px;
    color: var(--faint);
    pointer-events: none;
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
