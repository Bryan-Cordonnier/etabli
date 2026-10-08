<script lang="ts">
  // Plugins installés (maquette validée par Bryan, docs/13) : activer, désactiver, désinstaller, ou installer depuis un
  // fichier `.etabli-plugin` signé. Le moteur n'a ni catalogue ni magasin : un plugin arrive par un fichier.
  import { api } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import Switch from "$lib/components/Switch.svelte";
  import Tile from "$lib/components/Tile.svelte";
  import { PLUGINS, REFUSES, getPlugin } from "$lib/plugins/registry.svelte";
  import { installation } from "$lib/state/installation.svelte";
  import { lifecycle } from "$lib/state/lifecycle.svelte";
  import { settings } from "$lib/state/settings.svelte";

  const cards = $derived(PLUGINS);

  /** Nom d'un plugin cité par un autre : celui de l'installé, sinon son identifiant. */
  const nameOf = (id: string) => getPlugin(id)?.name ?? id;
  const origin = (source: string) => (source === "utilisateur" ? "ajouté à la main" : source === "integre" ? "intégré" : "installé depuis un fichier");
</script>

<div class="page">
  <header class="head">
    <div>
      <h1>Plugins</h1>
      <p class="sub">Les plugins installés. Chaque plugin apporte ses pages, ses paramètres ou ses services.</p>
      <span class="trust"><Icon name="shield" size={14} /> Signature vérifiée avant chaque installation</span>
    </div>
    {#if api.capacites.plugins}
      <button class="btn" onclick={() => void installation.installFile()}><Icon name="package" size={16} /> Installer depuis un fichier…</button>
    {/if}
  </header>

  <div class="cards">
    {#each cards as plugin (plugin.id)}
      {@const enabled = settings.isPluginEnabled(plugin.id)}
      <article class="card" class:off={!enabled}>
        <div class="tile"><Tile color={plugin.color} icon={plugin.icon} variant="soft" size={52} /></div>
        <div class="body">
          <div class="name">
            <b>{plugin.name}</b>
            <span class="pill mono">v{plugin.version}</span>
            <span class="pill" class:state={enabled}>{enabled ? "Installé" : "Désactivé"}</span>
          </div>
          <p>{plugin.description}</p>
          <div class="chips">
            {#each plugin.pages as page (page.id)}<span class="chip">{page.title}</span>{/each}
            {#each plugin.settings as page (page.id)}<span class="chip setting">Réglages : {page.title}</span>{/each}
          </div>
          {#if Object.keys(plugin.dependencies).length || Object.keys(plugin.optionalDependencies).length}
            <p class="deps">
              {#if Object.keys(plugin.dependencies).length}<span>A besoin de : <b>{Object.keys(plugin.dependencies).map(nameOf).join(", ")}</b></span>{/if}
              {#if Object.keys(plugin.optionalDependencies).length}<span>Fonctionne mieux avec : {Object.keys(plugin.optionalDependencies).map(nameOf).join(", ")}</span>{/if}
            </p>
          {/if}
          <div class="meta">
            {plugin.pages.length
              ? `${plugin.pages.length} page${plugin.pages.length > 1 ? "s" : ""}`
              : "Services ou paramètres pour d'autres plugins"} · {origin(plugin.source)}
          </div>
        </div>
        <div class="actions">
          <div class="switch">
            <span>{enabled ? "Activé" : "Désactivé"}</span>
            <Switch checked={enabled} label="Activer {plugin.name}" onchange={() => lifecycle.toggle(plugin.id)} />
          </div>
          {#if plugin.source === "installe"}
            <button class="btn danger" onclick={() => lifecycle.askUninstall(plugin.id)}>Désinstaller</button>
          {/if}
        </div>
      </article>
    {:else}
      <p class="empty">Aucun plugin installé pour l'instant.</p>
    {/each}
  </div>

  {#if REFUSES.length}
    <section class="refuses" aria-label="Plugins refusés">
      <h2>Plugins non chargés</h2>
      {#each REFUSES as refuse (refuse.id)}
        <p><b>{refuse.name}</b> : {refuse.reason}</p>
      {/each}
    </section>
  {/if}

  <p class="hint">Désinstaller un plugin garde vos données.</p>
</div>
<style>
  .refuses {
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--warn) 12%, transparent);
    padding: 12px 16px;
  }
  .refuses h2 {
    margin: 0 0 6px;
    font-size: 14px;
  }
  .refuses p {
    margin: 4px 0;
    font-size: 13px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }
  .trust {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 3px 10px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--ok) 14%, transparent);
    color: var(--ok);
    font-size: 12px;
    font-weight: 600;
  }
  .cards {
    display: grid;
    gap: 10px;
    margin-top: -8px;
  }
  .card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 16px;
    align-items: start;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--surface);
    animation: fade-in 0.18s ease-out;
  }
  .card.off {
    background: var(--surface-2);
  }
  .card.off .body,
  .card.off .tile {
    opacity: 0.6;
  }
  .name {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .name b {
    font-size: 15px;
    font-weight: 600;
  }
  .pill.mono {
    font-family: var(--mono);
  }
  .pill.state {
    background: color-mix(in srgb, var(--ok) 14%, transparent);
    color: var(--ok);
  }
  .body p {
    margin: 4px 0 8px;
    color: var(--muted);
    max-width: 70ch;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip.setting {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .deps {
    margin: 8px 0 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12.5px;
    color: var(--muted);
  }
  .deps b {
    color: var(--text);
  }
  .chip {
    padding: 2px 8px;
    border-radius: var(--r-xs);
    background: var(--field);
    font-size: 12px;
    color: var(--muted);
  }
  .meta {
    margin-top: 8px;
    font-size: 12px;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    min-width: 150px;
  }
  .switch {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--muted);
  }
  .btn.danger {
    color: var(--err);
  }
  @media (max-width: 760px) {
    .card {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .actions {
      grid-column: 1 / -1;
      flex-direction: row;
      justify-content: flex-end;
      min-width: 0;
    }
  }
</style>
