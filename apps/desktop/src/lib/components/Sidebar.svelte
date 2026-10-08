<script lang="ts">
  // Colonne des pages (docs/28) : ce que les plugins déclarent dans `pages`, dans l'ordre choisi par l'utilisateur.
  import { api } from "$lib/api";
  import { categorieDe, deplacerCategorie, grouper } from "$lib/categories";
  import { distribution } from "$lib/distribution";
  import { allPages, pageKey, type PageRef } from "$lib/plugins/registry.svelte";
  import { shortcutHint } from "$lib/shortcuts";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { View } from "$lib/types";
  import Icon from "./Icon.svelte";
  import Logo from "./Logo.svelte";
  import Tile from "./Tile.svelte";

  /** Pages des plugins actifs, dans l'ordre choisi par glisser-déposer (les nouvelles à la fin, dans l'ordre du plugin). */
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
  /** Les pages rangées par catégorie (colonne en mode « catégories »). */
  const groupes = $derived(
    grouper(
      pages.map((p) => ({ ...p, category: p.ref.page.category })),
      settings.categoryOf,
      settings.categoryOrder,
    ),
  );
  /** Ordre d'affichage des pages : celui de la colonne, catégories comprises. */
  const ordreAffiche = $derived(settings.sidebarCategories ? groupes.flatMap((g) => g.items.map((p) => p.key)) : pages.map((p) => p.key));
  let nav: HTMLElement;
  let drag: { id: string; startY: number; moved: boolean } | null = null;
  let dragging = $state<string | null>(null);
  let justDragged = false;

  function startDrag(event: PointerEvent, id: string): void {
    // Au doigt, glisser fait défiler la liste : pas de réorganisation en mode compact.
    if (event.button !== 0 || ui.compact) return;
    drag = { id, startY: event.clientY, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent): void {
    if (!drag) return;
    if (!drag.moved && Math.abs(event.clientY - drag.startY) < 6) return;
    drag.moved = true;
    dragging = drag.id;
    const items = [...nav.querySelectorAll<HTMLElement>("[data-page]")];
    const target = items.findIndex((el) => {
      const rect = el.getBoundingClientRect();
      return event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    const ids = [...ordreAffiche];
    const from = ids.indexOf(drag.id);
    if (target < 0 || target === from) return;
    // Une page lâchée parmi celles d'une autre catégorie rejoint cette catégorie.
    if (settings.sidebarCategories) {
      const cible = pages.find((p) => p.key === ids[target]);
      const moi = pages.find((p) => p.key === drag!.id);
      if (cible && moi) {
        const nom = categorieDe({ key: cible.key, category: cible.ref.page.category }, settings.categoryOf);
        settings.setCategoryOf(moi.key, nom === (moi.ref.page.category || "Autres") ? "" : nom, false);
      }
    }
    ids.splice(target, 0, ...ids.splice(from, 1));
    settings.setPageOrder(ids, false);
  }

  function endDrag(): void {
    if (drag?.moved) {
      justDragged = true;
      settings.setPageOrder([...settings.pageOrder]);
    }
    drag = null;
    dragging = null;
  }

  const view = $derived(tabs.active?.view);
  const isActive = (ref: PageRef): boolean =>
    view?.kind === "page" && view.pluginId === ref.plugin.id && view.pageId === ref.page.id;

  const pageView = (ref: PageRef): View => ({ kind: "page", pluginId: ref.plugin.id, pageId: ref.page.id });
  function go(target: View, event: MouseEvent): void {
    ui.menuOpen = false;
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
  class:drawer={ui.compact}
  class:open={ui.compact && ui.menuOpen}
  class:collapsed={settings.sidebarCollapsed && !ui.compact}
  class:folded={folded && !ui.compact}
  class:resizing
  inert={ui.compact && !ui.menuOpen}
  style:width={ui.compact ? undefined : settings.sidebarCollapsed ? "64px" : `${settings.sidebarWidth}px`}
>
  <div class="brand-row">
    <button class="brand" onclick={(e) => go({ kind: "home" }, e)} title="Accueil">
      <Logo size={32} />
      <span class="label">{distribution.name}</span>
    </button>
    <!-- Zone vide de la barre de titre : elle déplace la fenêtre. -->
    <div class="drag" data-tauri-drag-region></div>
  </div>

  <nav class="nav" aria-label="Pages" bind:this={nav}>
    <button
      class="item"
      class:active={view?.kind === "home"}
      onclick={(e) => go({ kind: "home" }, e)}
      onauxclick={(e) => e.button === 1 && go({ kind: "home" }, e)}
      onmousedown={preventAutoscroll}
      title="Accueil"
    >
      <Tile color="var(--muted)" icon="home" variant="plain" />
      <span class="label">Accueil</span>
    </button>
    {#if api.capacites.plugins && distribution.pluginsPage}
      <button
        class="item"
        class:active={view?.kind === "plugins"}
        onclick={(e) => go({ kind: "plugins" }, e)}
        onauxclick={(e) => e.button === 1 && go({ kind: "plugins" }, e)}
        onmousedown={preventAutoscroll}
        title="Plugins installés"
      >
        <Tile color="var(--muted)" icon="puzzle" variant="plain" />
        <span class="label">Plugins</span>
      </button>
    {/if}

    <div class="section-label label">Pages</div>
    {#if !pages.length}
      <p class="none label">Aucune page : installez un plugin.</p>
    {/if}

    {#snippet entree(ref: PageRef, key: string, cache: boolean)}
      <button
        hidden={cache}
        class="item"
        class:active={isActive(ref)}
        class:dragging={dragging === key}
        data-page={key}
        onclick={(e) => {
          // Un glisser-déposer se termine par un clic : il ne doit pas ouvrir la page.
          if (justDragged) justDragged = false;
          else go(pageView(ref), e);
        }}
        onauxclick={(e) => e.button === 1 && go(pageView(ref), e)}
        onmousedown={preventAutoscroll}
        onpointerdown={(e) => startDrag(e, key)}
        onpointermove={moveDrag}
        onpointerup={endDrag}
        onpointercancel={endDrag}
        title={`${ref.page.title} (glisser pour déplacer)`}
      >
        <Tile color={ref.plugin.color} icon={ref.page.icon} />
        <span class="label">{ref.page.title}</span>
      </button>
    {/snippet}

    {#if settings.sidebarCategories}
      {#each groupes as g, gi (g.name)}
        {@const replie = settings.foldedCategories.includes(g.name)}
        <div class="categorie">
          <button class="cat-nom" onclick={() => settings.toggleCategoryFolded(g.name)} aria-expanded={!replie} title={replie ? "Déplier" : "Replier"}>
            <span class="chevron" class:replie>▾</span>
            <span class="label">{g.name}</span>
          </button>
          <span class="cat-outils label">
            <button class="cat-fleche" disabled={gi === 0} aria-label={`Monter ${g.name}`} title="Monter la catégorie" onclick={() => settings.setCategoryOrder(deplacerCategorie(groupes.map((x) => x.name), g.name, -1))}>↑</button>
            <button class="cat-fleche" disabled={gi === groupes.length - 1} aria-label={`Descendre ${g.name}`} title="Descendre la catégorie" onclick={() => settings.setCategoryOrder(deplacerCategorie(groupes.map((x) => x.name), g.name, 1))}>↓</button>
          </span>
        </div>
        {#each g.items as { ref, key } (key)}
          {@render entree(ref, key, replie)}
        {/each}
      {/each}
    {:else}
      {#each pages as { ref, key } (key)}
        {@render entree(ref, key, false)}
      {/each}
    {/if}
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
      title={shortcutHint(settings.sidebarCollapsed ? "Déplier la colonne" : "Replier la colonne", "toggleSidebar")}
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

  /* Écran étroit : la colonne devient un tiroir qui glisse depuis la gauche, par-dessus la page. */
  .side.drawer {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(86vw, 320px);
    z-index: 40;
    transform: translateX(-100%);
    transition: transform 0.2s ease-out;
    box-shadow: none;
    padding-top: env(safe-area-inset-top, 0px);
  }
  .side.drawer.open {
    transform: none;
    box-shadow: var(--shadow);
  }
  .side.drawer .resizer,
  .side.drawer .strip-btn.fold {
    display: none;
  }
  .side.drawer .item {
    min-height: 44px;
  }

  /* Mêmes marges repliée ou dépliée : logo et tuiles ne bougent pas pendant l'animation,
     seule la largeur change et les textes s'estompent. Repliée (64 px), tout tombe au centre. */
  /* Un peu plus haute que la barre de titre : le logo et le nom respirent sous le bord de la fenêtre. */
  .brand-row {
    height: calc(var(--titlebar) + 12px);
    display: flex;
    align-items: center;
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
    border-radius: var(--r-md);
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
    gap: 6px;
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
  .none {
    margin: 0;
    padding: 0 8px;
    font-size: 12.5px;
    color: var(--faint);
    white-space: nowrap;
  }
  .collapsed.folded .none {
    display: none;
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
    border-radius: var(--r-md);
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
  .item[hidden] {
    display: none;
  }
  .categorie {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 4px 2px 8px;
  }
  .cat-nom {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: none;
    padding: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--faint);
    white-space: nowrap;
  }
  .chevron {
    display: inline-block;
    transition: transform 0.12s;
  }
  .chevron.replie {
    transform: rotate(-90deg);
  }
  .cat-outils {
    display: none;
    gap: 2px;
  }
  .categorie:hover .cat-outils,
  .categorie:focus-within .cat-outils {
    display: flex;
  }
  .collapsed .categorie {
    display: none;
  }
  .cat-fleche {
    border: 0;
    background: none;
    color: var(--muted);
    width: 22px;
    height: 22px;
    border-radius: var(--r-xs);
  }
  .cat-fleche:hover:not(:disabled) {
    background: var(--field);
  }
  .cat-fleche:disabled {
    opacity: 0.3;
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
    border-radius: var(--r-md);
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
