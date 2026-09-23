<script lang="ts">
  // Écran d'une mini-app (cahier des charges, sections 5.6 et 7) : la mini-app du plugin dans son
  // cadre isolé, le titre du calcul, l'enregistrement automatique et la liste des anciens calculs.
  import type { PluginToHost } from "@etabli/sdk/protocol";
  import { onMount } from "svelte";
  import { api, inTauri, type DocumentMeta } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import MiniAppFrame from "$lib/components/MiniAppFrame.svelte";
  import PastCalcs from "$lib/components/PastCalcs.svelte";
  import Tile from "$lib/components/Tile.svelte";
  import { formatDate, stamp } from "$lib/dates";
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

  const SAVE_DELAY = 1000;
  const found = $derived(getMiniApp(pluginId, appId));

  let meta = $state<DocumentMeta | null>(null);
  let title = $state("");
  let initial = $state<{ id: string | null; title: string; data: unknown } | null>(null);
  let missing = $state(false);
  let history = $state<DocumentMeta[]>([]);

  // Données courantes de la mini-app : pas besoin de réactivité, elles ne sont pas affichées ici.
  let data: unknown = null;
  let summary = "";
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue: Promise<void> = Promise.resolve();

  const pastCalcs = $derived(
    history.map((d) => ({ id: d.id, title: d.title, summary: d.summary, date: formatDate(d.modified) })),
  );

  const defaultTitle = () => `${found?.app.name ?? "Calcul"} — ${stamp()}`;

  /** Un nouveau calcul n'est enregistré qu'après une première modification (section 7.2). */
  const hasContent = () => meta !== null || data !== null;

  onMount(() => {
    void load(docId);
    const flush = () => void saveNow();
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      if (dirty) void saveNow();
    };
  });

  async function load(id: string | undefined): Promise<void> {
    if (id) {
      try {
        const doc = await api.documentRead(id);
        meta = doc;
        title = doc.title;
        summary = doc.summary;
        data = doc.data;
        initial = { id: doc.id, title: doc.title, data: doc.data };
      } catch {
        missing = true;
      }
    }
    if (!initial) {
      title = defaultTitle();
      initial = { id: null, title, data: null };
    }
    await refreshHistory();
  }

  async function refreshHistory(): Promise<void> {
    history = await api.documentsList({ pluginId, appId }).catch(() => []);
  }

  function scheduleSave(): void {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => void saveNow(), SAVE_DELAY);
  }

  /** Les enregistrements passent l'un après l'autre : un nouveau calcul n'est jamais créé deux fois. */
  function saveNow(): Promise<void> {
    clearTimeout(timer);
    queue = queue.then(write);
    return queue;
  }

  async function write(): Promise<void> {
    if (!dirty || !found) return;
    dirty = false;
    try {
      const saved = await api.documentSave({
        id: meta?.id,
        pluginId,
        appId,
        dataVersion: found.app.dataVersion,
        title: title.trim() || defaultTitle(),
        summary,
        data,
      });
      const created = meta === null;
      meta = saved;
      if (created) tabs.setDocId(tabId, saved.id);
      await refreshHistory();
    } catch (err) {
      dirty = true;
      ui.notify(`Enregistrement impossible : ${err}`);
    }
  }

  function onmessage(message: PluginToHost): void {
    switch (message.type) {
      case "update":
        data = message.data;
        scheduleSave();
        break;
      case "summary":
        summary = message.summary;
        if (hasContent()) scheduleSave();
        break;
      case "title":
        title = message.title;
        if (hasContent()) scheduleSave();
        break;
      case "notify":
        ui.notify(message.text);
        break;
      case "copy":
        void copyText(message.text);
        break;
      case "shortcut":
        handleShortcut(message);
        break;
    }
  }

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      ui.notify(`Copié : ${text}`);
    } catch {
      ui.notify("Copie impossible");
    }
  }

  const view = (id?: string): AppView => ({ kind: "app", pluginId, appId, docId: id });

  async function newCalc(): Promise<void> {
    await saveNow();
    tabs.replace(view());
  }

  async function duplicate(): Promise<void> {
    await saveNow();
    if (!found || !meta) return;
    const copy = await api.documentSave({
      pluginId,
      appId,
      dataVersion: found.app.dataVersion,
      title: `${title} (copie)`,
      summary,
      data,
    });
    tabs.replace(view(copy.id));
    ui.notify("Calcul dupliqué");
  }

  async function remove(): Promise<void> {
    if (!meta) return;
    clearTimeout(timer);
    dirty = false;
    await queue;
    await api.documentDelete(meta.id);
    tabs.replace(view());
    ui.notify("Calcul déplacé dans la corbeille");
  }

  async function openPast(id: string, event: MouseEvent): Promise<void> {
    if (id === meta?.id) return;
    await saveNow();
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
      <input
        class="title"
        bind:value={title}
        oninput={() => hasContent() && scheduleSave()}
        onblur={() => void saveNow()}
        aria-label="Titre du calcul"
        spellcheck="false"
      />
      <div class="actions">
        <button class="btn" onclick={newCalc}><Icon name="plus" size={16} /> Nouveau</button>
        <button class="btn" disabled title="L'export PDF et CSV arrive avec les mini-apps de calcul">Exporter</button>
        <button class="btn" onclick={duplicate} disabled={!meta} title={meta ? "Dupliquer ce calcul" : "Modifiez le calcul pour pouvoir le dupliquer"}>
          Dupliquer
        </button>
        <button class="btn icon" onclick={remove} disabled={!meta} title="Déplacer dans la corbeille" aria-label="Supprimer le calcul">
          <Icon name="trash" size={16} />
        </button>
      </div>
    </header>

    {#if missing}
      <p class="notice">Ce calcul est introuvable : il a peut-être été supprimé ou déplacé. Un nouveau calcul a été ouvert.</p>
    {/if}

    {#if app.entry}
      {#if !inTauri}
        <p class="notice">Aperçu navigateur : les calculs sont gardés dans ce navigateur, pas dans des fichiers.</p>
      {/if}
      {#if initial}
        <MiniAppFrame src={pluginUrl(pluginId, app.entry)} title={app.name} {pluginId} {appId} {initial} {onmessage} />
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

    <PastCalcs items={pastCalcs} currentId={meta?.id} onopen={openPast} />
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
    border-radius: 8px;
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
