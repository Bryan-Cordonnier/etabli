<script lang="ts">
  // Boutons réduire / agrandir / fermer de la barre de titre personnalisée.
  // Hors de Tauri (aperçu dans un navigateur), ils ne s'affichent pas.
  import { isTauri } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Icon from "./Icon.svelte";

  const inTauri = isTauri();
  let maximized = $state(false);

  $effect(() => {
    if (!inTauri) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let disposed = false;

    win.isMaximized().then((value) => (maximized = value));
    win
      .onResized(async () => {
        maximized = await win.isMaximized();
      })
      .then((fn) => (disposed ? fn() : (unlisten = fn)));

    return () => {
      disposed = true;
      unlisten?.();
    };
  });
</script>

{#if inTauri}
  <div class="controls">
    <button onclick={() => getCurrentWindow().minimize()} aria-label="Réduire" title="Réduire">
      <Icon name="minus" size={16} strokeWidth={1.5} />
    </button>
    <button
      onclick={() => getCurrentWindow().toggleMaximize()}
      aria-label={maximized ? "Restaurer" : "Agrandir"}
      title={maximized ? "Restaurer" : "Agrandir"}
    >
      <Icon name={maximized ? "copy" : "square"} size={13} strokeWidth={1.5} />
    </button>
    <button class="close" onclick={() => getCurrentWindow().close()} aria-label="Fermer" title="Fermer">
      <Icon name="x" size={17} strokeWidth={1.5} />
    </button>
  </div>
{/if}

<style>
  .controls {
    display: flex;
    align-self: stretch;
    flex: none;
  }
  button {
    width: 46px;
    border: 0;
    background: none;
    color: var(--muted);
    display: grid;
    place-items: center;
    transition: background 0.1s;
  }
  button:hover {
    background: var(--field);
    color: var(--text);
  }
  .close:hover {
    background: #c42b1c;
    color: #fff;
  }
</style>
