<script lang="ts">
  // Barre du haut en écran étroit : tiroir des plugins, retour, titre de la page, accueil.
  // Les onglets multiples de la version bureau n'existent pas ici : on navigue dans l'onglet actif.
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { describeView } from "$lib/views";
  import Icon from "./Icon.svelte";
  import Tile from "./Tile.svelte";

  const info = $derived(tabs.active ? describeView(tabs.active.view) : null);
  const canGoBack = $derived((tabs.active?.history.length ?? 0) > 0);
</script>

<header class="bar">
  <button class="btn-icon" onclick={() => (ui.menuOpen = !ui.menuOpen)} aria-label="Menu des plugins" aria-expanded={ui.menuOpen}>
    <Icon name="panel" size={20} />
  </button>
  {#if canGoBack}
    <button class="btn-icon" onclick={() => tabs.back()} aria-label="Retour"><Icon name="back" size={20} /></button>
  {/if}
  {#if info}
    <div class="title">
      <Tile color={info.color} icon={info.icon} variant="plain" />
      <span>{info.title}</span>
    </div>
  {/if}
  <button class="btn-icon search" onclick={() => (ui.paletteOpen = true)} aria-label="Rechercher"><Icon name="search" size={20} /></button>
</header>

<style>
  .bar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: calc(var(--titlebar) + env(safe-area-inset-top, 0px));
    padding: env(safe-area-inset-top, 0px) 6px 0;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
  }
  .btn-icon {
    width: 44px;
    height: 44px;
    flex: none;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--text);
  }
  .btn-icon:active {
    background: var(--field);
  }
  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }
  .title span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .search {
    margin-left: auto;
  }
</style>
