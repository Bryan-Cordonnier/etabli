<script lang="ts">
  import { appKey } from "$lib/plugins/registry";
  import { settings } from "$lib/state/settings.svelte";
  import type { MiniAppManifest, PluginManifest } from "$lib/types";
  import Icon from "./Icon.svelte";
  import Tile from "./Tile.svelte";

  interface Props {
    plugin: PluginManifest;
    app: MiniAppManifest;
    index?: number;
    /** Affiche le nom du plugin (Accueil, favoris), inutile dans la grille d'un plugin. */
    showPlugin?: boolean;
    onopen: (event: MouseEvent) => void;
  }

  let { plugin, app, index = 0, showPlugin = false, onopen }: Props = $props();

  const key = $derived(appKey(plugin.id, app.id));
  const favorite = $derived(settings.isFavorite(key));
</script>

<div class="card" style:--c={plugin.color} style:animation-delay="{index * 20}ms">
  <button
    class="open"
    onclick={onopen}
    onauxclick={(e) => e.button === 1 && onopen(e)}
    onmousedown={(e) => e.button === 1 && e.preventDefault()}
  >
    <Tile color={plugin.color} icon={app.icon} emoji={app.emoji} variant="soft" />
    <span class="name">{app.name}</span>
    {#if showPlugin}<span class="from">{plugin.name}</span>{/if}
    <span class="desc">{app.description}</span>
  </button>
  {#if app.plannedFor === "v2"}<span class="pill v2">v2</span>{/if}
  <button
    class="star"
    class:on={favorite}
    onclick={() => settings.toggleFavorite(key)}
    aria-pressed={favorite}
    aria-label={favorite ? `Retirer ${app.name} des favoris` : `Ajouter ${app.name} aux favoris`}
    title={favorite ? "Retirer des favoris" : "Ajouter aux favoris (aperçu rapide)"}
  >
    <Icon name="star" size={16} fill={favorite ? "currentColor" : "none"} />
  </button>
</div>

<style>
  .card {
    position: relative;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: var(--r-md);
    transition:
      transform 0.15s ease-out,
      border-color 0.15s,
      box-shadow 0.15s;
    animation: rise 0.25s ease-out both;
  }
  .card:hover {
    transform: translateY(-2px);
    border-color: var(--c);
    box-shadow: 0 6px 18px color-mix(in srgb, var(--c) 18%, transparent);
  }
  .open {
    width: 100%;
    border: 0;
    background: none;
    padding: 16px;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-radius: var(--r-md);
  }
  .name {
    font-weight: 600;
    padding-right: 24px;
  }
  .from {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--c);
    margin-top: -6px;
  }
  .desc {
    color: var(--muted);
    font-size: 12.5px;
  }
  .pill {
    position: absolute;
    top: 14px;
    right: 42px;
  }
  .star {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--r-xs);
    background: none;
    color: var(--faint);
    display: grid;
    place-items: center;
  }
  .star:hover {
    background: var(--field);
  }
  .star.on {
    color: #f2b632;
  }
</style>
