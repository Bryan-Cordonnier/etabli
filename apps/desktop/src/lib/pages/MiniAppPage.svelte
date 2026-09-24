<script lang="ts">
  // Écran d'une mini-app (cahier des charges, sections 5.6 et 7) : la mini-app du plugin dans son
  // cadre isolé, le titre du calcul, l'enregistrement automatique et la liste des anciens calculs.
  import type { PluginToHost } from "@etabli/sdk/protocol";
  import { onMount } from "svelte";
  import { inTauri } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import MiniAppFrame from "$lib/components/MiniAppFrame.svelte";
  import PastCalcs from "$lib/components/PastCalcs.svelte";
  import Tile from "$lib/components/Tile.svelte";
  import { formatDate } from "$lib/dates";
  import { DocumentSession } from "$lib/documents.svelte";
  import { addMachineFromApp } from "$lib/machines";
  import { getMiniApp, pluginUrl } from "$lib/plugins/registry";
  import { handleShortcut } from "$lib/shortcuts";
  import { tabs } from "$lib/state/tabs.svelte";
  import { ui } from "$lib/state/ui.svelte";
  import type { AppView } from "$lib/types";

  interface Props {
    tabId: number;
    pluginId: string;
    appId: string;
    /** Lu à l'ouverture seulement : l'identifiant attribué au premier enregistrement ne recharge rien. */
    docId?: string;
  }

  let { tabId, pluginId, appId, docId }: Props = $props();

  const found = $derived(getMiniApp(pluginId, appId));
  let session = $state<DocumentSession | null>(null);

  const pastCalcs = $derived(
    (session?.history ?? []).map((d) => ({ id: d.id, title: d.title, summary: d.summary, date: formatDate(d.modified) })),
  );

  onMount(() => {
    if (!found) return;
    const current = new DocumentSession(found, (id) => tabs.setDocId(tabId, id));
    session = current;
    void current.load(docId).then(() => current.refreshHistory());
    const flush = () => void current.saveNow();
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      current.dispose();
    };
  });

  function onmessage(message: PluginToHost): void {
    if (session?.handle(message)) return;
    if (message.type === "shortcut") handleShortcut(message);
    else if (message.type === "addMachine") addMachineFromApp(message.kind);
  }

  const view = (id?: string): AppView => ({ kind: "app", pluginId, appId, docId: id });

  async function newCalc(): Promise<void> {
    await session?.saveNow();
    tabs.replace(view());
  }

  async function duplicate(): Promise<void> {
    const id = await session?.duplicate();
    if (!id) return;
    tabs.replace(view(id));
    ui.notify("Calcul dupliqué");
  }

  async function remove(): Promise<void> {
    await session?.remove();
    tabs.replace(view());
    ui.notify("Calcul déplacé dans la corbeille");
  }

  async function openPast(id: string, event: MouseEvent): Promise<void> {
    if (!session || id === session.meta?.id) return;
    await session.saveNow();
    const elsewhere = tabs.list.find((t) => t.view.kind === "app" && t.view.docId === id);
    if (elsewhere) tabs.activate(elsewhere.id);
    else if (event.ctrlKey) tabs.open(view(id));
    else tabs.replace(view(id));
  }
</script>

<div class="page wide">
  {#if found}
    {@const { plugin, app } = found}
    <nav class="crumbs" aria-label="Fil d'Ariane">
      <button onclick={() => tabs.navigate({ kind: "home" })}>Accueil</button>›
      <button onclick={(e) => tabs.navigate({ kind: "plugin", pluginId }, { newTab: e.ctrlKey })}>{plugin.name}</button>›
      <span>{app.name}</span>
    </nav>

    <header class="head">
      <Tile color={plugin.color} icon={app.icon} emoji={app.emoji} variant="soft" size={36} />
      {#if session}
        <input
          class="title"
          value={session.title}
          oninput={(e) => session?.rename(e.currentTarget.value)}
          onblur={() => void session?.saveNow()}
          aria-label="Titre du calcul"
          spellcheck="false"
        />
      {/if}
      <div class="actions">
        <button class="btn" onclick={newCalc}><Icon name="plus" size={16} /> Nouveau</button>
        <button class="btn" disabled title="L'export PDF et CSV arrive avec les mini-apps de calcul">Exporter</button>
        <button
          class="btn"
          onclick={duplicate}
          disabled={!session?.meta}
          title={session?.meta ? "Dupliquer ce calcul" : "Modifiez le calcul pour pouvoir le dupliquer"}
        >
          Dupliquer
        </button>
        <button
          class="btn icon"
          onclick={remove}
          disabled={!session?.meta}
          title="Déplacer dans la corbeille"
          aria-label="Supprimer le calcul"
        >
          <Icon name="trash" size={16} />
        </button>
      </div>
    </header>

    {#if session?.missing}
      <p class="notice">Ce calcul est introuvable : il a peut-être été supprimé ou déplacé. Un nouveau calcul a été ouvert.</p>
    {/if}

    {#if app.entry}
      {#if !inTauri}
        <p class="notice">Aperçu navigateur : les calculs sont gardés dans ce navigateur, pas dans des fichiers.</p>
      {/if}
      {#if session?.initial}
        <MiniAppFrame
          src={pluginUrl(pluginId, app.entry)}
          title={app.name}
          {pluginId}
          {appId}
          initial={session.initial}
          docTitle={session.title}
          {onmessage}
        />
      {/if}
    {:else}
      <div class="split">
        <div class="box placeholder">
          <h3>Entrées</h3>
          <p class="hint">Les champs de saisie de la mini-app s'afficheront ici.</p>
        </div>
        <div class="box placeholder">
          <h3>Résultats</h3>
          <p class="hint">
            « {app.name} » sera développée dans le plugin {plugin.name}
            ({app.plannedFor === "v2" ? "prévue en version 2" : "prévue en version 1"}).
          </p>
        </div>
      </div>
    {/if}

    <PastCalcs items={pastCalcs} currentId={session?.meta?.id} onopen={openPast} />
  {:else}
    <h1>Mini-app introuvable</h1>
    <p class="sub">Le plugin qui la contenait a peut-être été désinstallé ou désactivé.</p>
  {/if}
</div>

<style>
  .wide {
    max-width: none;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .title {
    flex: 1;
    min-width: 200px;
    font: 700 20px var(--font);
    color: var(--text);
    border: 1px solid transparent;
    border-radius: var(--r-md);
    background: none;
    padding: 2px 6px;
    margin-left: -6px;
    outline: none;
  }
  .title:hover {
    border-color: var(--border);
  }
  .title:focus {
    border-color: var(--accent);
    background: var(--surface);
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .btn.icon {
    width: 36px;
    padding: 0;
    justify-content: center;
  }
  .notice {
    margin: 0;
    padding: 10px 14px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--warn) 14%, transparent);
    color: var(--text);
    font-size: 13px;
  }
  .split {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 16px;
    align-items: stretch;
  }
  .placeholder {
    min-height: 220px;
    border-style: dashed;
  }
  @media (max-width: 900px) {
    .split {
      grid-template-columns: 1fr;
    }
  }
</style>
