<script lang="ts">
  // Écran affiché AVANT l'application quand il faut choisir ou rouvrir un compte (docs/16, §5) :
  // premier lancement face à un serveur, session expirée, ou installation initiale du serveur.
  import { ecrireConnexion, installerServeur, lireDerniere, normaliserAdresse, ouvrirSession, phraseErreur, sonderServeur } from "$lib/connexion";
  import Logo from "./Logo.svelte";

  interface Props {
    /** La page est servie par un serveur Établi : pas d'adresse à saisir. */
    memeOrigine: boolean;
    /** Le serveur est déjà installé (sinon on propose de créer l'administrateur). */
    installe: boolean;
    /** Session expirée : on propose de se reconnecter au même serveur. */
    expiree?: boolean;
  }
  let { memeOrigine, installe: installeInitial, expiree = false }: Props = $props();

  const precedente = lireDerniere();
  let adresse = $state(precedente?.url ?? "");
  // Valeurs saisies ou trouvées par « Continuer » ; à défaut, celles données par la page qui nous affiche.
  let installeTrouve = $state<boolean | null>(null);
  let adresseVerifiee = $state(false);
  const installe = $derived(installeTrouve ?? installeInitial);
  const verifie = $derived(memeOrigine || adresseVerifiee);
  let nom = $state(precedente?.nom ?? "");
  let motDePasse = $state("");
  let confirmation = $state("");
  let code = $state("");
  let erreur = $state("");
  let occupe = $state(false);

  const url = $derived.by(() => {
    if (memeOrigine) return "";
    const r = normaliserAdresse(adresse);
    return "url" in r ? r.url : null;
  });

  async function verifier(): Promise<void> {
    erreur = "";
    const r = normaliserAdresse(adresse);
    if ("erreur" in r) return void (erreur = r.erreur);
    if (!r.url) return void (erreur = "Saisissez l'adresse du serveur.");
    occupe = true;
    const sonde = await sonderServeur(r.url);
    occupe = false;
    if (!sonde) {
      erreur = "Aucun serveur Établi ne répond à cette adresse. Vérifiez l'adresse et que le serveur autorise ce site (option --origine).";
      return;
    }
    installeTrouve = sonde.installe;
    adresseVerifiee = true;
  }

  async function valider(event: Event): Promise<void> {
    event.preventDefault();
    erreur = "";
    if (url === null) return void (erreur = "L'adresse du serveur n'est pas valide.");
    if (!installe && motDePasse !== confirmation) return void (erreur = "Les deux mots de passe ne sont pas identiques.");
    occupe = true;
    try {
      const connexion = installe
        ? await ouvrirSession(url, nom.trim(), motDePasse)
        : await installerServeur(url, code.trim(), nom.trim(), motDePasse);
      ecrireConnexion(connexion);
      location.reload();
    } catch (e) {
      erreur = phraseErreur(e);
      occupe = false;
    }
  }

  function utiliserSeul(): void {
    ecrireConnexion({ mode: "local" });
    location.reload();
  }
</script>

<main class="ecran">
  <form class="carte" onsubmit={valider}>
    <div class="marque"><Logo size={40} /> <span>Établi</span></div>

    {#if expiree}
      <h1>Votre session a expiré</h1>
      <p class="lead">Reconnectez-vous pour retrouver vos calculs. Ce qui n'a pas pu être envoyé est gardé sur cet appareil.</p>
    {:else if !verifie}
      <h1>Se connecter à un serveur</h1>
      <p class="lead">Saisissez l'adresse du serveur Établi de votre atelier, de votre classe ou de votre maison.</p>
    {:else if installe}
      <h1>Connexion</h1>
      <p class="lead">{memeOrigine ? "Ce serveur Établi demande un compte." : `Serveur : ${url}`}</p>
    {:else}
      <h1>Installer le serveur</h1>
      <p class="lead">Créez le compte administrateur. Le code d'installation est affiché dans la console du serveur, au premier lancement.</p>
    {/if}

    {#if !memeOrigine && !expiree}
      <label>
        Adresse du serveur
        <input type="text" bind:value={adresse} placeholder="https://etabli.exemple.fr" autocomplete="url" disabled={occupe} oninput={() => (adresseVerifiee = false)} />
      </label>
    {/if}

    {#if verifie}
      {#if !installe}
        <label>Code d'installation<input type="text" bind:value={code} autocomplete="off" placeholder="XXXXXXXX-XXXXXXXX" required /></label>
      {/if}
      <label>Identifiant<input type="text" bind:value={nom} autocomplete="username" required /></label>
      <label>Mot de passe<input type="password" bind:value={motDePasse} autocomplete={installe ? "current-password" : "new-password"} required /></label>
      {#if !installe}
        <label>Confirmer le mot de passe<input type="password" bind:value={confirmation} autocomplete="new-password" required /></label>
        <p class="hint">10 caractères au moins. Une phrase est plus sûre qu'un mot.</p>
      {/if}
    {/if}

    {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}

    <div class="actions">
      {#if verifie}
        <button class="btn primary" type="submit" disabled={occupe}>{installe ? "Se connecter" : "Créer l'administrateur"}</button>
      {:else}
        <button class="btn primary" type="button" disabled={occupe || !adresse.trim()} onclick={verifier}>{occupe ? "Recherche…" : "Continuer"}</button>
      {/if}
      {#if !expiree}
        <button class="btn" type="button" onclick={utiliserSeul}>Utiliser Établi seul sur cet appareil</button>
      {/if}
    </div>
    <p class="hint">Sans serveur, tout reste dans ce navigateur. Vous pourrez vous connecter plus tard (Paramètres → Serveur).</p>
  </form>
</main>

<style>
  .ecran {
    min-height: 100%;
    display: grid;
    place-items: center;
    padding: 24px 16px;
    overflow: auto;
  }
  .carte {
    width: min(420px, 100%);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 28px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: var(--shadow);
    animation: rise 0.22s ease-out both;
  }
  .marque {
    display: flex;
    align-items: center;
    gap: 12px;
    font-weight: 700;
    font-size: 20px;
  }
  h1 {
    margin: 0;
    font-size: 20px;
    text-wrap: balance;
  }
  .lead {
    margin: 0;
    color: var(--muted);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  input {
    height: 40px;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--field);
    font: 500 14px var(--font);
    color: var(--text);
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
    background: var(--surface);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .actions .btn {
    justify-content: center;
    min-height: 40px;
  }
  .erreur {
    margin: 0;
    padding: 10px 12px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--err) 14%, transparent);
    color: var(--err);
    font-size: 13px;
  }
</style>
