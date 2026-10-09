<script lang="ts">
  // Fenêtre centrée sur un simple voile en fondu (comme l'aperçu rapide) : ni plein écran, ni flou, ni zoom. Échap ou un clic à côté la ferme.
  // Une page de plugin remplit toute la zone visible : la fenêtre se centre dans ce que l'utilisateur voit.
  import type { Snippet } from "svelte";

  interface Props {
    open: boolean;
    titre: string;
    onclose: () => void;
    /** Largeur maximale en pixels. */
    largeur?: number;
    children: Snippet;
    /** Boutons en bas de la fenêtre. */
    pied?: Snippet;
  }

  let { open, titre, onclose, largeur = 560, children, pied }: Props = $props();

  $effect(() => {
    if (!open) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onclose();
    };
    window.addEventListener("keydown", touche, true);
    return () => window.removeEventListener("keydown", touche, true);
  });
</script>

{#if open}
  <div class="voile" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && onclose()}>
    <div class="fenetre" role="dialog" aria-modal="true" aria-label={titre} style:max-width="{largeur}px">
      <header>
        <h2>{titre}</h2>
        <button class="btn sm" onclick={onclose}>Fermer</button>
      </header>
      <div class="corps">{@render children()}</div>
      {#if pied}<footer>{@render pied()}</footer>{/if}
    </div>
  </div>
{/if}

<style>
  .voile {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgb(0 0 0 / 0.36);
    animation: fondu 0.15s ease-out;
  }
  .fenetre {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-height: 100%;
    padding: 16px 20px 20px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 18px 50px rgb(0 0 0 / 0.28);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-size: 18px;
    letter-spacing: -0.02em;
  }
  .corps {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    overflow-y: auto;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  /* Téléphone : jamais un cadre posé par-dessus la page, mais une page entière. */
  @media (max-width: 640px) {
    .voile {
      padding: 0;
      place-items: stretch;
      background: var(--surface);
    }
    .fenetre {
      height: 100%;
      max-width: none !important;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      padding: calc(14px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px));
    }
  }
  @keyframes fondu {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>