<script lang="ts">
  // Jauge de progression : « 12/40 jours » à gauche, le pourcentage à droite. `niveau` colore la barre (orange puis rouge près d'une limite).
  interface Props {
    /** Valeur entre 0 et 100. */
    pourcent: number;
    gauche?: string;
    droite?: string;
    niveau?: "normal" | "attention" | "alerte";
    label?: string;
  }

  let { pourcent, gauche = "", droite = "", niveau = "normal", label = "Avancement" }: Props = $props();
  const valeur = $derived(Math.max(0, Math.min(100, Number.isFinite(pourcent) ? pourcent : 0)));
</script>

{#if gauche || droite}
  <div class="legende"><span class="num">{gauche}</span><span class="num">{droite}</span></div>
{/if}
<div class="piste" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(valeur)}>
  <i class={niveau} style:width="{valeur}%"></i>
</div>

<style>
  .legende {
    display: flex;
    justify-content: space-between;
    margin-top: 10px;
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 600;
  }
  .piste {
    height: 8px;
    margin-top: 4px;
    border-radius: 4px;
    background: var(--field);
    overflow: hidden;
  }
  i {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.2s ease-out;
  }
  i.attention {
    background: var(--warn);
  }
  i.alerte {
    background: var(--err);
  }
</style>