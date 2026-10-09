<script lang="ts">
  import { distribution } from "$lib/distribution";
  const nomApp = distribution.name;
  // Paramètres → Serveur : connexion, compte, mot de passe, données (docs/16 et 17).
  import { api, clientServeur, fondServeur } from "$lib/api";
  import { compte } from "$lib/serveur/admin";
  import { ecrireConnexion, installerServeur, lireConnexion, normaliserAdresse, ouvrirSession, phraseErreur, sonderServeur } from "$lib/connexion";
  import { importer, lireLocal, apercu, type Bilan } from "$lib/serveur/importer";
  import type { ExportComplet } from "$lib/fond/types";
  import { synchro } from "$lib/state/synchro.svelte";
  import { ui } from "$lib/state/ui.svelte";

  const connexion = lireConnexion();
  const utilisateur = connexion?.mode === "serveur" ? connexion.utilisateur : null;
  const adresseServeur = connexion?.mode === "serveur" ? connexion.url || location.origin : "";

  // ——— Se connecter (mode seul) ———
  let adresse = $state("");
  let nom = $state("");
  let motDePasse = $state("");
  let code = $state("");
  let installe = $state<boolean | null>(null);
  let erreur = $state("");
  let occupe = $state(false);

  async function verifier(): Promise<void> {
    erreur = "";
    const r = normaliserAdresse(adresse);
    if ("erreur" in r) return void (erreur = r.erreur);
    occupe = true;
    const sonde = await sonderServeur(r.url);
    occupe = false;
    if (!sonde) return void (erreur = `Aucun serveur ${nomApp} ne répond à cette adresse (ou il n'autorise pas ce site : option --origine).`);
    installe = sonde.installe;
  }

  async function seConnecter(event: Event): Promise<void> {
    event.preventDefault();
    erreur = "";
    const r = normaliserAdresse(adresse);
    if ("erreur" in r) return void (erreur = r.erreur);
    occupe = true;
    try {
      const c = installe ? await ouvrirSession(r.url, nom.trim(), motDePasse) : await installerServeur(r.url, code.trim(), nom.trim(), motDePasse);
      ecrireConnexion(c);
      location.reload();
    } catch (e) {
      erreur = phraseErreur(e);
      occupe = false;
    }
  }

  // ——— Compte connecté ———
  let actuel = $state("");
  let nouveau = $state("");
  let confirmation = $state("");
  let messageMdp = $state("");

  async function changerMotDePasse(event: Event): Promise<void> {
    event.preventDefault();
    messageMdp = "";
    if (nouveau !== confirmation) return void (messageMdp = "Les deux mots de passe ne sont pas identiques.");
    if (!clientServeur) return;
    try {
      await compte(clientServeur).changerMotDePasse(actuel, nouveau);
      actuel = nouveau = confirmation = "";
      messageMdp = "Mot de passe changé. Vos autres appareils devront se reconnecter.";
    } catch (e) {
      messageMdp = phraseErreur(e);
    }
  }

  let confirmerDeconnexion = $state(false);
  async function deconnecter(): Promise<void> {
    try {
      if (clientServeur) await compte(clientServeur).deconnecter();
    } catch {
      /* hors ligne ou session déjà expirée : on se déconnecte quand même de cet appareil */
    }
    // Appareil partagé : la copie locale des calculs de ce compte est effacée avec la session.
    if (fondServeur) indexedDB.deleteDatabase(fondServeur.nomCache);
    ecrireConnexion(null);
    location.reload();
  }

  async function exporterMesDonnees(): Promise<void> {
    if (!clientServeur) return;
    try {
      const donnees = await compte(clientServeur).exporter();
      void api.saveFile({ name: "etabli-mes-donnees.json", content: JSON.stringify(donnees, null, 2), extension: "json", description: `Données ${nomApp}` });
    } catch (e) {
      ui.notify(phraseErreur(e));
    }
  }

  // ——— Importer les données de l'ancien mode seul ———
  let local = $state<ExportComplet | null>(null);
  let bilan = $state<Bilan | null>(null);
  let progression = $state("");
  let importEnCours = $state(false);
  $effect(() => {
    if (api.id === "serveur") void lireLocal().then((tout) => (local = tout));
  });

  async function lancerImport(): Promise<void> {
    if (!clientServeur || !local) return;
    importEnCours = true;
    try {
      bilan = await importer(clientServeur, local, (fait, total) => (progression = `${fait} / ${total}`));
    } catch (e) {
      ui.notify(phraseErreur(e));
    }
    importEnCours = false;
  }

  const ROLES = { admin: "administrateur", utilisateur: "utilisateur" } as const;
</script>

