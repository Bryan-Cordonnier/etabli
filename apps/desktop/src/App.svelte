<script lang="ts">
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import MobileAccueil from "$lib/components/MobileAccueil.svelte";
  import MobileBar from "$lib/components/MobileBar.svelte";
  import PluginDialog from "$lib/components/PluginDialog.svelte";
  import SynchroBanner from "$lib/components/SynchroBanner.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import TabBar from "$lib/components/TabBar.svelte";
  import TitleBar from "$lib/components/TitleBar.svelte";
  import { distribution } from "$lib/distribution";
  import ServiceHost from "$lib/components/ServiceHost.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import UpdateBanner from "$lib/components/UpdateBanner.svelte";
  import Home from "$lib/pages/Home.svelte";
  import PagePage from "$lib/pages/PagePage.svelte";
  import PluginsPage from "$lib/pages/PluginsPage.svelte";
  import SettingsPage from "$lib/pages/SettingsPage.svelte";
  import { api, clientServeur, system } from "$lib/api";
  import { ecouter } from "$lib/serveur/evenements";
  import { pluginData } from "$lib/state/pluginData.svelte";
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
  import { retourMobile } from "$lib/state/retour";
  import type { View } from "$lib/types";

  // Changements faits sur un autre appareil du même compte : la donnée est relue, la page ouverte se met à jour toute seule.
  $effect(() => {
    if (!clientServeur) return;
    const relireTout = () => Object.keys(pluginData.data).forEach((id) => void pluginData.load(id));
    return ecouter(clientServeur, {
      surOuverture: relireTout,
      surChangement: (c) => {
        if (c.type === "donnees" && c.nom.startsWith("plugin.")) void pluginData.load(c.nom.slice("plugin.".length));
      },
    });
  });

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
  /** Téléphone : l'accueil est la liste des pages ; une page s'ouvre en plein écran et le geste « retour » d'Android y revient. */
  const accueilMobile = $derived(ui.compact && view?.kind === "home");
  let entreeHistorique = false;
  $effect(() => {
    if (!ui.compact) return;
    if (view && view.kind !== "home" && !entreeHistorique) {
      history.pushState({ page: true }, "");
      entreeHistorique = true;
    } else if (view?.kind === "home") entreeHistorique = false;
  });
  $effect(() => {
    if (!ui.compact) return;
    const retour = () => {
      entreeHistorique = false;
      retourMobile();
    };
    window.addEventListener("popstate", retour);
    return () => window.removeEventListener("popstate", retour);
  });

  const viewKey =$derived(`${tabs.activeId}:${keyOf(view)}`);

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
  {#if !ui.compact}<Sidebar />{/if}
  <section class="main">
    {#if ui.compact}{#if !accueilMobile}<MobileBar />{/if}{:else if distribution.tabs}<TabBar />{:else}<TitleBar />{/if}
    <UpdateBanner />
    <SynchroBanner />
    <main class="content">
      {#key viewKey}
        <div class="view">
          {#if accueilMobile}
            <MobileAccueil />
          {:else if view?.kind === "home"}
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
