<script lang="ts">
  // Derniers calculs, tous plugins confondus (Accueil) ou d'un seul plugin (grille d'un plugin).
  import { api, type DocumentMeta } from "$lib/api";
  import { formatDate } from "$lib/dates";
  import { getMiniApp } from "$lib/plugins/registry";
  import { tabs } from "$lib/state/tabs.svelte";
  import Tile from "./Tile.svelte";

  interface Props {
    pluginId?: string;
    limit?: number;
    empty: string;
  }

  let { pluginId, limit = 5, empty }: Props = $props();

  let docs = $state<DocumentMeta[] | null>(null);

  $effect(() => {
    api
      .documentsList({ pluginId, limit })
      .then((list) => (docs = list))
      .catch(() => (docs = []));
  });

  function open(doc: DocumentMeta, event: MouseEvent): void {
    tabs.navigate(
      { kind: "app", pluginId: doc.pluginId, appId: doc.appId, docId: doc.id },
      { newTab: event.ctrlKey || event.button === 1 },
    );
  }
</script>

{#if docs?.length}
  <div class="list">
    {#each docs as doc (doc.id)}
      {@const ref = getMiniApp(doc.pluginId, doc.appId)}
      <button class="row" onclick={(e) => open(doc, e)} onauxclick={(e) => e.button === 1 && open(doc, e)}>
        {#if ref}
          <Tile color={ref.plugin.color} icon={ref.app.icon} emoji={ref.app.emoji} variant="soft" size={32} />
        {/if}
        <span class="grow">
          <span class="title">{doc.title}</span>
          <span class="detail">{ref?.app.name ?? doc.appId}{doc.summary ? ` · ${doc.summary}` : ""}</span>
        </span>
        <span class="date">{formatDate(doc.modified)}</span>
      </button>
    {/each}
  </div>
{:else if docs}
  <p class="empty">{empty}</p>
{/if}

<style>
  .list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    overflow: hidden;
    background: var(--surface);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border: 0;
    border-top: 1px solid var(--border);
    background: none;
    text-align: left;
  }
  .row:first-child {
    border-top: 0;
  }
  .row:hover {
    background: var(--surface-2);
  }
  .grow {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title,
  .detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detail {
    color: var(--muted);
    font-size: 12.5px;
  }
  .date {
    color: var(--faint);
    font-size: 12px;
    white-space: nowrap;
  }
</style>
