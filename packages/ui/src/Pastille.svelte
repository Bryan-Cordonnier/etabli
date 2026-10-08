<script lang="ts">
  // Petite pastille d'état : « En cours », « Terminée »…
  import type { Snippet } from "svelte";

  interface Props {
    ton?: "neutre" | "bon" | "attention" | "info";
    children: Snippet;
  }

  let { ton = "neutre", children }: Props = $props();
</script>

<span class="pastille {ton}">{@render children()}</span>

<style>
  .pastille {
    display: inline-flex;
    align-items: center;
    padding: 2px 9px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--muted);
    font-size: 11.5px;
    font-weight: 700;
    white-space: nowrap;
  }
  .bon {
    border-color: transparent;
    background: color-mix(in srgb, var(--ok) 16%, transparent);
    color: var(--ok);
  }
  .attention {
    border-color: transparent;
    background: color-mix(in srgb, var(--warn) 18%, transparent);
    color: var(--warn);
  }
  .info {
    border-color: transparent;
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>