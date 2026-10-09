<script lang="ts">
  // Barre de titre sans onglets (distribution à une page à la fois) : le titre de la page ouverte, la recherche et les boutons de la fenêtre.
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
    <div class="page" data-tauri-drag-region>
      <Tile color={info.color} icon={info.icon} size={24} />
      <span class="titre">{info.title}</span>
    </div>
  {/if}
  <button
    class="find"
    onclick={() => (ui.paletteOpen = true)}
    title={shortcutHint("Rechercher une page", "palette")}
    aria-label="Rechercher une page"
  >
    <Icon name="search" size={17} />
  </button>
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
  .page {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    margin-right: 10px;
  }
  .titre {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .find {
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--muted);
    display: grid;
    place-items: center;
    flex: none;
  }
  .find:hover {
    background: var(--field);
    color: var(--text);
  }
  .drag {
    flex: 1;
    align-self: stretch;
    min-width: 0;
  }
</style>