<script lang="ts">
  // Rappels (docs/24, section 7, étape 5) : des NOTIFICATIONS du téléphone, jamais des alarmes, jamais sur PC. Cet écran dit ce que le
  // téléphone permet, ce qui est programmé et par qui, et laisse tout annuler. Les autorisations se donnent dans Paramètres › Téléphone
  // d'Établi (le moteur seul parle aux notifications du téléphone). Le moteur ne programme que les 60 prochains jours : cet écran, comme
  // le Calendrier, renvoie la liste à chaque ouverture pour renouveler l'horizon.
  import { connect, type RemindersResult } from "@etabli/sdk";
  import { Card, Field } from "@etabli/ui";
  import { lireCarnet } from "../../src/carnet";
  import { GROUPE_ESSAI, remplacerRappels, annulerRappels, rappelsPourLeMoteur, resumeRappels } from "../../src/rappels";
  import { reglerHoraires } from "../../src/operations";
  import { ErreurAgenda, UTILISATEUR, type Carnet } from "../../src/types";

  let carnet = $state<Carnet | null>(null);
  let illisible = $state("");
  let etat = $state<RemindersResult | null>(null);
  let message = $state("");
  let host: Awaited<ReturnType<typeof connect<unknown>>> | undefined;
  let preAlerte = $state("");
  let rappelCoucher = $state("");

  function recevoir(donnees: unknown) {
    try {
      carnet = lireCarnet(donnees);
      illisible = "";
      preAlerte = String(carnet.reglages.preAlerteMin);
      rappelCoucher = String(carnet.reglages.rappelCoucherMin);
    } catch (e) {
      carnet = null;
      illisible = e instanceof ErreurAgenda ? e.message : "Carnet illisible.";
    }
  }

  /** Envoie au moteur la liste complète de ce qui doit sonner, puis relit l'état. */
  async function envoyer(c: Carnet | null = carnet) {
    if (!host || !c) return;
    etat = await host.reminders.set(rappelsPourLeMoteur(c, Date.now()));
  }

  void connect<unknown>().then(async (h) => {
    host = h;
    recevoir(h.settings.data);
    h.settings.onChange(recevoir);
    await envoyer();
  });

  function appliquer(travail: (c: Carnet) => Carnet): boolean {
    message = "";
    if (!carnet || !host) return false;
    try {
      const suivant = travail(carnet);
      host.settings.update(suivant);
      carnet = suivant;
      void envoyer(suivant);
      return true;
    } catch (e) {
      message = e instanceof ErreurAgenda ? e.message : "Une erreur est survenue : rien n'a été enregistré.";
      return false;
    }
  }

  const resume = $derived(carnet ? resumeRappels(carnet, Date.now()) : []);
  const jourCourt = (ms: number) => new Date(ms).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

  function essai() {
    const at = Date.now() + 60_000;
    appliquer((c) => remplacerRappels(c, UTILISATEUR, GROUPE_ESSAI, [{ id: "essai", at, titre: "Essai de rappel", texte: "Si vous lisez ceci, les rappels fonctionnent." }], `essai-${at}`).carnet);
  }

  function enregistrerHoraires() {
    appliquer((c) => reglerHoraires(c, { ...c.reglages, preAlerteMin: Number(preAlerte), rappelCoucherMin: Number(rappelCoucher) }));
  }
</script>

<main>
  {#if illisible}
    <Card title="Agenda illisible">
      <p class="erreur">{illisible}</p>
      <p class="aide">Les données n'ont pas été touchées. Rien ne s'enregistre tant que le carnet ne peut pas être lu.</p>
    </Card>
  {:else if carnet}
    <Card title="Sur le téléphone">
      {#if etat === null}
        <p class="aide">Vérification…</p>
      {:else if !etat.ok && etat.code === "telephone_seulement"}
        <p>Les rappels ne sonnent que sur le téléphone. Sur PC, rien ne sonne : les rappels sont gardés et partiront sur le téléphone.</p>
      {:else if !etat.ok}
        <p class="erreur">{etat.message}</p>
      {:else if !etat.autorise}
        <p class="erreur">Les notifications ne sont pas autorisées : aucun rappel ne sonnera.</p>
        <p class="aide">Autorisez-les dans Établi, Paramètres › Téléphone.</p>
      {:else}
        <p>
          <b>{etat.programmes}</b> rappel{etat.programmes > 1 ? "s" : ""} programmé{etat.programmes > 1 ? "s" : ""}{etat.jusquau ? `, jusqu'au ${jourCourt(etat.jusquau)}` : ""}.
        </p>
        {#if !etat.alarmeExacte}
          <p class="erreur">Les alarmes exactes sont refusées : l'heure d'un rappel peut varier de quelques minutes. Autorisez-les dans Paramètres › Téléphone.</p>
        {/if}
      {/if}
      <p class="aide">Seules des notifications, pas d'alarme. Le téléphone ne garde que les 60 prochains jours : ouvrez l'Agenda de temps en temps pour renouveler.</p>
      <button class="btn" onclick={() => envoyer()}>Renvoyer maintenant</button>
      <button class="btn" onclick={essai}>Essai dans 1 minute</button>
    </Card>

    <Card title="D'où viennent les rappels">
      {#if resume.length === 0}
        <p class="aide">Aucun rappel pour l'instant.</p>
      {:else}
        <ul class="liste">
          {#each resume as r (r.source + r.groupe)}
            <li>
              <span class="corps"><b>{r.source === UTILISATEUR ? "Vous" : r.source}</b><small>{r.groupe === "horaires" ? "pars dans X min, pars maintenant, coucher" : r.groupe} : {r.nombre}</small></span>
              {#if r.groupe !== "horaires"}<button class="btn" onclick={() => appliquer((c) => annulerRappels(c, r.source, r.groupe).carnet)}>Annuler</button>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </Card>

    <Card title="Pars maintenant et coucher">
      <label class="case"><input type="checkbox" checked={carnet.rappelsHoraires} onchange={(e) => appliquer((c) => ({ ...c, rappelsHoraires: e.currentTarget.checked }))} /> Rappeler les départs et le coucher des événements avec trajet</label>
      <div class="form ligne">
        <Field label="« Pars dans… » avant le départ" unit="min" bind:value={preAlerte} />
        <Field label="Rappel de coucher avant" unit="min" bind:value={rappelCoucher} />
        <button class="btn" onclick={enregistrerHoraires}>Enregistrer</button>
      </div>
    </Card>
    {#if message}<p class="erreur">{message}</p>{/if}
  {:else}
    <p class="aide">Chargement…</p>
  {/if}
</main>

<style>
  main { display: flex; flex-direction: column; gap: 12px; padding: 12px; max-width: 760px; margin-inline: auto; }
  .liste { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .liste li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .corps { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  small { color: var(--text-muted, #7c8794); }
  .case { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
  .form.ligne { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
  .form.ligne > :global(*) { flex: 1 1 160px; min-width: 0; }
  .erreur { color: var(--danger, #c0392b); }
  .aide { color: var(--text-muted, #7c8794); margin: 4px 0 8px; }
</style>
