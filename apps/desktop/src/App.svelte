<script lang="ts">
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import TabBar from "$lib/components/TabBar.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import Home from "$lib/pages/Home.svelte";
  import MiniAppPage from "$lib/pages/MiniAppPage.svelte";
  import PluginPage from "$lib/pages/PluginPage.svelte";
  import SettingsPage from "$lib/pages/SettingsPage.svelte";
  import { system } from "$lib/api";
  import { applyAppearance } from "$lib/appearance";
  import { handleShortcut } from "$lib/shortcuts";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { View } from "$lib/types";

  $effect(() => applyAppearance());
  $effect(() => tabs.persist());

  // « Ouvrir dans l'Établi » depuis l'aperçu rapide : le calcul arrive dans un nouvel onglet.
  $effect(() => {
    const unlisten = system.onOpenRequest((view) => tabs.navigate(view, { newTab: true }));
    return () => void unlisten.then((stop) => stop());
  });

  const view = $derived(tabs.active?.view);

  /** Change à chaque changement de page : l'écran est recréé et le fondu rejoué. Pour une mini-app,
   *  seul le `nonce` compte : l'identifiant reçu au premier enregistrement ne recrée rien. */
  function keyOf(v: View | undefined): string {
    if (v?.kind === "app") return `app:${v.pluginId}:${v.appId}:${v.nonce}`;
    return JSON.stringify(v);
  }
  const viewKey = $derived(`${tabs.activeId}:${keyOf(view)}`);

  function onkeydown(event: KeyboardEvent): void {
    const handled = handleShortcut({
      key: event.key,
      ctrl: event.ctrlKey || event.metaKey,
      shift: event.shiftKey,
      alt: event.altKey,
    });
    if (handled) event.preventDefault();
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
            <MiniAppPage tabId={tabs.activeId} pluginId={view.pluginId} appId={view.appId} docId={view.docId} />
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
