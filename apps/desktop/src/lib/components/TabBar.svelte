<script lang="ts">
  // Barre d'onglets globale, intégrée à la barre de titre (cahier des charges, section 5.3).
  // L'onglet actif se prolonge dans la page, comme dans un navigateur.
  import { tabs } from "$lib/state/tabs.svelte";
  import { describeView } from "$lib/views";
  import Icon from "./Icon.svelte";
  import Tile from "./Tile.svelte";
  import WindowControls from "./WindowControls.svelte";

  let strip: HTMLElement;
  let drag: { id: number; startX: number; moved: boolean } | null = null;

  // Onglets qui dépassent : ils s'estompent progressivement sur le bord concerné.
  let fadeLeft = $state(false);
  let fadeRight = $state(false);

  function updateFades(): void {
    fadeLeft = strip.scrollLeft > 1;
    fadeRight = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
  }

  $effect(() => {
    const observer = new ResizeObserver(updateFades);
    observer.observe(strip);
    return () => observer.disconnect();
  });

  // L'onglet actif reste visible quand il y en a trop pour la largeur.
  $effect(() => {
    void tabs.activeId;
    void tabs.list.length;
    strip.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    requestAnimationFrame(updateFades);
  });

  /** Molette sur les onglets : défilement horizontal, comme dans un navigateur. */
  function onwheel(event: WheelEvent): void {
    if (event.deltaY === 0 || strip.scrollWidth <= strip.clientWidth) return;
    event.preventDefault();
    strip.scrollLeft += event.deltaY;
  }

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

<header class="bar">
  <!-- Bande fine au-dessus des onglets : la fenêtre reste déplaçable même quand ils remplissent la barre. -->
  <div class="drag-top" data-tauri-drag-region></div>
  <div
    class="tabs"
    class:fade-left={fadeLeft}
    class:fade-right={fadeRight}
    role="tablist"
    bind:this={strip}
    onscroll={updateFades}
    {onwheel}
  >
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
  <button class="new" onclick={() => tabs.newTab()} title="Nouvel onglet (Ctrl+T)" aria-label="Nouvel onglet">
    <Icon name="plus" size={18} strokeWidth={2.4} />
  </button>
  <!-- Zone vide qui déplace la fenêtre : aucun bouton dedans, aucun clic perdu. -->
  <div class="drag" data-tauri-drag-region></div>
  <WindowControls />
</header>

<style>
  .bar {
    position: relative;
    height: var(--titlebar);
    display: flex;
    align-items: flex-end;
    padding-left: 8px;
    background: var(--surface-2);
    flex: none;
  }
  /* Trait sous la barre, recouvert par l'onglet actif qui se prolonge dans la page. */
  .bar::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1px;
    background: var(--border);
  }
  .drag-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 138px; /* les trois boutons de la fenêtre */
    height: 6px;
    z-index: 2;
  }
  .tabs {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: flex-end;
    gap: 2px;
    overflow-x: auto;
    overflow-y: hidden;
    flex: 0 1 auto;
    min-width: 0;
    height: 100%;
    scrollbar-width: none;
  }
  /* Onglets qui dépassent : fondu progressif vers le fond de la barre, au lieu d'une coupure nette. */
  .tabs.fade-left {
    mask-image: linear-gradient(to right, transparent, #000 36px);
  }
  .tabs.fade-right {
    mask-image: linear-gradient(to right, #000 calc(100% - 48px), transparent);
  }
  .tabs.fade-left.fade-right {
    mask-image: linear-gradient(to right, transparent, #000 36px, #000 calc(100% - 48px), transparent);
  }
  /* Tous les onglets ont la même largeur, quel que soit le titre (ergonomie : ils ne bougent pas).
     Quand il y en a trop, la barre défile plutôt que de les écraser. */
  .tab {
    position: relative;
    z-index: 0;
    height: 36px;
    flex: none;
    width: 180px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px 0 12px;
    border: 1px solid transparent;
    border-bottom: 0;
    border-radius: 10px 10px 0 0;
    color: var(--muted);
    cursor: default;
    animation: tab-in 0.15s ease-out;
  }
  /* Survol d'un onglet inactif : une pastille en retrait, qui ne touche ni le haut ni le trait du bas. */
  .tab::before {
    content: "";
    position: absolute;
    inset: 3px 2px 5px;
    z-index: -1;
    border-radius: 8px;
    transition: background 0.12s;
  }
  .tab:not(.active):hover::before {
    background: var(--field);
  }
  .tab.active {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text);
  }
  .title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .close {
    width: 22px;
    height: 22px;
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
    position: relative;
    z-index: 1;
    width: 30px;
    height: 30px;
    margin: 0 6px 4px 14px;
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
    /* Se réduit à rien quand les onglets remplissent la barre : le « + » rejoint les boutons. */
    min-width: 0;
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
