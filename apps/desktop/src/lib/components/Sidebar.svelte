<script lang="ts">
  // Colonne des plugins (cahier des charges, section 5.2).
  import { PLUGINS } from "$lib/plugins/registry";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import type { PluginManifest, View } from "$lib/types";
  import Icon from "./Icon.svelte";
  import Logo from "./Logo.svelte";
  import Tile from "./Tile.svelte";

  /** Plugins actifs, dans l'ordre choisi par glisser-déposer (les nouveaux à la fin). */
  const plugins = $derived.by(() => {
    const order = settings.pluginOrder;
    const rank = (id: string) => {
      const index = order.indexOf(id);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return PLUGINS.filter((p) => settings.isPluginEnabled(p.id))
      .map((plugin, index) => ({ plugin, index }))
      .sort((a, b) => rank(a.plugin.id) - rank(b.plugin.id) || a.index - b.index)
      .map(({ plugin }) => plugin);
  });

  let nav: HTMLElement;
  let drag: { id: string; startY: number; moved: boolean } | null = null;
  let dragging = $state<string | null>(null);
  let justDragged = false;

  function startDrag(event: PointerEvent, id: string): void {
    if (event.button !== 0) return;
    drag = { id, startY: event.clientY, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent): void {
    if (!drag) return;
    if (!drag.moved && Math.abs(event.clientY - drag.startY) < 6) return;
    drag.moved = true;
    dragging = drag.id;
    const items = [...nav.querySelectorAll<HTMLElement>("[data-plugin]")];
    const target = items.findIndex((el) => {
      const rect = el.getBoundingClientRect();
      return event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    const ids = plugins.map((p) => p.id);
    const from = ids.indexOf(drag.id);
    if (target < 0 || target === from) return;
    ids.splice(target, 0, ...ids.splice(from, 1));
    settings.setPluginOrder(ids, false);
  }

  function endDrag(): void {
    if (drag?.moved) {
      justDragged = true;
      settings.setPluginOrder([...settings.pluginOrder]);
    }
    drag = null;
    dragging = null;
  }

  const view = $derived(tabs.active?.view);
  const activePluginId = $derived(view?.kind === "plugin" || view?.kind === "app" ? view.pluginId : undefined);

  /** Un plugin qui n'a qu'une mini-app l'ouvre directement. */
  function pluginView(plugin: PluginManifest): View {
    const only = plugin.miniApps.length === 1 ? plugin.miniApps[0] : undefined;
    return only ? { kind: "app", pluginId: plugin.id, appId: only.id } : { kind: "plugin", pluginId: plugin.id };
  }

  function go(target: View, event: MouseEvent): void {
    tabs.navigate(target, { newTab: event.ctrlKey || event.button === 1 });
  }

  const preventAutoscroll = (e: MouseEvent) => e.button === 1 && e.preventDefault();

  let resizing = $state(false);

  function startResize(event: PointerEvent): void {
    if (settings.sidebarCollapsed) return;
    const handle = event.currentTarget as HTMLElement;
    const startX = event.clientX;
    const startWidth = settings.sidebarWidth;
    handle.setPointerCapture(event.pointerId);
    resizing = true;

    const move = (e: PointerEvent) => settings.setSidebarWidth(startWidth + e.clientX - startX, false);
    const stop = () => {
      resizing = false;
      settings.setSidebarWidth(settings.sidebarWidth);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  // Une fois le repli terminé (0,2 s), les textes déjà invisibles sont retirés de la mise en page ;
  // au dépliage, ils reviennent tout de suite pour s'afficher en fondu.
  const FOLD_DURATION = 200;
  let folded = $state(settings.sidebarCollapsed);
  $effect(() => {
    if (!settings.sidebarCollapsed) {
      folded = false;
      return;
    }
    const timer = setTimeout(() => (folded = true), FOLD_DURATION);
    return () => clearTimeout(timer);
  });
</script>

<aside
  class="side"
  class:collapsed={settings.sidebarCollapsed}
  class:folded
  class:resizing
  style:width={settings.sidebarCollapsed ? "64px" : `${settings.sidebarWidth}px`}
>
  <div class="brand-row">
    <button class="brand" onclick={(e) => go({ kind: "home" }, e)} title="Accueil">
      <Logo size={32} />
      <span class="label">Établi</span>
    </button>
    <!-- Zone vide de la barre de titre : elle déplace la fenêtre. -->
    <div class="drag" data-tauri-drag-region></div>
  </div>

  <nav class="nav" aria-label="Plugins" bind:this={nav}>
    <button
      class="item"
      class:active={view?.kind === "home"}
      onclick={(e) => go({ kind: "home" }, e)}
      onauxclick={(e) => e.button === 1 && go({ kind: "home" }, e)}
      onmousedown={preventAutoscroll}
      title="Accueil"
    >
      <Tile color="var(--muted)" icon="home" emoji="🏠" variant="plain" />
      <span class="label">Accueil</span>
    </button>

    <div class="section-label label">Plugins</div>

    {#each plugins as plugin (plugin.id)}
      <button
        class="item"
        class:active={activePluginId === plugin.id}
        class:dragging={dragging === plugin.id}
        data-plugin={plugin.id}
        onclick={(e) => {
          // Un glisser-déposer se termine par un clic : il ne doit pas ouvrir le plugin.
          if (justDragged) justDragged = false;
          else go(pluginView(plugin), e);
        }}
        onauxclick={(e) => e.button === 1 && go(pluginView(plugin), e)}
        onmousedown={preventAutoscroll}
        onpointerdown={(e) => startDrag(e, plugin.id)}
        onpointermove={moveDrag}
        onpointerup={endDrag}
        onpointercancel={endDrag}
        title={`${plugin.name} (glisser pour déplacer)`}
      >
        <Tile color={plugin.color} icon={plugin.icon} emoji={plugin.emoji} />
        <span class="label">{plugin.name}</span>
      </button>
    {/each}
  </nav>

  <!-- Dépliée : les deux boutons côte à côte. Repliée : « Replier » glisse au-dessus de
       « Paramètres », en même temps que la colonne se réduit (aucun saut). -->
  <div class="strip">
    <button
      class="strip-btn settings"
      class:on={view?.kind === "settings"}
      onclick={(e) => go({ kind: "settings" }, e)}
      title="Paramètres"
      aria-label="Paramètres"
    >
      <Icon name="settings" />
    </button>
    <button
      class="strip-btn fold"
      onclick={() => settings.toggleSidebar()}
      title={settings.sidebarCollapsed ? "Déplier la colonne (Ctrl+B)" : "Replier la colonne (Ctrl+B)"}
      aria-label={settings.sidebarCollapsed ? "Déplier la colonne" : "Replier la colonne"}
    >
      <Icon name="panel" />
    </button>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="resizer" onpointerdown={startResize}></div>
</aside>

<style>
  .side {
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--surface-2);
    border-right: 1px solid var(--border);
    transition: width 0.2s ease-out;
  }
  .side.resizing {
    transition: none;
  }

  /* Mêmes marges repliée ou dépliée : logo et tuiles ne bougent pas pendant l'animation,
     seule la largeur change et les textes s'estompent. Repliée (64 px), tout tombe au centre. */
  /* Aligné sur les onglets : même hauteur (36 px) posée en bas de la barre de titre. */
  .brand-row {
    height: var(--titlebar);
    display: flex;
    align-items: flex-end;
    padding: 0 12px;
    flex: none;
    overflow: hidden;
  }
  .drag {
    flex: 1;
    align-self: stretch;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 4px;
    border: 0;
    border-radius: 10px;
    background: none;
    font-weight: 700;
    font-size: 19px;
    letter-spacing: -0.2px;
    white-space: nowrap;
  }
  .brand:hover {
    background: var(--field);
  }

  .nav {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    transition: opacity 0.12s ease-out;
  }
  .section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--faint);
    padding: 12px 8px 6px;
  }
  .item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
    padding: 4px;
    flex: none;
    border: 0;
    border-radius: 12px;
    background: none;
    text-align: left;
    white-space: nowrap;
    transition: background 0.12s;
  }
  .item:hover {
    background: var(--field);
  }
  .item.active {
    background: var(--surface);
    box-shadow: 0 0 0 1px var(--border);
  }
  .item.active::before {
    content: "";
    position: absolute;
    left: -8px;
    top: 13px;
    bottom: 13px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--accent);
  }
  .item .label {
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }
  .item.active .label {
    font-weight: 600;
  }
  .item.dragging {
    background: var(--surface);
    box-shadow: var(--shadow);
    cursor: grabbing;
    z-index: 2;
  }

  /* Deux boutons de 40 px placés à la main, pour animer leur déplacement avec la même durée et
     la même courbe que la largeur de la colonne. Paramètres ne bouge jamais (en bas à gauche). */
  .strip {
    position: relative;
    height: 57px; /* 1 px de trait + 8 + 40 + 8 */
    border-top: 1px solid var(--border);
    flex: none;
    transition: height 0.2s ease-out;
  }
  .collapsed .strip {
    height: 101px; /* un bouton de plus au-dessus : 44 px */
  }
  .strip-btn {
    position: absolute;
    left: 12px;
    bottom: 8px;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--muted);
    display: grid;
    place-items: center;
    transition:
      transform 0.2s ease-out,
      background 0.12s,
      color 0.12s;
  }
  .strip-btn.fold {
    transform: translateX(44px);
  }
  .collapsed .strip-btn.fold {
    transform: translateY(-44px);
  }
  .resizing .strip,
  .resizing .strip-btn {
    transition: none;
  }
  .strip-btn:hover {
    background: var(--field);
    color: var(--text);
  }
  /* Page Paramètres ouverte : même repère que les plugins de la colonne (fond, bordure, barre d'accent). */
  .strip-btn.on {
    background: var(--surface);
    box-shadow: 0 0 0 1px var(--border);
    color: var(--text);
  }
  .strip-btn.on::before {
    content: "";
    position: absolute;
    left: -12px;
    top: 10px;
    bottom: 10px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--accent);
  }

  /* Repliée : les textes s'estompent (en gardant leur place : rien ne remonte), puis
     disparaissent une fois l'animation finie pour que les boutons restent bien carrés. */
  .collapsed .label {
    opacity: 0;
  }
  .collapsed.folded .item .label,
  .collapsed.folded .brand .label {
    display: none;
  }

  .resizer {
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 5;
  }
  .collapsed .resizer {
    display: none;
  }
</style>
