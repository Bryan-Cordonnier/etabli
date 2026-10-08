<script lang="ts" generics="T extends string">
  // Onglets d'une page : un par type de contrat, par exemple. Les flèches gauche et droite passent d'un onglet à l'autre.
  interface Props {
    items: { id: T; label: string }[];
    value: T;
    label?: string;
  }

  let { items, value = $bindable(), label = "Onglets" }: Props = $props();

  function touche(e: KeyboardEvent, index: number): void {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const suivant = items[(index + delta + items.length) % items.length];
    if (suivant) value = suivant.id;
  }
</script>

<div class="onglets" role="tablist" aria-label={label}>
  {#each items as item, i (item.id)}
    <button
      role="tab"
      aria-selected={value === item.id}
      tabindex={value === item.id ? 0 : -1}
      onclick={() => (value = item.id)}
      onkeydown={(e) => touche(e, i)}
    >
      {item.label}
    </button>
  {/each}
</div>

<style>
  .onglets {
    display: flex;
    gap: 2px;
    overflow-x: auto;
    border-bottom: 1px solid var(--border);
  }
  button {
    padding: 9px 16px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--muted);
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }
  button[aria-selected="true"] {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
</style>