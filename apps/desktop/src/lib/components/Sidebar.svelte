<script lang="ts">
  // Colonne des plugins (cahier des charges, section 5.2).
  import { inTauri, system } from "$lib/api";
  import { PLUGINS } from "$lib/plugins/registry";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { PluginManifest, View } from "$lib/types";
  import Icon from "./Icon.svelte";
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

  function quickOverview(): void {
    if (inTauri) void system.toggleQuick();
    else ui.notify("L'aperçu rapide s'ouvre dans l'application, pas dans l'aperçu navigateur.");
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
</script>

<aside
  class="side"
  class:collapsed={settings.sidebarCollapsed}
  class:resizing
  style:width={settings.sidebarCollapsed ? "64px" : `${settings.sidebarWidth}px`}
>
  <div class="brand-row" data-tauri-drag-region>
    <button class="brand" onclick={(e) => go({ kind: "home" }, e)} title="Accueil">
      <span class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M4 18h16M6 18V9l6-4 6 4v9" />
        </svg>
      </span>
      <span class="label">Établi</span>
    </button>
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
      <span class="home-tile"><Icon name="home" /></span>
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

  <div class="strip">
    <button
      class="strip-btn"
      class:on={view?.kind === "settings"}
      onclick={(e) => go({ kind: "settings" }, e)}
      title="Paramètres"
      aria-label="Paramètres"
    >
      <Icon name="settings" />
    </button>
    <button
      class="strip-btn"
      onclick={() => settings.toggleSidebar()}
      title={settings.sidebarCollapsed ? "Déplier la colonne (Ctrl+B)" : "Replier la colonne (Ctrl+B)"}
      aria-label={settings.sidebarCollapsed ? "Déplier la colonne" : "Replier la colonne"}
    >
      <Icon name="panel" />
    </button>
    <button
      class="strip-btn"
      onclick={quickOverview}
      title={`Aperçu rapide (${settings.quickShortcut.label})`}
      aria-label="Aperçu rapide"
    >
      <Icon name="zap" />
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

  .brand-row {
    height: var(--titlebar);
    display: flex;
    align-items: center;
    padding: 0 8px;
    flex: none;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 6px;
    border: 0;
    border-radius: 10px;
    background: none;
    font-weight: 700;
    font-size: 15px;
    white-space: nowrap;
  }
  .brand:hover {
    background: var(--field);
  }
  .logo {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--accent);
    color: var(--accent-text);
    display: grid;
    place-items: center;
    flex: none;
  }
  .logo svg {
    width: 16px;
    height: 16px;
  }

  .nav {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 6px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
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
    gap: 11px;
    height: 50px;
    padding: 5px;
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
    left: -10px;
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
  .home-tile {
    width: 40px;
    height: 40px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    flex: none;
    background: var(--field);
    color: var(--muted);
  }

  .strip {
    border-top: 1px solid var(--border);
    padding: 8px 10px;
    display: flex;
    gap: 4px;
    flex: none;
  }
  .strip-btn {
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--muted);
    display: grid;
    place-items: center;
    transition:
      background 0.12s,
      color 0.12s;
  }
  .strip-btn:hover {
    background: var(--field);
    color: var(--text);
  }
  .strip-btn.on {
    color: var(--accent);
  }

  .collapsed .label {
    display: none;
  }
  .collapsed .strip {
    flex-direction: column;
    align-items: center;
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
