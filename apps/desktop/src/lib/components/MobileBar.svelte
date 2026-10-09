<script lang="ts">
  // Barre du haut sur téléphone, dans une page : retour (le geste Android fait pareil) et nom de la page, centré.
  // L'accueil, lui, est la liste des pages (MobileAccueil) : pas de tiroir, pas de recherche.
  import { tabs } from "$lib/state/tabs.svelte";
  import { retourMobile } from "$lib/state/retour";
  import { describeView } from "$lib/views";
  import Icon from "./Icon.svelte";

  const info = $derived(tabs.active ? describeView(tabs.active.view) : null);
</script>

<header class="bar">
  <button class="btn-icon" onclick={retourMobile} aria-label="Retour"><Icon name="back" size={22} /></button>
  <div class="title">{info?.title ?? ""}</div>
  <div class="btn-icon" aria-hidden="true"></div>
</header>

<style>
  .bar {
    flex: none;
    display: flex;
    align-items: center;
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
  button.btn-icon:active {
    background: var(--field);
  }
  .title {
    flex: 1;
    min-width: 0;
    text-align: center;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>