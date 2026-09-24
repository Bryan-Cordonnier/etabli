<script lang="ts">
  // Aperçu rapide : les mini-apps favorites, utilisables directement par-dessus n'importe quel
  // logiciel. Flèches pour choisir, Entrée pour ouvrir, Échap pour revenir puis fermer.
  import type { MachineKind, PluginToHost } from "@etabli/sdk/protocol";
  import { onMount, tick } from "svelte";
  import { inTauri, system } from "$lib/api";
  import { applyAppearance } from "$lib/appearance";
  import Icon from "$lib/components/Icon.svelte";
  import MiniAppFrame from "$lib/components/MiniAppFrame.svelte";
  import Tile from "$lib/components/Tile.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import { DocumentSession } from "$lib/documents.svelte";
  import { appKey, getMiniAppByKey, pluginUrl, type MiniAppRef } from "$lib/plugins/registry";
  import { libraries } from "$lib/state/libraries.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { reloadStorage } from "$lib/storage";

  /** Durée des fondus d'ouverture et de fermeture (voir le CSS). */
  const FADE = 150;

  let session = $state<DocumentSession | null>(null);
  let selected = $state(0);
  let grid = $state<HTMLElement>();
  let openedAt = 0;
  let closing = false;

  // Le contenu est effacé en fondu AVANT de masquer la fenêtre : à la réouverture, la fenêtre
  // réapparaît vide, puis le panneau apparaît en fondu (aucun ancien contenu qui saute).
  let shown = $state(!inTauri);

  /** Clic dans un autre logiciel : l'aperçu se ferme. Le focus qui passe dans une mini-app
   *  (son cadre) déclenche aussi « blur », mais le document garde alors le focus. */
  function onblur(): void {
    setTimeout(() => {
      if (!document.hasFocus() && Date.now() - openedAt > 400) void close();
    }, 60);
  }

  const favorites = $derived(
    settings.favorites
      .map(getMiniAppByKey)
      .filter((ref): ref is MiniAppRef => !!ref && settings.isPluginEnabled(ref.plugin.id)),
  );
  const current = $derived(session ? getMiniAppByKey(appKey(session.pluginId, session.appId)) : undefined);

  $effect(() => applyAppearance());

  onMount(() => {
    // Chaque ouverture : réglages relus (la fenêtre principale a pu les changer), retour à la grille.
    const unlistenOpen = system.onQuickOpened(async () => {
      openedAt = Date.now();
      closing = false;
      selected = 0;
      shown = true;
      await Promise.all([reloadStorage(), libraries.load()]);
      settings.reload();
      await tick();
      focusSelected();
    });
    const unlistenClose = system.onQuickCloseRequest(() => void close());
    return () => {
      void unlistenOpen.then((stop) => stop());
      void unlistenClose.then((stop) => stop());
    };
  });

  async function leaveApp(): Promise<void> {
    if (!session) return;
    const leaving = session;
    session = null;
    await leaving.saveNow();
  }

  async function close(): Promise<void> {
    if (closing) return;
    closing = true;
    shown = false;
    await new Promise((resolve) => setTimeout(resolve, FADE));
    await system.closeQuick();
    await leaveApp();
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
    }
    shown = false;
    await system.showMain();
    session = null;
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
    else if (message.type === "addMachine") void addMachine(message);
    else if (message.type === "send") void send(message);
  }

  /** L'envoi ouvre un nouvel onglet : le calcul passe dans l'Établi, qui ouvre la mini-app cible. */
  async function send({ kind, data }: { kind: string; data: unknown }): Promise<void> {
    const from = current?.app.name ?? "";
    await openInEtabli();
    await system.requestSend({ kind, data, from });
  }

  /** Les machines se règlent dans les Paramètres : le calcul passe dans l'Établi, qui les ouvre. */
  async function addMachine({ kind }: { kind: MachineKind }): Promise<void> {
    await openInEtabli();
    await system.requestMachine(kind);
  }
</script>

<svelte:window {onkeydown} {onblur} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" class:shown onpointerdown={(e) => e.target === e.currentTarget && void close()}>
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
              docTitle={session.title}
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
</div>
<Toast />

<style>
  :global(html),
  :global(body) {
    background: transparent;
  }
  /* Voile simple en fondu : pas de flou (l'acrylique de Windows ne peut pas s'animer) ni de zoom. */
  .scrim {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 5vh 7vw;
    /* Sans flou derrière, un voile plus sombre que celui de l'application détache le panneau. */
    background: rgba(10, 14, 20, 0.42);
    opacity: 0;
    transition: opacity 0.15s ease-out;
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
  }
  /* Ouverture et fermeture en fondu, à partir d'une fenêtre toujours vide (voir `shown`). */
  .scrim.shown {
    opacity: 1;
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
    border-radius: var(--r-md);
    background: var(--accent);
    color: var(--accent-text);
    display: grid;
    place-items: center;
  }
  .back {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: var(--r-md);
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
    border-radius: var(--r-xs);
    padding: 0 4px;
    color: var(--muted);
  }
</style>
