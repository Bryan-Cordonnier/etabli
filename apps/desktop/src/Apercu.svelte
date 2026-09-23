<script lang="ts">
  // Aperçu rapide : les mini-apps favorites, utilisables directement par-dessus n'importe quel
  // logiciel. Flèches pour choisir, Entrée pour ouvrir, Échap pour revenir puis fermer.
  import type { PluginToHost } from "@etabli/sdk/protocol";
  import { onMount, tick } from "svelte";
  import { system } from "$lib/api";
  import { applyAppearance } from "$lib/appearance";
  import Icon from "$lib/components/Icon.svelte";
  import MiniAppFrame from "$lib/components/MiniAppFrame.svelte";
  import Tile from "$lib/components/Tile.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import { DocumentSession } from "$lib/documents.svelte";
  import { appKey, getMiniAppByKey, pluginUrl, type MiniAppRef } from "$lib/plugins/registry";
  import { settings } from "$lib/state/settings.svelte";
  import { reloadStorage } from "$lib/storage";

  let session = $state<DocumentSession | null>(null);
  let selected = $state(0);
  let openings = $state(0);
  let grid = $state<HTMLElement>();

  const favorites = $derived(
    settings.favorites
      .map(getMiniAppByKey)
      .filter((ref): ref is MiniAppRef => !!ref && settings.isPluginEnabled(ref.plugin.id)),
  );
  const current = $derived(session ? getMiniAppByKey(appKey(session.pluginId, session.appId)) : undefined);

  $effect(() => applyAppearance());

  onMount(() => {
    // Chaque ouverture : réglages relus (la fenêtre principale a pu les changer), retour à la grille.
    const unlisten = system.onQuickOpened(async () => {
      await leaveApp();
      await reloadStorage();
      settings.reload();
      selected = 0;
      openings++;
      await tick();
      focusSelected();
    });
    return () => void unlisten.then((stop) => stop());
  });

  async function leaveApp(): Promise<void> {
    if (!session) return;
    const closing = session;
    session = null;
    await closing.saveNow();
  }

  async function close(): Promise<void> {
    await leaveApp();
    await system.closeQuick();
  }

  async function openApp(ref: MiniAppRef): Promise<void> {
    const next = new DocumentSession(ref);
    await next.load();
    session = next;
  }

  async function backToGrid(): Promise<void> {
    await leaveApp();
    await tick();
    focusSelected();
  }

  /** Ouvre l'application complète, avec le calcul en cours dans un nouvel onglet s'il y en a un. */
  async function openInEtabli(): Promise<void> {
    if (session) {
      await session.saveNow();
      await system.openInMain({ kind: "app", pluginId: session.pluginId, appId: session.appId, docId: session.meta?.id });
      session = null;
    }
    await system.showMain();
  }

  function focusSelected(): void {
    grid?.querySelectorAll<HTMLElement>(".fav")[selected]?.focus();
  }

  /** Nombre de colonnes réellement affichées, pour les flèches haut et bas. */
  function columns(): number {
    const tiles = [...(grid?.querySelectorAll<HTMLElement>(".fav") ?? [])];
    const top = tiles[0]?.offsetTop;
    return Math.max(1, tiles.filter((t) => t.offsetTop === top).length);
  }

  function onEscape(): void {
    if (session) void backToGrid();
    else void close();
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }
    if (session || !favorites.length) return;

    const count = favorites.length;
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns(),
      ArrowUp: -columns(),
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      selected = Math.min(count - 1, Math.max(0, selected + move));
      focusSelected();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const ref = favorites[selected];
      if (ref) void openApp(ref);
    } else if (/^[1-9]$/.test(event.key)) {
      const ref = favorites[Number(event.key) - 1];
      if (ref) {
        event.preventDefault();
        selected = Number(event.key) - 1;
        void openApp(ref);
      }
    }
  }

  function onmessage(message: PluginToHost): void {
    if (session?.handle(message)) return;
    if (message.type === "shortcut" && message.key === "Escape") onEscape();
  }