{#if api.id === "tauri"}
  <div class="box">
    <h3>Serveur</h3>
    <p>

      le navigateur) ; sur téléphone aussi. Cette version Windows garde tout sur l'ordinateur, comme avant.
    </p>
    <p class="hint">Le serveur est facultatif : sans lui, rien ne change.</p>
  </div>
{:else if api.id === "web"}
  <div class="box">


    <form class="champs" onsubmit={seConnecter}>
      <label>Adresse du serveur<input class="text-input" bind:value={adresse} placeholder="https://etabli.exemple.fr" oninput={() => (installe = null)} /></label>
      {#if installe === null}
        <div class="buttons"><button class="btn primary" type="button" disabled={occupe || !adresse.trim()} onclick={verifier}>{occupe ? "Recherche…" : "Continuer"}</button></div>
      {:else}
        {#if !installe}
          <p class="hint">Ce serveur n'est pas encore installé : créez l'administrateur avec le code affiché dans sa console.</p>
          <label>Code d'installation<input class="text-input" bind:value={code} required /></label>
        {/if}
        <label>Identifiant<input class="text-input" bind:value={nom} autocomplete="username" required /></label>
        <label>Mot de passe<input class="text-input" type="password" bind:value={motDePasse} autocomplete="current-password" required /></label>
        <div class="buttons"><button class="btn primary" type="submit" disabled={occupe}>{installe ? "Se connecter" : "Créer l'administrateur"}</button></div>
      {/if}
      {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
    </form>
    <p class="hint">Vos données actuelles restent sur cet appareil ; vous pourrez les importer dans votre compte après la connexion.</p>
  </div>
{:else if utilisateur}
  <div class="box">
    <h3>Compte</h3>
    <p>Connecté en tant que <b>{utilisateur.nom}</b> ({ROLES[utilisateur.role]}) sur <code>{adresseServeur}</code>.</p>
    <p class="hint">
      {#if synchro.etat === "hors-ligne"}Serveur injoignable : vous travaillez sur la copie de cet appareil.
      {:else if synchro.enAttente > 0}{synchro.enAttente} modification(s) à envoyer.
      {:else}Tout est à jour avec le serveur.{/if}
    </p>
    <div class="buttons">
      <button class="btn" onclick={() => void fondServeur?.synchroniser()}>Synchroniser maintenant</button>
      <button class="btn" onclick={exporterMesDonnees}>Télécharger mes données</button>
      {#if !confirmerDeconnexion}
        <button class="btn" onclick={() => (confirmerDeconnexion = true)}>Se déconnecter</button>
      {/if}
    </div>
    {#if confirmerDeconnexion}
      <div class="confirmation">
        <p>
          {synchro.enAttente > 0
            ? `${synchro.enAttente} modification(s) faites hors ligne n'ont pas encore été envoyées : elles seront perdues.`
            : "La copie de vos calculs sur cet appareil sera effacée."}
          Vos calculs restent sur le serveur.
        </p>
        <div class="buttons">
          <button class="btn primary" onclick={deconnecter}>Se déconnecter</button>
          <button class="btn" onclick={() => (confirmerDeconnexion = false)}>Annuler</button>
        </div>
      </div>
    {/if}
  </div>

  <div class="box">
    <h3>Mot de passe</h3>
    <form class="champs" onsubmit={changerMotDePasse}>
      <label>Mot de passe actuel<input class="text-input" type="password" bind:value={actuel} autocomplete="current-password" required /></label>
      <label>Nouveau mot de passe<input class="text-input" type="password" bind:value={nouveau} autocomplete="new-password" required /></label>
      <label>Confirmer<input class="text-input" type="password" bind:value={confirmation} autocomplete="new-password" required /></label>
      <div class="buttons"><button class="btn" type="submit">Changer le mot de passe</button></div>
      {#if messageMdp}<p class="hint" role="status">{messageMdp}</p>{/if}
    </form>
  </div>

  {#if local}
    {@const a = apercu(local)}
    <div class="box">
      <h3>Données de cet appareil</h3>
      <p>

        {a.reglages ? "et vos réglages" : ""}. Vous pouvez les ajouter à votre compte.
      </p>
      <p class="hint">Rien n'est écrasé : ce qui existe déjà sur le serveur est gardé. Les données de cet appareil restent en place, comme sauvegarde.</p>
      {#if bilan}
        <p role="status">
          Importé : {bilan.documentsImportes} calcul(s) ({bilan.documentsDejaPresents} déjà présents), {bilan.donneesImportees} jeu(x) de réglages de plugins
          ({bilan.donneesDejaPresentes} déjà présents){bilan.reglagesImportes ? ", réglages" : ""}.
        </p>
        {#each bilan.refus as ligne (ligne)}<p class="hint">Refusé : {ligne}</p>{/each}
      {:else}
        <div class="buttons"><button class="btn primary" disabled={importEnCours} onclick={lancerImport}>{importEnCours ? `Import… ${progression}` : "Importer dans mon compte"}</button></div>
      {/if}
    </div>
  {/if}
{/if}

<style>
  .champs {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 360px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  .text-input {
    width: 100%;
    height: 36px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--field);
    font: 500 14px var(--font);
    color: var(--text);
    outline: none;
  }
  .text-input:focus {
    border-color: var(--accent);
    background: var(--surface);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .erreur {
    margin: 0;
    color: var(--err);
    font-size: 13px;
  }
  .confirmation {
    padding: 12px;
    border-radius: var(--r-sm);
    background: var(--field);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  p {
    margin: 0;
  }
  code {
    font-family: var(--mono);
    font-size: 12px;
  }
</style>
