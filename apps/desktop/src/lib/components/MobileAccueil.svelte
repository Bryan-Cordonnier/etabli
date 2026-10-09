<script lang="ts">
  // Accueil sur téléphone : comme une messagerie. Le nom de l'application en haut, la liste des pages au centre,
  // les paramètres en bas. Toucher une page l'ouvre en plein écran ; le retour (bouton ou geste) revient ici.
  import { distribution } from "$lib/distribution";
  import { grouper } from "$lib/categories";
  import { allPages, pageKey, type PageRef } from "$lib/plugins/registry.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import Icon from "./Icon.svelte";
  import Logo from "./Logo.svelte";
  import Tile from "./Tile.svelte";

  const pages = $derived.by(() => {
    const order = settings.pageOrder;
    const rank = (key: string) => {
      const index = order.indexOf(key);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return allPages()
      .filter((p) => settings.isPluginEnabled(p.plugin.id))
      .map((ref, index) => ({ ref, index, key: pageKey(ref.plugin.id, ref.page.id) }))
      .sort((a, b) => rank(a.key) - rank(b.key) || a.index - b.index);
  });
  const groupes = $derived(
    grouper(
      pages.map((p) => ({ ...p, category: p.ref.page.category })),
      settings.categoryOf,
      settings.categoryOrder,
    ),
  );

  const ouvrir = (ref: PageRef): void => tabs.navigate({ kind: "page", pluginId: ref.plugin.id, pageId: ref.page.id });
</script>

<div class="accueil">
  <header>
    <Logo size={30} />
    <h1>{distribution.name}</h1>
  </header>

  <nav aria-label="Pages">
    {#if !pages.length}<p class="vide">Aucune page : installez un plugin.</p>{/if}
    {#snippet ligne(ref: PageRef)}
      <button class="ligne" onclick={() => ouvrir(ref)}>
        <Tile color={ref.plugin.color} icon={ref.page.icon} size={44} />
        <span class="nom">{ref.page.title}</span>
        <Icon name="next" size={18} />
      </button>
    {/snippet}
    {#if settings.sidebarCategories}
      {#each groupes as g (g.name)}
        <div class="categorie">{g.name}</div>
        {#each g.items as { ref, key } (key)}{@render ligne(ref)}{/each}
      {/each}
    {:else}
      {#each pages as { ref, key } (key)}{@render ligne(ref)}{/each}
    {/if}
  </nav>

  <footer>
    <button class="ligne reglages" onclick={() => tabs.navigate({ kind: "settings" })}>
      <Icon name="settings" size={22} />
      <span class="nom">Paramètres</span>
      <Icon name="next" size={18} />
    </button>
  </footer>
</div>

<style>
  .accueil {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface);
  }
  header {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: calc(14px + env(safe-area-inset-top, 0px)) 16px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }
  h1 {
    margin: 0;
    font-size: 20px;
    letter-spacing: -0.02em;
  }
  nav {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .ligne {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 18px;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: none;
    color: var(--text);
    text-align: left;
  }
  .ligne:active {
    background: var(--field);
  }
  .nom {
    flex: 1;
    min-width: 0;
    font-size: 16px;
    font-weight: 600;
  }
  .categorie {
    padding: 14px 18px 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .vide {
    padding: 24px 18px;
    text-align: center;
    color: var(--muted);
  }
  footer {
    flex: none;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    border-top: 1px solid var(--border);
    background: var(--surface-2);
  }
  .reglages {
    border-bottom: 0;
    color: var(--muted);
  }
</style>