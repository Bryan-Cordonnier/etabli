<script lang="ts">
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import TabBar from "$lib/components/TabBar.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import Home from "$lib/pages/Home.svelte";
  import MiniAppPage from "$lib/pages/MiniAppPage.svelte";
  import PluginPage from "$lib/pages/PluginPage.svelte";
  import SettingsPage from "$lib/pages/SettingsPage.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import { applyTheme } from "$lib/themes";

  $effect(() => applyTheme(settings.theme));
  $effect(() => tabs.persist());

  const view = $derived(tabs.active?.view);
  // Change à chaque changement de page, pour rejouer le fondu d'apparition.
  const viewKey = $derived(`${tabs.activeId}:${JSON.stringify(view)}`);

  /** Raccourcis clavier de la section 5.3 du cahier des charges. */
  function onkeydown(event: KeyboardEvent): void {
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (ctrl && key === "k") {
      event.preventDefault();
      ui.paletteOpen = !ui.paletteOpen;
      return;
    }
    if (ui.paletteOpen) return;

    if (ctrl && event.shiftKey && key === "t") tabs.reopenClosed();
    else if (ctrl && key === "t") tabs.open({ kind: "home" });
    else if (ctrl && key === "w") tabs.close(tabs.activeId);
    else if (ctrl && event.key === "Tab") tabs.cycle(event.shiftKey ? -1 : 1);
    else if (ctrl && /^[1-9]$/.test(event.key)) tabs.goTo(Number(event.key));
    else if (ctrl && key === "b") settings.toggleSidebar();
    else if (event.altKey && event.key === "ArrowLeft") tabs.back();
    else return;
    event.preventDefault();
  }

  /** Bouton « précédent » de la souris. */
  function onmouseup(event: MouseEvent): void {
    if (event.button === 3) {
      event.preventDefault();
      tabs.back();
    }
  }
</script>

<svelte:window {onkeydown} {onmouseup} />

<div class="shell">
  <Sidebar />
  <section class="main">
    <TabBar />
    <main class="content">
      {#key viewKey}
        <div class="view">
          {#if view?.kind === "home"}
            <Home />
          {:else if view?.kind === "plugin"}
            <PluginPage pluginId={view.pluginId} />
          {:else if view?.kind === "app"}
            <MiniAppPage pluginId={view.pluginId} appId={view.appId} />
          {:else if view?.kind === "settings"}
            <SettingsPage section={view.section} />
          {/if}
        </div>
      {/key}
    </main>
  </section>
</div>

{#if ui.paletteOpen}
  <CommandPalette />
{/if}
<Toast />

<style>
  .shell {
    display: flex;
    height: 100%;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .content {
    flex: 1;
    overflow: auto;
    background: var(--surface);
  }
  .view {
    animation: fade-in 0.18s ease-out;
  }
</style>
