<script lang="ts">
  // Écran d'une mini-app (section 5.6). Le contenu réel sera fourni par chaque plugin ;
  // le moteur affiche pour l'instant la disposition standard et la liste des anciens calculs.
  import Icon from "$lib/components/Icon.svelte";
  import PastCalcs from "$lib/components/PastCalcs.svelte";
  import Tile from "$lib/components/Tile.svelte";
  import { getMiniApp } from "$lib/plugins/registry";
  import { tabs } from "$lib/state/tabs.svelte";

  let { pluginId, appId }: { pluginId: string; appId: string } = $props();

  const found = $derived(getMiniApp(pluginId, appId));
  const soon = "Disponible avec les documents (jalon 2)";
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
      <h1>{app.name}</h1>
      <div class="actions">
        <button class="btn" disabled title={soon}><Icon name="plus" size={16} /> Nouveau</button>
        <button class="btn" disabled title={soon}>Exporter</button>
        <button class="btn" disabled title={soon}>Dupliquer</button>
      </div>
    </header>

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

    <PastCalcs items={[]} onopen={() => {}} />
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
  .actions {
    margin-left: auto;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
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
