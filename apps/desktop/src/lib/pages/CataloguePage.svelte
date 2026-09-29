<script lang="ts">
  // Catalogue des plugins (maquette validée par Bryan, docs/13) : installer, mettre à jour, activer,
  // désactiver, désinstaller, ou installer depuis un fichier. Le travail est fait par Rust.
  import type { CatalogueEntry } from "$lib/api";
  import { inTauri } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import Switch from "$lib/components/Switch.svelte";
  import Tile from "$lib/components/Tile.svelte";
  import { ICONS, type IconName } from "$lib/icons";
  import { PLUGINS, getPlugin } from "$lib/plugins/registry.svelte";
  import { catalogue } from "$lib/state/catalogue.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import type { PluginManifest } from "$lib/types";

  let filter = $state<"tous" | "installes">("tous");
  /** Plugin dont on demande confirmation de la désinstallation. */
  let confirm = $state<PluginManifest | null>(null);

  $effect(() => {
    if (catalogue.status === "idle") void catalogue.load();
  });

  interface Card {
    id: string;
    entry: CatalogueEntry | null;
    installed: PluginManifest | undefined;
    name: string;
    description: string;
    version: string;
    color: string;
    icon: IconName;
    apps: { name: string }[];
    size: number | null;
  }

  const iconOf = (value: string): IconName => (value in ICONS ? (value as IconName) : "puzzle");

  // Plugins du catalogue, puis ceux installés autrement (intégrés en développement, déposés à la main).
  const cards = $derived.by((): Card[] => {
    const fromCatalogue: Card[] = catalogue.entries.map((entry) => ({
      id: entry.id,
      entry,
      installed: getPlugin(entry.id),
      name: entry.name,
      description: entry.description,
      version: entry.version,
      color: entry.color,
      icon: iconOf(entry.icon),
      apps: entry.miniApps.map((a) => ({ name: a.name })),
      size: entry.size,
    }));
    const others: Card[] = PLUGINS.filter((p) => !catalogue.entries.some((e) => e.id === p.id)).map((p) => ({
      id: p.id,
      entry: null,
      installed: p,
      name: p.name,
      description: p.description,
      version: p.version,
      color: p.color,
      icon: p.icon,
      apps: p.miniApps.map((a) => ({ name: a.name })),
      size: null,
    }));
    return [...fromCatalogue, ...others];
  });
  const installedCount = $derived(cards.filter((c) => c.installed).length);
  const shown = $derived(filter === "installes" ? cards.filter((c) => c.installed) : cards);

  const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.round(bytes / 1024)} Ko`);

  async function uninstall(): Promise<void> {
    const plugin = confirm;
    confirm = null;
    if (plugin) await catalogue.uninstall(plugin.id);
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && confirm) {
      event.stopPropagation();
      confirm = null;
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="page">
  <header class="head">
    <div>
      <h1>Catalogue</h1>
      <p class="sub">Les plugins officiels d'Établi. Tout est gratuit et fonctionne sans compte.</p>
      <span class="trust"><Icon name="shield" size={14} /> Signés et vérifiés avant chaque installation</span>
    </div>
    {#if inTauri}
      <button class="btn" onclick={() => void catalogue.installFile()}><Icon name="package" size={16} /> Installer depuis un fichier…</button>
    {/if}
  </header>

  <div class="filters" role="tablist" aria-label="Filtre">
    <button role="tab" aria-selected={filter === "tous"} class:on={filter === "tous"} onclick={() => (filter = "tous")}>Tous ({cards.length})</button>
    <button role="tab" aria-selected={filter === "installes"} class:on={filter === "installes"} onclick={() => (filter = "installes")}>
      Installés ({installedCount})
    </button>
  </div>

  {#if catalogue.status === "loading" && !catalogue.entries.length}
    <p class="empty">Chargement du catalogue…</p>
  {:else if catalogue.status === "error"}
    <div class="error">
      <span>{catalogue.error}</span>
      <button class="btn" onclick={() => void catalogue.load()}><Icon name="refresh" size={16} /> Réessayer</button>
    </div>
  {/if}

  <div class="cards">
    {#each shown as card (card.id)}
      {@const enabled = !!card.installed && settings.isPluginEnabled(card.id)}
      {@const progress = catalogue.progress[card.id]}
      <article class="card" class:off={card.installed && !enabled}>
        <div class="tile"><Tile color={card.color} icon={card.icon} variant="soft" size={52} /></div>
        <div class="body">
          <div class="name">
            <b>{card.name}</b>
            <span class="pill mono">v{card.installed?.version ?? card.version}</span>
            {#if card.installed}
              <span class="pill" class:state={enabled}>{enabled ? "Installé" : "Désactivé"}</span>
            {/if}
            {#if card.entry && catalogue.hasUpdate(card.entry)}
              <span class="pill new">Version {card.entry.version} disponible</span>
            {/if}
          </div>
          <p>{card.description}</p>
          <div class="chips">
            {#each card.apps as app (app.name)}<span class="chip">{app.name}</span>{/each}
          </div>
          <div class="meta">
            {card.apps.length} mini-app{card.apps.length > 1 ? "s" : ""}{card.size ? ` · ${size(card.size)}` : ""} ·
            {card.installed?.source === "utilisateur" ? "ajouté à la main" : card.installed?.source === "integre" ? "intégré" : "officiel"}
          </div>
        </div>
        <div class="actions">
          {#if progress !== undefined}
            <div class="progress" aria-live="polite">
              <div class="bar"><span style:width="{Math.max(8, progress)}%"></span></div>
              <small>Installation… {progress > 0 ? `${progress} %` : ""}</small>
            </div>
          {:else if !card.installed && card.entry}
            <button class="btn primary" disabled={!inTauri} onclick={() => card.entry && void catalogue.install(card.entry)}>Installer</button>
          {:else if card.installed}
            {#if card.entry && catalogue.hasUpdate(card.entry)}
              <button class="btn primary" onclick={() => card.entry && void catalogue.install(card.entry)}>Mettre à jour</button>
            {/if}
            <div class="switch">
              <span>{enabled ? "Activé" : "Désactivé"}</span>
              <Switch checked={enabled} label="Activer {card.name}" onchange={() => settings.togglePlugin(card.id)} />
            </div>
            {#if card.installed.source === "catalogue"}
              <button class="btn danger" onclick={() => (confirm = card.installed ?? null)}>Désinstaller</button>
            {/if}
          {/if}
        </div>
      </article>
    {:else}
      {#if catalogue.status !== "loading" && catalogue.status !== "error"}
        <p class="empty">{filter === "installes" ? "Aucun plugin installé pour l'instant." : "Le catalogue est vide."}</p>
      {/if}
    {/each}
  </div>

  <p class="hint">
    Mises à jour automatiques : au démarrage, Établi installe les nouvelles versions des plugins, sans redémarrer, et vous
    prévient. Désinstaller un plugin garde vos calculs.
  </p>
</div>

{#if confirm}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={() => (confirm = null)}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="titre-desinstaller" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <h2 id="titre-desinstaller">Désinstaller {confirm.name} ?</h2>
      <p>
        Ses mini-apps disparaissent d'Établi. <b>Vos calculs sont conservés</b> dans le dossier des documents : vous les
        retrouverez si vous le réinstallez.
      </p>
      <div class="buttons">
        <button class="btn" onclick={() => (confirm = null)}>Annuler</button>
        <button class="btn primary" onclick={() => void uninstall()}>Désinstaller</button>
      </div>
    </div>
  </div>
{/if}

<style>
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
  .filters {
    align-self: flex-start;
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border-radius: var(--r-sm);
    background: var(--field);
    margin-top: -8px;
  }
  .filters button {
    height: 28px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--r-xs);
    background: none;
    color: var(--muted);
    font-size: 13px;
    font-weight: 500;
  }
  .filters button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
  .error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--err) 10%, transparent);
    color: var(--err);
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
  .pill.new {
    background: var(--accent-soft);
    color: var(--accent);
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
  .progress {
    width: 150px;
  }
  .progress .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--field);
    overflow: hidden;
  }
  .progress .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.15s linear;
  }
  .progress small {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--muted);
    text-align: right;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 16px;
    background: var(--scrim);
    animation: fade-in 0.12s ease-out;
  }
  .dialog {
    width: min(460px, 100%);
    padding: 20px;
    border-radius: var(--r-lg);
    background: var(--surface);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .dialog h2 {
    margin: 0;
    font-size: 16px;
  }
  .dialog p {
    margin: 0;
    color: var(--muted);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
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
