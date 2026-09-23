<script lang="ts">
  // Barre d'onglets globale, intégrée à la barre de titre (cahier des charges, section 5.3).
  import { tabs } from "$lib/state/tabs.svelte";
  import { describeView } from "$lib/views";
  import Icon from "./Icon.svelte";
  import Tile from "./Tile.svelte";
  import WindowControls from "./WindowControls.svelte";

  let strip: HTMLElement;
  let drag: { id: number; startX: number; moved: boolean } | null = null;

  function onpointerdown(event: PointerEvent, id: number): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".close")) return;
    // Comme un navigateur : l'onglet s'active dès l'appui.
    tabs.activate(id);
    drag = { id, startX: event.clientX, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onpointermove(event: PointerEvent): void {
    if (!drag) return;
    if (!drag.moved && Math.abs(event.clientX - drag.startX) < 6) return;
    drag.moved = true;
    const elements = [...strip.querySelectorAll<HTMLElement>(".tab")];
    const target = elements.findIndex((el) => {
      const rect = el.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right;
    });
    if (target >= 0) tabs.move(drag.id, target);
  }

  function endDrag(): void {
    drag = null;
  }
</script>

<header class="bar" data-tauri-drag-region>
  <div class="tabs" role="tablist" bind:this={strip}>
    {#each tabs.list as tab (tab.id)}
      {@const info = describeView(tab.view)}
      {@const active = tab.id === tabs.activeId}
      <div
        class="tab"
        class:active
        role="tab"
        tabindex={active ? 0 : -1}
        aria-selected={active}
        title={info.title}
        onpointerdown={(e) => onpointerdown(e, tab.id)}
        {onpointermove}
        onpointerup={endDrag}
        onpointercancel={endDrag}
        onmousedown={(e) => e.button === 1 && e.preventDefault()}
        onauxclick={(e) => e.button === 1 && tabs.close(tab.id)}
        onkeydown={(e) => (e.key === "Enter" || e.key === " ") && tabs.activate(tab.id)}
      >
        <Tile color={info.color} icon={info.icon} emoji={info.emoji} size={20} />
        <span class="title">{info.title}</span>
        <button class="close" onclick={() => tabs.close(tab.id)} aria-label="Fermer l'onglet {info.title}">
          <Icon name="x" size={14} />
        </button>
      </div>
    {/each}
  </div>
  <button class="new" onclick={() => tabs.open({ kind: "home" })} title="Nouvel onglet (Ctrl+T)" aria-label="Nouvel onglet">
    <Icon name="plus" size={18} strokeWidth={2.4} />
  </button>
  <div class="drag" data-tauri-drag-region></div>
  <WindowControls />
</header>

<style>
  .bar {
    height: var(--titlebar);
    display: flex;
    align-items: flex-end;
    padding-left: 8px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    flex: none;
  }
  .tabs {
    display: flex;
    gap: 2px;
    overflow-x: auto;
    flex: 0 1 auto;
    min-width: 0;
    scrollbar-width: none;
  }
  .tab {
    height: 36px;
    min-width: 110px;
    max-width: 200px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 0 10px;
    border: 1px solid transparent;
    border-bottom: 0;
    border-radius: 10px 10px 0 0;
    color: var(--muted);
    flex: none;
    cursor: default;
    animation: tab-in 0.15s ease-out;
  }
  .tab:hover {
    background: var(--field);
  }
  .tab.active {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text);
    height: 37px;
    margin-bottom: -1px;
  }
  .title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .close {
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 6px;
    background: none;
    display: grid;
    place-items: center;
    opacity: 0;
    flex: none;
  }
  .tab:hover .close,
  .tab.active .close {
    opacity: 1;
  }
  .close:hover {
    background: var(--field);
  }
  .new {
    width: 30px;
    height: 30px;
    margin: 0 0 5px 8px;
    border: 0;
    border-radius: 9px;
    background: var(--accent);
    color: var(--accent-text);
    display: grid;
    place-items: center;
    flex: none;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 35%, transparent);
    transition:
      transform 0.12s,
      filter 0.12s;
  }
  .new:hover {
    transform: translateY(-1px);
    filter: brightness(1.08);
  }
  .drag {
    flex: 1;
    align-self: stretch;
    min-width: 40px;
  }
  @keyframes tab-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
