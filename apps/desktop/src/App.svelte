<script lang="ts">
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import MobileBar from "$lib/components/MobileBar.svelte";
  import PluginDialog from "$lib/components/PluginDialog.svelte";
  import SynchroBanner from "$lib/components/SynchroBanner.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import TabBar from "$lib/components/TabBar.svelte";
  import ServiceHost from "$lib/components/ServiceHost.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import UpdateBanner from "$lib/components/UpdateBanner.svelte";
  import Home from "$lib/pages/Home.svelte";
  import PagePage from "$lib/pages/PagePage.svelte";
  import PluginsPage from "$lib/pages/PluginsPage.svelte";
  import SettingsPage from "$lib/pages/SettingsPage.svelte";
  import { api, system } from "$lib/api";
  import { preparerPluginsHorsLigne } from "$lib/serveur/horsLigne";
  import { applyAppearance } from "$lib/appearance";
  import { openPluginSettings } from "$lib/pluginSettings";
  import { sendToApp } from "$lib/send";
  import { handleShortcut } from "$lib/shortcuts";
  import { loadPlugins } from "$lib/plugins/registry.svelte";
  import { settings } from "$lib/state/settings.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import { suivreEcran, ui } from "$lib/state/ui.svelte";
  import { updates } from "$lib/state/updates.svelte";
  import type { View } from "$lib/types";

  $effect(() => applyAppearance());
  // Mode serveur avec origine dédiée aux plugins : garde les mini-apps pour le hors ligne.
  $effect(() => preparerPluginsHorsLigne(api));
  $effect(() => suivreEcran());
  $effect(() => tabs.persist());

  // Nouvelle version sur GitHub : cherchée une fois, quelques secondes après le démarrage (le
  // premier affichage reste rapide). Sans réseau, rien ne s'affiche.
  $effect(() => {
    if (!settings.checkUpdates) return;
    const timer = setTimeout(() => void updates.check(true), 5000);
    return () => clearTimeout(timer);
  });

  // Plugins installés ou désinstallés depuis l'autre fenêtre.
  $effect(() => {
    const changed = api.onPluginsChanged(() => void loadPlugins());
    return () => void changed.then((stop) => stop());
  });

  // « Ouvrir dans l'application » depuis l'aperçu rapide : la page arrive dans un nouvel onglet.
  $effect(() => {
    const unlisten = system.onOpenRequest((view) => tabs.navigate(view, { newTab: true }));
    return () => void unlisten.then((stop) => stop());
  });

  // Ouvrir les réglages d'un plugin et envoyer des données à une mini-app, depuis l'aperçu rapide.
  $effect(() => {
    const reglages = system.onSettingsRequest(({ plugin, hash }) => openPluginSettings(plugin, hash));
    const send = system.onSendRequest(({ kind, data, from }) => sendToApp(kind, data, from));
    return () => {
      void reglages.then((stop) => stop());
      void send.then((stop) => stop());
    };
  });

  const view = $derived(tabs.active?.view);

  /** Change à chaque changement de page : l'écran est recréé et le fondu rejoué. */
  function keyOf(v: View | undefined): string {
    return JSON.stringify(v);
  }
  const viewKey = $derived(`${tabs.activeId}:${keyOf(view)}`);

  function onkeydown(event: KeyboardEvent): void {
    const handled = handleShortcut({
      code: event.code,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
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
  {#if ui.compact && ui.menuOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="voile" onclick={() => (ui.menuOpen = false)}></div>
  {/if}
  <section class="main">
    {#if ui.compact}<MobileBar />{:else}<TabBar />{/if}
    <UpdateBanner />
    <SynchroBanner />
    <main class="content">
      {#key viewKey}
        <div class="view">
          {#if view?.kind === "home"}
            <Home />
          {:else if view?.kind === "page"}
            <PagePage tabId={tabs.activeId} pluginId={view.pluginId} pageId={view.pageId} />
          {:else if view?.kind === "settings"}
            <SettingsPage section={view.section} hash={view.hash} />
          {:else if view?.kind === "plugins"}
            <PluginsPage />
          {/if}
        </div>
      {/key}
    </main>
  </section>
</div>

{#if ui.paletteOpen}
  <CommandPalette />
{/if}
<PluginDialog />
<Toast />
<ServiceHost />

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
    height: 100%;
    animation: fade-in 0.18s ease-out;
  }
  .voile {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgb(0 0 0 / 0.45);
    animation: fade-in 0.18s ease-out;
  }
</style>