</script>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" onpointerdown={(e) => e.target === e.currentTarget && void close()}>
  {#key openings}
    <div class="panel" role="dialog" aria-modal="true" aria-label="Aperçu rapide">
      <header class="head">
        {#if session && current}
          <button class="back" onclick={backToGrid} aria-label="Retour aux favoris" title="Retour (Échap)">
            <Icon name="back" size={18} />
          </button>
          <Tile color={current.plugin.color} icon={current.app.icon} emoji={current.app.emoji} variant="soft" size={32} />
          <h1>{current.app.name}</h1>
          <span class="pill">{current.plugin.name}</span>
          <button class="btn primary open" onclick={openInEtabli}>Ouvrir dans l'Établi</button>
        {:else}
          <span class="logo"><Icon name="zap" size={16} /></span>
          <h1>Aperçu rapide</h1>
          <button class="btn primary open" onclick={openInEtabli}>Ouvrir l'Établi</button>
        {/if}
      </header>

      <div class="body">
        {#if session && current}
          {#if current.app.entry && session.initial}
            <MiniAppFrame
              src={pluginUrl(current.plugin.id, current.app.entry)}
              title={current.app.name}
              pluginId={current.plugin.id}
              appId={current.app.id}
              initial={session.initial}
              {onmessage}
            />
          {:else}
            <p class="empty">« {current.app.name} » n'est pas encore développée.</p>
          {/if}
        {:else if favorites.length}
          <div class="grid" bind:this={grid}>
            {#each favorites as ref, i (appKey(ref.plugin.id, ref.app.id))}
              <button
                class="fav"
                class:sel={i === selected}
                style:--c={ref.plugin.color}
                style:animation-delay="{i * 15}ms"
                onclick={() => void openApp(ref)}
                onfocus={() => (selected = i)}
              >
                <Tile color={ref.plugin.color} icon={ref.app.icon} emoji={ref.app.emoji} variant="soft" />
                <span class="name">{ref.app.name}</span>
                <span class="from">{ref.plugin.name}</span>
                {#if i < 9}<kbd class="num">{i + 1}</kbd>{/if}
              </button>
            {/each}
          </div>
        {:else}
          <p class="empty">
            Aucun favori pour l'instant. Dans l'Établi, cliquez sur l'étoile d'une mini-app pour l'ajouter ici.
          </p>
        {/if}
      </div>

      <footer class="foot">
        {#if session}
          <span><kbd>Tab</kbd> champ suivant</span>
          <span><kbd>Clic</kbd> sur un résultat : copier</span>
          <span><kbd>Échap</kbd> retour aux favoris</span>
        {:else}
          <span><kbd>← ↑ → ↓</kbd> choisir</span>
          <span><kbd>Entrée</kbd> ouvrir</span>
          <span><kbd>1</kbd>–<kbd>9</kbd> accès direct</span>
          <span><kbd>Échap</kbd> fermer</span>
        {/if}
      </footer>
    </div>
  {/key}
</div>
<Toast />

<style>
  :global(html),
  :global(body) {
    background: transparent;
  }
  .scrim {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 5vh 7vw;
    background: var(--scrim);
    animation: fade-in 0.12s ease-out;
  }
  .panel {
    width: min(1000px, 100%);
    height: min(680px, 100%);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow);
    overflow: hidden;
    animation: zoom 0.12s ease-out;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 60px;
    padding: 0 14px 0 18px;
    border-bottom: 1px solid var(--border);
    flex: none;
  }
  h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .logo {
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: var(--accent);
    color: var(--accent-text);
    display: grid;
    place-items: center;
  }
  .back {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 9px;
    background: var(--field);
    color: var(--muted);
    display: grid;
    place-items: center;
  }
  .back:hover {
    color: var(--text);
  }
  .open {
    margin-left: auto;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }
  .fav {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    text-align: left;
    animation: rise 0.2s ease-out both;
    transition:
      transform 0.12s ease-out,
      border-color 0.12s,
      box-shadow 0.12s;
  }
  .fav:hover,
  .fav.sel {
    transform: translateY(-2px);
    border-color: var(--c);
    box-shadow: 0 6px 18px color-mix(in srgb, var(--c) 18%, transparent);
  }
  .fav:focus-visible {
    outline: none;
  }
  .name {
    font-weight: 600;
  }
  .from {
    margin-top: -4px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--c);
  }
  .num {
    position: absolute;
    top: 12px;
    right: 12px;
  }
  .empty {
    margin: 40px auto;
    max-width: 420px;
    text-align: center;
    color: var(--faint);
  }
  .foot {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
    padding: 10px 18px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--faint);
    flex: none;
  }
  kbd {
    font: 11px var(--mono);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 4px;
    color: var(--muted);
  }
  @keyframes zoom {
    from {
      transform: scale(0.97);
      opacity: 0;
    }
    to {
      transform: none;
      opacity: 1;
    }
  }
</style>
