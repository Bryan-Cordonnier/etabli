<script lang="ts">
  import AppCard from "$lib/components/AppCard.svelte";
  import RecentDocs from "$lib/components/RecentDocs.svelte";
  import SearchBox from "$lib/components/SearchBox.svelte";
  import { allMiniApps, appKey, getMiniAppByKey, type MiniAppRef } from "$lib/plugins/registry";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { normalize } from "$lib/views";

  let query = $state("");

  const available = (ref: MiniAppRef | undefined): ref is MiniAppRef =>
    !!ref && settings.isPluginEnabled(ref.plugin.id);

  const favorites = $derived(settings.favorites.map(getMiniAppByKey).filter(available));

  const searching = $derived(query.trim().length > 0);
  const results = $derived(
    searching
      ? allMiniApps()
          .filter(available)
          .filter((r) => normalize(`${r.app.name} ${r.app.description} ${r.plugin.name}`).includes(normalize(query.trim())))
      : favorites,
  );

  function open(ref: MiniAppRef, event: MouseEvent): void {
    tabs.navigate(
      { kind: "app", pluginId: ref.plugin.id, appId: ref.app.id },
      { newTab: event.ctrlKey || event.button === 1 },
    );
  }
</script>

<div class="page">
  <header>
    <h1>Bonjour</h1>
    <p class="sub">Que voulez-vous calculer ?</p>
  </header>

  <SearchBox big bind:value={query} placeholder="Rechercher une mini-app…" />

  <section class="section">
    <h2>{searching ? `Résultats (${results.length})` : "Favoris"}</h2>
    {#if results.length}
      <div class="grid">
        {#each results as ref, i (appKey(ref.plugin.id, ref.app.id))}
          <AppCard plugin={ref.plugin} app={ref.app} index={i} showPlugin onopen={(e) => open(ref, e)} />
        {/each}
      </div>
    {:else}
      <p class="empty">
        {searching
          ? "Aucune mini-app ne correspond."
          : "Aucun favori pour l'instant. Ajoutez-en avec l'étoile d'une mini-app."}
      </p>
    {/if}
  </section>

  <section class="section">
    <h2>Documents récents</h2>
    <RecentDocs empty="Vos calculs récents apparaîtront ici." />
  </section>
</div>
