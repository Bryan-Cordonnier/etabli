<script lang="ts">
  import { api } from "$lib/api";
  import AppCard from "$lib/components/AppCard.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import RecentDocs from "$lib/components/RecentDocs.svelte";
  import SearchBox from "$lib/components/SearchBox.svelte";
  import { allMiniApps, appKey, getMiniAppByKey, pluginsWithApps, type MiniAppRef } from "$lib/plugins/registry.svelte";
  import { installation } from "$lib/state/installation.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { normalize } from "$lib/views";

  let query = $state("");

  // Nouvel onglet (« + » ou raccourci) : le curseur est déjà dans la recherche, comme dans un navigateur.
  const focusSearch = ui.focusSearch;
  ui.focusSearch = false;

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

{#if !pluginsWithApps().length}
  <!-- Premier lancement (l'installateur ne contient aucun plugin) : bienvenue et installation depuis un fichier. -->
  <div class="page">
    <div class="welcome">
      <div class="mark"><Icon name="store" size={30} /></div>
      <h1>Bienvenue dans Établi</h1>
      <p>
        Établi est un moteur de plugins : chaque plugin ajoute ses mini-apps et ses réglages. Installez ceux dont vous
        avez besoin, depuis un fichier signé.
      </p>
      {#if api.capacites.plugins}
        <button class="btn primary big" onclick={() => void installation.installFile()}>
          <Icon name="package" size={18} /> Installer un plugin depuis un fichier…
        </button>
        <button class="link" onclick={() => tabs.navigate({ kind: "plugins" })}>Ouvrir la page des plugins</button>
        <p class="hint">Les plugins sont signés : Établi vérifie chaque installation.</p>
      {:else if api.id === "serveur"}
        <p class="hint">Aucun plugin n'est encore disponible sur ce serveur : demandez à l'administrateur d'en installer (Paramètres → Administration).</p>
      {/if}
    </div>
  </div>
{:else}
<div class="page">
  <header>
    <h1>Bonjour</h1>
    <p class="sub">Que voulez-vous calculer ?</p>
  </header>

  <SearchBox big focus={focusSearch} bind:value={query} placeholder="Rechercher une mini-app…" />

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
{/if}

<style>
  .welcome {
    max-width: 620px;
    margin: 48px auto 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-align: center;
  }
  .welcome .mark {
    width: 64px;
    height: 64px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .welcome h1 {
    font-size: 26px;
  }
  .welcome p {
    margin: 0;
    color: var(--muted);
    max-width: 52ch;
  }
  .welcome .hint {
    color: var(--faint);
  }
  .big {
    height: 44px;
    padding: 0 20px;
    font-size: 15px;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--accent);
    font-weight: 500;
  }
</style>
