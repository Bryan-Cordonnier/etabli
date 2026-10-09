<script lang="ts">
  // En-tête d'une page de plugin : le moteur ne dessine plus de titre, chaque page trace le sien.
  import type { Snippet } from "svelte";

  interface Props {
    titre: string;
    /** Boutons à droite du titre. */
    actions?: Snippet;
  }

  let { titre, actions }: Props = $props();
</script>

<header>
  <h1>{titre}</h1>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    flex-direction: column;
    justify-content: center;
    gap: 10px 16px;
  }
  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.03em;
    text-align: center;
  }
  .actions {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>