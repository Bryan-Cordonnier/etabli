<script lang="ts">
  // Bandeau de l'état de la synchronisation avec le serveur : hors ligne, écritures en attente, session expirée.
  import { fondServeur } from "$lib/api";
  import { synchro } from "$lib/state/synchro.svelte";

  const visible = $derived(!!fondServeur && (synchro.sessionExpiree || synchro.etat === "hors-ligne" || synchro.enAttente > 0));

  /** Au redémarrage, une session refusée par le serveur ouvre l'écran de connexion (le cache hors ligne reste intact). */
  const reconnecter = () => location.reload();
</script>

{#if visible}
  <div class="bandeau" class:alerte={synchro.sessionExpiree} role="status">
    {#if synchro.sessionExpiree}
      <span>Votre session a expiré. Reconnectez-vous pour envoyer vos modifications.</span>
      <button class="btn" onclick={reconnecter}>Se reconnecter</button>
    {:else if synchro.etat === "hors-ligne"}
      <span>
        Hors ligne : vos modifications sont gardées sur cet appareil{synchro.enAttente ? ` (${synchro.enAttente} en attente)` : ""} et seront
        envoyées au retour du serveur.
      </span>
      <button class="btn" onclick={() => void fondServeur?.synchroniser()}>Réessayer</button>
    {:else}
      <span>{synchro.etat === "synchronisation" ? "Envoi des modifications…" : `${synchro.enAttente} modification(s) à envoyer.`}</span>
    {/if}
  </div>
{/if}

<style>
  .bandeau {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 16px;
    background: color-mix(in srgb, var(--warn) 16%, var(--surface));
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .bandeau.alerte {
    background: color-mix(in srgb, var(--err) 16%, var(--surface));
  }
  .bandeau .btn {
    flex: none;
    min-height: 32px;
  }
</style>
