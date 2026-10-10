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

  const dateDuJour = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const ouvrir = (ref: PageRef): void => tabs.navigate({ kind: "page", pluginId: ref.plugin.id, pageId: ref.page.id });
</script>

<div class="accueil">
  <header>
    <Logo size={40} />
    <h1>{distribution.name}</h1>
    <p>{dateDuJour}</p>
  </header>

  <nav aria-label="Pages">
    {#if !pages.length}<p class="vide">Aucune page : installez un plugin.</p>{/if}
    {#snippet carte(ref: PageRef)}
      <button class="carte" onclick={() => ouvrir(ref)}>
        <Tile color={ref.plugin.color} icon={ref.page.icon} size={40} />
        <span class="texte">
          <span class="nom">{ref.page.title}</span>
          <span class="sous">{ref.plugin.name}</span>
        </span>
        <Icon name="next" size={18} />
      </button>
    {/snippet}
    {#if settings.sidebarCategories}
      {#each groupes as g (g.name)}
        <div class="categorie">{g.name}</div>
        {#each g.items as { ref, key } (key)}{@render carte(ref)}{/each}
      {/each}
    {:else}
      {#each pages as { ref, key } (key)}{@render carte(ref)}{/each}
    {/if}
  </nav>

  <footer>
    <button class="carte" onclick={() => tabs.navigate({ kind: "settings" })}>
      <Tile color="var(--muted)" icon="settings" variant="plain" size={40} />
      <span class="texte"><span class="nom">Paramètres</span><span class="sous">Apparence, serveur, plugins…</span></span>
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
    display: grid;
    grid-template-columns: auto auto;
    justify-content: center;
    align-items: center;
    column-gap: 10px;
    padding: calc(2px + env(safe-area-inset-top, 0px)) 16px 6px;
  }
  header :global(svg),
  header :global(img) {
    grid-row: 1 / 3;
    display: block;
  }
  h1 {
    margin: 0;
    font-size: 21px;
    line-height: 1.1;
    letter-spacing: -0.03em;
  }
  header p {
    margin: 0;
    font-size: 12.5px;
    color: var(--muted);
    text-transform: capitalize;
  }  nav {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 16px 8px;
  }
  .carte {
    width: 100%;
    flex: none;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 7px 12px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--surface-2);
    color: var(--text);
    text-align: left;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  }
  .carte:active {
    background: var(--field);
    transform: scale(0.99);
  }
  .carte > :global(svg) {
    color: var(--faint);
  }
  .texte {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nom {
    font-size: 16.5px;
    font-weight: 700;
  }
  .sous {
    font-size: 12.5px;
    color: var(--muted);
  }
  .categorie {
    padding: 8px 6px 0;
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
    padding: 2px 16px calc(8px + env(safe-area-inset-bottom, 0px));
  }
</style>