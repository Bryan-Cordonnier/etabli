<script lang="ts">
  // « Anciens calculs » en bas d'une mini-app : recherche, 5 par page, pagination (section 5.6).
  import type { PastCalc } from "$lib/types";
  import { normalize } from "$lib/views";
  import SearchBox from "./SearchBox.svelte";

  interface Props {
    items: PastCalc[];
    currentId?: string;
    onopen: (id: string, event: MouseEvent) => void;
  }

  let { items, currentId, onopen }: Props = $props();

  const PER_PAGE = 5;
  let query = $state("");
  let page = $state(0);

  const filtered = $derived(
    items.filter((item) => normalize(`${item.title} ${item.summary}`).includes(normalize(query.trim()))),
  );
  const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / PER_PAGE)));
  const current = $derived(Math.min(page, pageCount - 1));
  const visible = $derived(filtered.slice(current * PER_PAGE, (current + 1) * PER_PAGE));
</script>

<section class="past">
  <div class="head">
    <h2>Anciens calculs</h2>
    <div class="search"><SearchBox bind:value={query} placeholder="Rechercher un calcul…" oninput={() => (page = 0)} /></div>
  </div>

  {#if visible.length}
    <div class="list">
      {#each visible as item (item.id)}
        <button class="row" class:cur={item.id === currentId} onclick={(e) => onopen(item.id, e)}>
          <span class="grow">
            <span class="title">{item.title}</span>
            <span class="summary">{item.summary}</span>
          </span>
          <span class="date">{item.date}</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="empty">
      {items.length
        ? "Aucun calcul ne correspond à la recherche."
        : "Aucun calcul pour l'instant. Chaque calcul s'enregistrera ici automatiquement."}
    </p>
  {/if}

  {#if filtered.length > PER_PAGE}
    <nav class="pager" aria-label="Pages">
      <button onclick={() => (page = current - 1)} disabled={current === 0} aria-label="Page précédente">‹</button>
      {#each { length: pageCount }, i}
        <button class:on={i === current} onclick={() => (page = i)} aria-current={i === current ? "page" : undefined}>
          {i + 1}
        </button>
      {/each}
      <button onclick={() => (page = current + 1)} disabled={current >= pageCount - 1} aria-label="Page suivante">›</button>
      <span class="count">{filtered.length} calculs</span>
    </nav>
  {/if}
</section>

<style>
  .past {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 8px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .search {
    width: 260px;
    max-width: 100%;
    margin-left: auto;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    border: 0;
    border-radius: 10px;
    background: none;
    text-align: left;
    width: 100%;
  }
  .row:hover {
    background: var(--field);
  }
  .row.cur {
    background: var(--accent-soft);
  }
  .grow {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cur .title {
    color: var(--accent);
    font-weight: 600;
  }
  .summary {
    color: var(--muted);
    font-size: 12.5px;
  }
  .date {
    color: var(--faint);
    font-size: 12px;
    white-space: nowrap;
  }
  .pager {
    display: flex;
    gap: 4px;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
  }
  .pager button {
    min-width: 32px;
    height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    font: 500 13px var(--mono);
  }
  .pager button:hover:not(:disabled) {
    background: var(--field);
    color: var(--text);
  }
  .pager button.on {
    background: var(--accent);
    color: var(--accent-text);
  }
  .pager button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .count {
    font-size: 12px;
    color: var(--faint);
    margin-left: 10px;
  }
</style>
