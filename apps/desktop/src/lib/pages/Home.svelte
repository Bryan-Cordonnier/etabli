<script lang="ts">
  import { api } from "$lib/api";
  import AppCard from "$lib/components/AppCard.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import SearchBox from "$lib/components/SearchBox.svelte";
  import { allPages, getPageByKey, pageKey, type PageRef } from "$lib/plugins/registry.svelte";
  import { installation } from "$lib/state/installation.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { normalize } from "$lib/views";

  let query = $state("");

  // Nouvel onglet (« + » ou raccourci) : le curseur est déjà dans la recherche, comme dans un navigateur.
  const focusSearch = ui.focusSearch;
  ui.focusSearch = false;

  const available = (ref: PageRef | undefined): ref is PageRef => !!ref && settings.isPluginEnabled(ref.plugin.id);

  const favorites = $derived(settings.favorites.map(getPageByKey).filter(available));

  const searching = $derived(query.trim().length > 0);
  const results = $derived(
    searching
      ? allPages()
          .filter(available)
          .filter((r) => normalize(`${r.page.title} ${r.plugin.name}`).includes(normalize(query.trim())))
      : favorites,
  );

  function open(ref: PageRef, event: MouseEvent): void {
    tabs.navigate({ kind: "page", pluginId: ref.plugin.id, pageId: ref.page.id }, { newTab: event.ctrlKey || event.button === 1 });
  }
</script>
{#if !allPages().length}
  <!-- Premier lancement (l'installateur ne contient aucun plugin) : bienvenue et installation depuis un fichier. -->
  <div class="page">
    <div class="welcome">
      <div class="mark"><Icon name="store" size={30} /></div>
      <h1>Bienvenue dans Établi</h1>
      <p>
        Établi est un moteur de plugins : chaque plugin ajoute ses pages et ses réglages. Installez ceux dont vous
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
    <p class="sub">Que voulez-vous ouvrir ?</p>
  </header>

  <SearchBox big focus={focusSearch} bind:value={query} placeholder="Rechercher une page…" />

  <section class="section">
    <h2>{searching ? `Résultats (${results.length})` : "Favoris"}</h2>
    {#if results.length}
      <div class="grid">
        {#each results as ref, i (pageKey(ref.plugin.id, ref.page.id))}
          <AppCard plugin={ref.plugin} page={ref.page} index={i} showPlugin onopen={(e) => open(ref, e)} />
        {/each}
      </div>
    {:else}
      <p class="empty">
        {searching
          ? "Aucune page ne correspond."
          : "Aucun favori pour l'instant. Ajoutez-en avec l'étoile d'une page."}
      </p>
    {/if}
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
