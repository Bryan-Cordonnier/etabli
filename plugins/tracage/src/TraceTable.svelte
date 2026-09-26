<script lang="ts">
  // Tableau de traçage : une ligne par génératrice, repliable, copiable vers Excel.
  import { format } from "@etabli/ui";
  import type { TraceRow } from "./developpes";
  import { tableText } from "./export";

  interface Props {
    rows: TraceRow[];
    headers: [string, string, string, string];
    oncopy: (text: string) => void;
  }

  let { rows, headers, oncopy }: Props = $props();
  let open = $state(true);
</script>

<div class="head">
  <button class="toggle" onclick={() => (open = !open)} aria-expanded={open}>{open ? "▾" : "▸"} Tableau de traçage ({rows.length} génératrices)</button>
  <button class="btn" onclick={() => oncopy(tableText(rows, headers))}>Copier le tableau</button>
</div>
{#if open}
  <div class="scroll">
    <table>
      <thead>
        <tr>{#each headers as h, i (i)}<th class:r={i > 0}>{h}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each rows as row (row.n)}
          <tr>
            <td>{row.n}</td>
            <td class="r">{format(row.angle, 1)}</td>
            <td class="r">{format(row.x, 1)}</td>
            <td class="r"><button onclick={() => oncopy(format(row.y, 2))} title="Copier">{format(row.y, 1)}</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .toggle {
    border: 0;
    background: none;
    padding: 0;
    font: 600 13px var(--font);
    color: var(--muted);
    cursor: pointer;
  }
  .scroll {
    max-height: 320px;
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    position: sticky;
    top: 0;
    background: var(--surface);
    text-align: left;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--faint);
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 3px 8px;
    border-bottom: 1px solid var(--border);
    font-family: var(--mono);
  }
  .r {
    text-align: right;
  }
  td button {
    border: 0;
    background: none;
    padding: 2px 6px;
    margin: 0 -6px;
    border-radius: var(--r-xs);
    font: 500 13px var(--mono);
    color: var(--text);
    cursor: copy;
  }
  td button:hover {
    background: var(--accent-soft);
  }
</style>
