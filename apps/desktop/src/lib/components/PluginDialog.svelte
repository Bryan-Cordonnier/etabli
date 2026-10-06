<script lang="ts">
  // Fenêtre de confirmation du cycle de vie des plugins (voir state/lifecycle.svelte.ts) :
  // désinstallation ou désactivation en cascade.
  import { lifecycle } from "$lib/state/lifecycle.svelte";

  const dialog = $derived(lifecycle.dialog);

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
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
</style>
