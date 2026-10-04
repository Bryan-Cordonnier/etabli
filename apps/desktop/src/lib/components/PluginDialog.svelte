<script lang="ts">
  // Fenêtre de confirmation du cycle de vie des plugins (voir state/lifecycle.svelte.ts) :
  // installation avec dépendances, désinstallation ou désactivation en cascade.
  import type { Problem } from "@etabli/sdk/deps";
  import { libelles } from "$lib/plugins/permissions";
  import { PLUGINS, getPlugin } from "$lib/plugins/registry.svelte";
  import { catalogue } from "$lib/state/catalogue.svelte";
  import { lifecycle } from "$lib/state/lifecycle.svelte";

  const dialog = $derived(lifecycle.dialog);
  /** Nom du plugin qui offre un service, d'après les plugins installés puis le catalogue (pour la phrase d'une permission d'appel). */
  const fournisseurDe = (service: string): string | undefined =>
    PLUGINS.find((p) => Object.hasOwn(p.provides, service))?.name ?? catalogue.entries.find((e) => Object.hasOwn(e.provides, service))?.name;
  const nameOf = (id: string) => catalogue.entryOf(id)?.name ?? getPlugin(id)?.name ?? id;

  function why(problem: Problem): string {
    return problem.kind === "incompatible"
      ? `${nameOf(problem.id)} : la version ${problem.found} est installée, il faut ${problem.range} (introuvable dans le catalogue).`
      : `${nameOf(problem.id)} (version ${problem.range}) est introuvable dans le catalogue.`;
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Escape" && dialog) {
      event.stopPropagation();
      lifecycle.close();
    }
  }
</script>

<svelte:window {onkeydown} />

{#if dialog}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={() => lifecycle.close()}>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="plugin-dialog-title" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      {#if dialog.kind === "install"}
        <h2 id="plugin-dialog-title">{dialog.update ? "Mettre à jour" : "Installer"} {dialog.entry.name} ?</h2>

        {#if dialog.missing.length}
          <p class="problem">Impossible d'installer {dialog.entry.name} : il lui manque</p>
          <ul>
            {#each dialog.missing as problem (problem.id)}<li>{why(problem)}</li>{/each}
          </ul>
        {/if}

        {#if dialog.required.length}
          <p>{dialog.entry.name} a besoin de ces plugins, installés automatiquement :</p>
          <ul>
            {#each dialog.required as entry (entry.id)}
              <li><b>{entry.name}</b> <span class="version">v{entry.version}</span></li>
            {/each}
          </ul>
        {/if}

        {#if dialog.permissions.demandees.length}
          <p>{dialog.update && dialog.permissions.nouvelles.length ? "Cette version demande de nouvelles autorisations. Le plugin pourra :" : "Ce plugin pourra :"}</p>
          <ul>
            {#each libelles(dialog.permissions.demandees, fournisseurDe) as texte (texte)}
              <li>{texte}</li>
            {/each}
          </ul>
        {:else if !dialog.permissions.ancienContrat}
          <p class="muted">Ce plugin ne demande aucune autorisation : il calcule et affiche, rien d'autre.</p>
        {/if}
        {#if dialog.permissions.ancienContrat}
          <p class="problem">Ce plugin suit un ancien contrat : le moteur ne contrôle pas ce qu'il demande de faire. Installez-le seulement si vous lui faites confiance.</p>
        {/if}

        {#if dialog.entry.notes}
          <details class="notes">
            <summary>Nouveautés de la version {dialog.entry.version}</summary>
            <pre>{dialog.entry.notes}</pre>
          </details>
        {/if}

        {#if dialog.optional.length}
          <label class="check">
            <input type="checkbox" bind:checked={dialog.withOptional} />
            <span>
              Installer aussi les extensions facultatives
              <small>{dialog.entry.name} marche sans, mais s'en sert quand elles sont là : {dialog.optional.map((e) => e.name).join(", ")}.</small>
            </span>
          </label>
        {/if}

        <div class="buttons">
          <button class="btn" onclick={() => lifecycle.close()}>Annuler</button>
          {#if !dialog.missing.length}
            <button class="btn primary" onclick={() => void lifecycle.confirmInstall()}>
              {dialog.update ? "Mettre à jour" : "Installer"}
            </button>
          {/if}
        </div>
      {:else}
        <h2 id="plugin-dialog-title">{dialog.action === "uninstall" ? "Désinstaller" : "Désactiver"} {dialog.plugin.name} ?</h2>

        {#if dialog.dependents.length}
          <p>
            Ces plugins ont besoin de {dialog.plugin.name} :
            <b>{dialog.dependents.map((p) => p.name).join(", ")}</b>.
            {dialog.action === "uninstall" ? "Ils seront désinstallés" : "Ils seront désactivés"} aussi.
          </p>
        {/if}
        {#if dialog.optionalDependents.length && dialog.action === "uninstall"}
          <p>
            {dialog.optionalDependents.map((p) => p.name).join(", ")} continue{dialog.optionalDependents.length > 1 ? "nt" : ""} de marcher, mais
            sans les données de {dialog.plugin.name}.
          </p>
        {/if}
        {#if dialog.action === "uninstall"}
          <p><b>Vos calculs et vos réglages sont conservés</b> : vous les retrouverez si vous réinstallez.</p>
        {/if}

        <div class="buttons">
          <button class="btn" onclick={() => lifecycle.close()}>Annuler</button>
          <button class="btn primary" onclick={() => void lifecycle.confirmRemove()}>
            {dialog.dependents.length ? "Tout " : ""}{dialog.action === "uninstall" ? "désinstaller" : "désactiver"}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 16px;
    background: var(--scrim);
    animation: fade-in 0.12s ease-out;
  }
  .dialog {
    width: min(480px, 100%);
    padding: 20px;
    border-radius: var(--r-lg);
    background: var(--surface);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  p {
    margin: 0;
    color: var(--muted);
  }
  p.problem {
    color: var(--err);
  }
  ul {
    margin: 0;
    padding-left: 20px;
    color: var(--muted);
  }
  ul b {
    color: var(--text);
  }
  .muted {
    color: var(--muted);
    font-size: 12.5px;
  }
  .notes {
    font-size: 12.5px;
    color: var(--muted);
  }
  .notes summary {
    cursor: pointer;
    width: fit-content;
  }
  .notes pre {
    margin: 6px 0 0;
    max-height: 200px;
    overflow: auto;
    font: 12.5px/1.5 var(--font);
    white-space: pre-wrap;
    user-select: text;
  }
  .version {
    font: 12px var(--mono);
    color: var(--faint);
  }
  .check {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--r-md);
    background: var(--field);
    cursor: pointer;
  }
  .check input {
    width: 16px;
    height: 16px;
    margin: 2px 0 0;
    accent-color: var(--accent);
    flex: none;
  }
  .check span {
    display: flex;
    flex-direction: column;
    font-weight: 500;
  }
  .check small {
    font-weight: 400;
    color: var(--muted);
    font-size: 12.5px;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
</style>
