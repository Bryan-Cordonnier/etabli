<script lang="ts">
  // Paramètres → Alarmes (téléphone Android) : essai d'une alarme locale exacte, application fermée (docs/16 §6).
  import { onMount } from "svelte";
  import { annulerEssai, autoriser, essaiEnAttente, lireEtat, pluginNatif, programmerEssai, type EtatAlarmes, type PluginNotifications } from "$lib/mobile/alarmes";

  let plugin = $state<PluginNotifications | null>(null);
  let etat = $state<EtatAlarmes | null>(null);
  let minutes = $state(2);
  let prevue = $state<Date | null>(null);
  let erreur = $state("");

  async function rafraichir(): Promise<void> {
    if (!plugin) return;
    etat = await lireEtat(plugin);
    if (!(await essaiEnAttente(plugin))) prevue = null;
  }

  async function agir(action: () => Promise<void>): Promise<void> {
    erreur = "";
    try {
      await action();
      await rafraichir();
    } catch (e) {
      erreur = e instanceof Error ? e.message : String(e);
    }
  }

  onMount(() => {
    agir(async () => {
      plugin = await pluginNatif();
    });
  });
</script>

<div class="box">
  <h3>Autorisations</h3>
  {#if etat}
    <p>Notifications : <strong>{etat.notifications ? "autorisées" : "non autorisées"}</strong></p>
    <p>Alarmes exactes : <strong>{etat.exactes ? "autorisées" : "non autorisées (l'heure ne sera pas garantie)"}</strong></p>
  {:else}
    <p>Lecture des autorisations…</p>
  {/if}
  <button disabled={!plugin} onclick={() => agir(async () => void (etat = await autoriser(plugin!)))}>Autoriser</button>
</div>

<div class="box">
  <h3>Essai d'alarme</h3>
  <p>
    Programmez une alarme, <strong>fermez complètement l'application</strong> (retirez-la des applications récentes), verrouillez le
    téléphone et attendez : la notification doit arriver à l'heure prévue.
  </p>
  <label>Dans <input type="number" min="1" max="1440" bind:value={minutes} /> minute(s)</label>
  <button disabled={!plugin} onclick={() => agir(async () => void (prevue = await programmerEssai(plugin!, minutes)))}>Programmer</button>
  <button disabled={!plugin || !prevue} onclick={() => agir(() => annulerEssai(plugin!))}>Annuler</button>
  {#if prevue}
    <p>Prévue à <strong>{prevue.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong>.</p>
  {/if}
  {#if erreur}<p role="alert">{erreur}</p>{/if}
</div>
