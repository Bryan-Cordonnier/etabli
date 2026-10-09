<script lang="ts">
  // Barre de titre sans onglets (distribution à une page à la fois) : le titre de la page ouverte (centré) et les boutons de la fenêtre.
  import { shortcutHint } from "$lib/shortcuts";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { describeView } from "$lib/views";
  import Icon from "./Icon.svelte";
  import Tile from "./Tile.svelte";
  import WindowControls from "./WindowControls.svelte";

  const info = $derived(tabs.active ? describeView(tabs.active.view) : null);
</script>

<header class="bar">
  <div class="drag-top" data-tauri-drag-region></div>
  {#if info}
    <div class="courant" data-tauri-drag-region>
      <Tile color={info.color} icon={info.icon} size={24} />
      <span class="titre">{info.title}</span>
    </div>
  {/if}
  <div class="drag" data-tauri-drag-region></div>
  <WindowControls />
</header>

<style>
  .bar {
    position: relative;
    height: var(--titlebar);
    display: flex;
    align-items: center;
    padding-left: 14px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    flex: none;
  }
  .drag-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 138px;
    height: 4px;
    z-index: 2;
  }
  .courant {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    transform: translateX(-50%);
    max-width: calc(100% - 340px);
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .titre {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .drag {
    flex: 1;
    align-self: stretch;
    min-width: 0;
  }
</style>