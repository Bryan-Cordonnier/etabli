<script lang="ts">
  import AppCard from "$lib/components/AppCard.svelte";
  import RecentDocs from "$lib/components/RecentDocs.svelte";
  import Tile from "$lib/components/Tile.svelte";
  import { getPlugin } from "$lib/plugins/registry";
  import { tabs } from "$lib/state/tabs.svelte";
  import type { MiniAppManifest } from "$lib/types";

  let { pluginId }: { pluginId: string } = $props();

  const plugin = $derived(getPlugin(pluginId));

  function open(app: MiniAppManifest, event: MouseEvent): void {
    tabs.navigate({ kind: "app", pluginId, appId: app.id }, { newTab: event.ctrlKey || event.button === 1 });
  }
</script>

<div class="page">
  {#if plugin}
    <nav class="crumbs" aria-label="Fil d'Ariane">
      <button onclick={() => tabs.navigate({ kind: "home" })}>Accueil</button>›<span>{plugin.name}</span>
    </nav>

    <header class="head">
      <Tile color={plugin.color} icon={plugin.icon} emoji={plugin.emoji} size={52} />
      <div>
        <h1>{plugin.name}</h1>
        <p class="sub">{plugin.description} · <span class="pill">v{plugin.version}</span></p>
      </div>
    </header>

    <div class="grid">
      {#each plugin.miniApps as app, i (app.id)}
        <AppCard {plugin} {app} index={i} onopen={(e) => open(app, e)} />
      {/each}
    </div>

    <section class="section">
      <h2>Récents dans ce plugin</h2>
      <RecentDocs {pluginId} empty="Les derniers calculs de ce plugin apparaîtront ici." />
    </section>
  {:else}
    <h1>Plugin introuvable</h1>
    <p class="sub">Ce plugin a peut-être été désinstallé.</p>
  {/if}
</div>

<style>
  .head {
    display: flex;
    gap: 14px;
    align-items: center;
  }
</style>
