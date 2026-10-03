<script lang="ts">
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import MobileBar from "$lib/components/MobileBar.svelte";
  import PluginDialog from "$lib/components/PluginDialog.svelte";
  import SynchroBanner from "$lib/components/SynchroBanner.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import TabBar from "$lib/components/TabBar.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import UpdateBanner from "$lib/components/UpdateBanner.svelte";
  import CataloguePage from "$lib/pages/CataloguePage.svelte";
  import Home from "$lib/pages/Home.svelte";
  import MiniAppPage from "$lib/pages/MiniAppPage.svelte";
  import PluginPage from "$lib/pages/PluginPage.svelte";
  import SettingsPage from "$lib/pages/SettingsPage.svelte";
  import { api, system } from "$lib/api";
  import { preparerPluginsHorsLigne } from "$lib/serveur/horsLigne";
  import { applyAppearance } from "$lib/appearance";
  import { openPluginSettings } from "$lib/pluginSettings";
  import { sendToApp } from "$lib/send";
  import { handleShortcut } from "$lib/shortcuts";
  import { loadPlugins } from "$lib/plugins/registry.svelte";
  import { catalogue } from "$lib/state/catalogue.svelte";
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

  // Catalogue : réinstallation des plugins de qui arrive d'une 0.1.x, puis mises à jour
  // automatiques des plugins, une fois au démarrage.
  $effect(() => {
    const timer = setTimeout(() => void catalogue.startup(), 2000);
    return () => clearTimeout(timer);
  });

  // Plugins installés ou désinstallés depuis l'autre fenêtre, et progression des téléchargements.
  $effect(() => {
    const changed = api.onPluginsChanged(() => void loadPlugins());
    const progress = api.onInstallProgress(({ id, pourcent }) => {
      if (catalogue.progress[id] !== undefined) catalogue.progress[id] = pourcent;
    });
    return () => {
      void changed.then((stop) => stop());
      void progress.then((stop) => stop());
    };
  });

  // « Ouvrir dans l'Établi » depuis l'aperçu rapide : le calcul arrive dans un nouvel onglet.
  $effect(() => {
    const unlisten = system.onOpenRequest((view) => tabs.navigate(view, { newTab: true }));
    return () => void unlisten.then((stop) => stop());
  });

  // « + Ajouter une machine… » et « Envoyer au calepinage » depuis une mini-app de l'aperçu rapide.
  $effect(() => {
    const reglages = system.onSettingsRequest(({ plugin, hash }) => openPluginSettings(plugin, hash));
    const send = system.onSendRequest(({ kind, data, from }) => sendToApp(kind, data, from));
    return () => {
      void reglages.then((stop) => stop());
      void send.then((stop) => stop());
    };
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
          {:else if view?.kind === "plugin"}
            <PluginPage pluginId={view.pluginId} />
          {:else if view?.kind === "app"}
            <MiniAppPage tabId={tabs.activeId} pluginId={view.pluginId} appId={view.appId} docId={view.docId} />
          {:else if view?.kind === "settings"}
            <SettingsPage section={view.section} hash={view.hash} />
          {:else if view?.kind === "catalogue"}
            <CataloguePage />
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
  .voile {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: rgb(0 0 0 / 0.45);
    animation: fade-in 0.18s ease-out;
  }
</style>
