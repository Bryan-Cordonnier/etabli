<script lang="ts">
  // Aperçu 3D de la pièce finie : épaisseur, génératrices numérotées comme le tableau de traçage,
  // soudure en rouge. On la tourne à la souris ; trois.js n'est chargé qu'à l'ouverture de la vue.
  import { onMount } from "svelte";
  import type { Model3D } from "./modele3d";
  import type { Tracage3D, View } from "./viewer3d";

  interface Props {
    model: Model3D;
    height?: number;
  }

  let { model, height = 320 }: Props = $props();

  let host: HTMLDivElement;
  const labels: HTMLSpanElement[] = [];
  let viewer = $state<Tracage3D | null>(null);
  let failed = $state(false);
  let view = $state<View>("3d");

  onMount(() => {
    let current: Tracage3D | null = null;
    import("./viewer3d")
      .then(({ Tracage3D }) => {
        current = new Tracage3D(host, ({ project, facing }) => {
          model.labels.forEach((label, i) => {
            const el = labels[i];
            if (!el) return;
            const p = project(label.at);
            el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
            // Étiquette derrière la pièce : masquée (elle réapparaît en tournant).
            el.style.opacity = facing(label.at, label.normal) ? "1" : "0";
          });
        });
        viewer = current;
      })
      .catch(() => (failed = true));
    return () => current?.dispose();
  });

  $effect(() => {
    if (!viewer) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    viewer.show(model, {
      accent: token("--accent", "#2b63d9"),
      edge: token("--text", "#141b24"),
      trace: token("--muted", "#5b6776"),
      seam: token("--err", "#d64545"),
      joint: token("--warn", "#d9822b"),
    });
  });

  function setView(next: View): void {
    view = next;
    viewer?.setView(next);
  }
</script>

<div class="viewer" style:height="{height}px">
  <div class="canvas" bind:this={host}></div>
  {#if failed}
    <p class="empty">Aperçu 3D indisponible sur cet ordinateur (WebGL désactivé).</p>
  {:else}
    {#each model.labels as label, i (i)}
      <span class="label" class:name={label.kind === "name"} bind:this={labels[i]}>{label.text}</span>
    {/each}
  {/if}
  <div class="views" role="group" aria-label="Vue">
    {#each [["3d", "3D"], ["face", "Face"], ["dessus", "Dessus"]] as [id, text] (id)}
      <button class:on={view === id} onclick={() => setView(id as View)}>{text}</button>
    {/each}
  </div>
  <p class="legend"><i class="seam"></i>soudure <i class="trace"></i>génératrices</p>
  <p class="hint">Glissez pour tourner la pièce</p>
</div>

<style>
  .viewer {
    position: relative;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: radial-gradient(circle at 50% 40%, var(--surface) 0%, var(--surface-2, var(--field)) 75%);
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
    padding: 0 4px;
    border-radius: var(--r-xs);
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    font: 600 11px var(--mono);
    color: var(--text);
    pointer-events: none;
    white-space: nowrap;
    transition: opacity 0.12s;
  }
  .label.name {
    font-family: var(--font);
    color: var(--accent);
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
  .legend,
  .hint {
    position: absolute;
    bottom: 8px;
    margin: 0;
    font-size: 12px;
    color: var(--muted);
    pointer-events: none;
  }
  .legend {
    left: 10px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .legend i {
    display: inline-block;
    width: 14px;
    height: 2px;
    margin-left: 6px;
  }
  .legend i:first-child {
    margin-left: 0;
  }
  .legend .seam {
    background: var(--err);
  }
  .legend .trace {
    background: var(--muted);
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
