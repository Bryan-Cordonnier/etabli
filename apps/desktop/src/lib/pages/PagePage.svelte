<script lang="ts">
  // Une page d'un plugin (docs/28) : l'app qu'elle affiche, dans son cadre isolé, sur toute la zone. Le moteur ne
  // dessine rien autour : chaque page trace son propre en-tête avec le kit d'interface.
  import type { DocumentSnapshot, PluginToHost } from "@etabli/sdk/protocol";
  import MiniAppFrame from "$lib/components/MiniAppFrame.svelte";
  import PluginProblems from "$lib/components/PluginProblems.svelte";
  import { openPluginSettings } from "$lib/pluginSettings";
  import { getPage, pluginProblems, pluginUrl } from "$lib/plugins/registry.svelte";
  import { sendToApp, takeIncoming } from "$lib/send";
  import { handleShortcut } from "$lib/shortcuts";
  import { ui } from "$lib/state/ui.svelte";

  interface Props {
    tabId: number;
    pluginId: string;
    pageId: string;
  }

  let { tabId, pluginId, pageId }: Props = $props();

  const found = $derived(getPage(pluginId, pageId));
  // Données envoyées par une autre page pour cet onglet : lues une seule fois, à l'ouverture.
  // svelte-ignore state_referenced_locally
  const incoming = takeIncoming(tabId);
  /** Les pages n'ont pas de « calcul » : les données d'un plugin passent par ses réglages (`etabli.settings`) et ses services. */
  const initial: DocumentSnapshot = { id: null, title: "", data: null };

  function onmessage(message: PluginToHost): void {
    if (message.type === "shortcut") {
      if (message.code) handleShortcut({ code: message.code, ctrl: message.ctrl, shift: message.shift, alt: message.alt });
    } else if (message.type === "notify") ui.notify(message.text);
    else if (message.type === "copy") {
      navigator.clipboard.writeText(message.text).then(
        () => ui.notify(`Copié : ${message.text}`),
        () => ui.notify("Copie impossible"),
      );
    } else if (message.type === "openSettings") openPluginSettings(message.plugin, message.hash);
    else if (message.type === "send") sendToApp(message.kind, message.data, found?.page.title ?? "");
  }
</script>

{#if found}
  {#if pluginProblems(found.plugin).length}
    <div class="problems"><PluginProblems plugin={found.plugin} /></div>
  {:else}
    <MiniAppFrame
      src={pluginUrl(pluginId, found.app.entry)}
      title={found.page.title}
      {pluginId}
      appId={found.app.id}
      {initial}
      {incoming}
      {onmessage}
    />
  {/if}
{:else}
  <div class="page">
    <h1>Page introuvable</h1>
    <p class="sub">Le plugin qui la contenait a peut-être été désinstallé, désactivé ou mis à jour.</p>
  </div>
{/if}

<style>
  .problems {
    padding: 24px;
  }
</style>
