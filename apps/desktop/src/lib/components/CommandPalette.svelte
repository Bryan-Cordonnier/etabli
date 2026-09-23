<script lang="ts">
  // Palette de commandes (Ctrl+K) : ouvrir une page, un plugin ou une mini-app au clavier.
  import type { IconName } from "$lib/icons";
  import { PLUGINS, allMiniApps } from "$lib/plugins/registry";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { View } from "$lib/types";
  import { normalize } from "$lib/views";
  import Icon from "./Icon.svelte";
  import Tile from "./Tile.svelte";

  interface Entry {
    label: string;
    detail: string;
    view: View;
    color: string;
    icon: IconName;
    emoji: string;
  }

  const entries: Entry[] = [
    { label: "Accueil", detail: "Page", view: { kind: "home" }, color: "var(--accent)", icon: "home", emoji: "🏠" },
    { label: "Paramètres", detail: "Page", view: { kind: "settings" }, color: "var(--faint)", icon: "settings", emoji: "⚙️" },
    ...PLUGINS.map((p) => ({
      label: p.name,
      detail: "Plugin",
      view: { kind: "plugin", pluginId: p.id } as const,
      color: p.color,
      icon: p.icon,
      emoji: p.emoji,
    })),
    ...allMiniApps().map(({ plugin, app }) => ({
      label: app.name,
      detail: plugin.name,
      view: { kind: "app", pluginId: plugin.id, appId: app.id } as const,
      color: plugin.color,
      icon: app.icon,
      emoji: app.emoji,
    })),
  ];

  const enabled = (entry: Entry) =>
    entry.view.kind === "plugin" || entry.view.kind === "app" ? settings.isPluginEnabled(entry.view.pluginId) : true;

  let query = $state("");
  let selected = $state(0);
  let input: HTMLInputElement;
  let list: HTMLElement;

  const results = $derived.by(() => {
    const q = normalize(query.trim());
    return entries.filter((e) => enabled(e) && (!q || normalize(`${e.label} ${e.detail}`).includes(q)));
  });

  $effect(() => input.focus());

  $effect(() => {
    list.children[selected]?.scrollIntoView({ block: "nearest" });
  });

  function close(): void {
    ui.paletteOpen = false;
  }

  function choose(entry: Entry | undefined, newTab: boolean): void {
    if (!entry) return;
    close();
    tabs.navigate(entry.view, { newTab });
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") selected = Math.min(selected + 1, results.length - 1);
    else if (event.key === "ArrowUp") selected = Math.max(selected - 1, 0);
    else if (event.key === "Enter") choose(results[selected], event.ctrlKey);
    else if (event.key === "Escape") close();
    else return;
    event.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" onpointerdown={(e) => e.target === e.currentTarget && close()}>
  <div class="palette" role="dialog" aria-modal="true" aria-label="Palette de commandes">
    <label class="input">
      <Icon name="search" size={18} />
      <input
        bind:this={input}
        bind:value={query}
        oninput={() => (selected = 0)}
        {onkeydown}
        placeholder="Ouvrir une mini-app, un plugin, une page…"
        autocomplete="off"
        spellcheck="false"
        aria-label="Rechercher"
      />
    </label>
    <ul class="results" role="listbox" bind:this={list}>
      {#each results as entry, i (entry.label + entry.detail)}
        <li role="option" aria-selected={i === selected}>
          <button class:sel={i === selected} onclick={(e) => choose(entry, e.ctrlKey)} onpointermove={() => (selected = i)}>
            <Tile color={entry.color} icon={entry.icon} emoji={entry.emoji} size={28} variant="soft" />
            <span class="label">{entry.label}</span>
            <span class="detail">{entry.detail}</span>
          </button>
        </li>
      {:else}
        <li class="none">Aucun résultat pour « {query} »</li>
      {/each}
    </ul>
    <footer>
      <span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span>
      <span><kbd>Entrée</kbd> ouvrir</span>
      <span><kbd>Ctrl</kbd>+<kbd>Entrée</kbd> nouvel onglet</span>
      <span><kbd>Échap</kbd> fermer</span>
    </footer>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
    background: var(--scrim);
    backdrop-filter: blur(6px);
    animation: fade-in 0.12s ease-out;
  }
  .palette {
    width: min(640px, calc(100% - 32px));
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow);
    overflow: hidden;
    animation: zoom 0.14s ease-out;
  }
  .input {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 56px;
    padding: 0 18px;
    border-bottom: 1px solid var(--border);
    color: var(--faint);
    flex: none;
  }
  .input input {
    flex: 1;
    border: 0;
    outline: none;
    background: none;
    font: 500 16px var(--font);
    color: var(--text);
    min-width: 0;
  }
  .results {
    list-style: none;
    margin: 0;
    padding: 6px;
    overflow-y: auto;
  }
  .results button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    text-align: left;
  }
  .results button.sel {
    background: var(--accent-soft);
  }
  .label {
    font-weight: 500;
  }
  .detail {
    margin-left: auto;
    color: var(--faint);
    font-size: 12px;
  }
  .none {
    padding: 16px 10px;
    color: var(--faint);
  }
  footer {
    display: flex;
    gap: 16px;
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
    margin-right: 2px;
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
