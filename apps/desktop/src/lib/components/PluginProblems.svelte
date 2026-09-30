<script lang="ts">
  // Dépendances obligatoires d'un plugin qui ne sont pas satisfaites : dit ce qui manque, en français,
  // avec le bouton qui règle le problème (installer, activer, ouvrir le catalogue).
  import type { Problem } from "@etabli/sdk/deps";
  import { getPlugin, pluginProblems } from "$lib/plugins/registry.svelte";
  import { catalogue } from "$lib/state/catalogue.svelte";
  import { lifecycle } from "$lib/state/lifecycle.svelte";
  import { tabs } from "$lib/state/tabs.svelte";
  import type { PluginManifest } from "$lib/types";

  interface Props {
    plugin: PluginManifest;
    /** Plus court, pour une liste de plugins. */
    compact?: boolean;
  }

  let { plugin, compact = false }: Props = $props();

  const problems = $derived(pluginProblems(plugin));

  $effect(() => {
    if (problems.length && catalogue.status === "idle") void catalogue.load();
  });

  const nameOf = (id: string) => getPlugin(id)?.name ?? catalogue.entryOf(id)?.name ?? id;

  function text(problem: Problem): string {
    const name = nameOf(problem.id);
    switch (problem.kind) {
      case "missing":
        return `Il faut installer « ${name} » (version ${problem.range}).`;
      case "incompatible":
        return `« ${name} » est en version ${problem.found} ; ${plugin.name} demande ${problem.range}. Mettez l'un des deux à jour.`;
      case "disabled":
        return `« ${name} » est désactivé.`;
    }
  }

  function fix(problem: Problem): void {
    if (problem.kind === "disabled") lifecycle.toggle(problem.id);
    else {
      const entry = catalogue.entryOf(problem.id);
      if (problem.kind === "missing" && entry) lifecycle.askInstall(entry);
      else tabs.navigate({ kind: "catalogue" });
    }
  }

  function label(problem: Problem): string {
    if (problem.kind === "disabled") return "Activer";
    if (problem.kind === "missing" && catalogue.entryOf(problem.id)) return `Installer ${nameOf(problem.id)}`;
    return "Ouvrir le catalogue";
  }
</script>

{#if problems.length}
  <div class="problems" class:compact role="alert">
    {#each problems as problem (problem.id)}
      <div class="row">
        <span>{text(problem)}</span>
        <button class="btn" onclick={() => fix(problem)}>{label(problem)}</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .problems {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--warn) 14%, transparent);
  }
  .compact {
    padding: 8px 10px;
    font-size: 13px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .row span {
    flex: 1;
    min-width: 200px;
  }
</style>
