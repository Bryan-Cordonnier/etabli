<script lang="ts">
  // Aperçu d'une mini-app de traçage : le flan développé ou la pièce en 3D. Le choix est gardé
  // dans les réglages du plugin, commun aux cinq mini-apps.
  import { PluginSettings, Segmented } from "@etabli/ui";
  import type { Snippet } from "svelte";
  import type { Model3D } from "./modele3d";
  import Vue3D from "./Vue3D.svelte";

  interface Props {
    /** Le flan (et le gabarit du trou d'un piquage…). */
    flat: Snippet;
    /** Pièce en 3D, calculée seulement quand la vue 3D est choisie. */
    model: () => Model3D;
    height?: number;
  }

  let { flat, model, height = 320 }: Props = $props();

  type Mode = "flan" | "3d";
  const reglages = new PluginSettings<{ apercu: Mode }>({ apercu: "flan" }, (saved, defaults) => {
    const apercu = (saved as { apercu?: unknown }).apercu;
    return { ...defaults, apercu: apercu === "3d" ? "3d" : "flan" };
  });
  const MODES: { value: Mode; label: string }[] = [
    { value: "flan", label: "Flan" },
    { value: "3d", label: "3D" },
  ];
</script>

<div class="head">
  <h4>Aperçu</h4>
  <Segmented label="Aperçu" options={MODES} bind:value={reglages.data.apercu} />
</div>
{#if reglages.data.apercu === "3d"}
  <Vue3D model={model()} {height} />
{:else}
  {@render flat()}
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  h4 {
    margin: 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
  }
</style>
