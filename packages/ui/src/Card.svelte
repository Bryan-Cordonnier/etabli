<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    title?: string;
    /** Boutons affichés à droite du titre. */
    actions?: Snippet;
    children: Snippet;
  }

  let { title = "", actions, children }: Props = $props();
</script>

<section class="card">
  {#if title || actions}
    <header>
      {#if title}<h3>{title}</h3>{/if}
      {#if actions}<div class="actions">{@render actions()}</div>{/if}
    </header>
  {/if}
  {@render children()}
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 20px;
  }
  h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--faint);
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  /* Boutons des mini-apps : classe globale « btn », utilisable dans toute carte. */
  .card :global(.btn) {
    height: 32px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface);
    font-weight: 500;
    font-size: 13px;
    white-space: nowrap;
  }
  .card :global(.btn:hover) {
    background: var(--surface-2);
  }
  .card :global(.btn.primary) {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }
</style>
