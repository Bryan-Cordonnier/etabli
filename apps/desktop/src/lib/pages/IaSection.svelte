<script lang="ts">
  // Paramètres → Intelligence artificielle : la clé Gemini de l'utilisateur et le modèle. La clé reste sur ce poste (réglages du moteur) ;
  // les plugins qui ont la permission « ia » demandent à l'IA, sans jamais voir la clé.
  import { configIa, enregistrerConfigIa, MODELE_DEFAUT, MODELES, tester } from "$lib/ia";

  const depart = configIa();
  let cle = $state("");
  let modele = $state(depart.modele);
  let enregistree = $state(depart.cle !== "");
  let message = $state("");
  let reussi = $state(false);
  let occupe = $state(false);

  /** Une nouvelle clé saisie, sinon celle déjà enregistrée. */
  const cleEffective = (): string => (cle.trim() !== "" ? cle.trim() : depart.cle || configIa().cle);

  function enregistrer(): void {
    enregistrerConfigIa({ fournisseur: "gemini", cle: cleEffective(), modele });
    const apres = configIa();
    enregistree = apres.cle !== "";
    cle = "";
    reussi = enregistree;
    message = enregistree ? "Enregistré sur ce poste." : "Cette clé est trop courte ou contient des espaces : collez-la telle quelle, sans rien autour.";
  }

  async function essayer(): Promise<void> {
    occupe = true;
    message = "";
    const brut = cleEffective();
    const resultat = await tester({ fournisseur: "gemini", cle: brut, modele });
    occupe = false;
    reussi = resultat.ok;
    message = resultat.ok ? "La clé fonctionne : le service a répondu." : resultat.message;
  }

  function retirer(): void {
    enregistrerConfigIa({ fournisseur: "gemini", cle: "", modele });
    enregistree = false;
    cle = "";
    reussi = false;
    message = "Clé retirée de ce poste.";
  }
</script>

<div class="box">
  <h3>Service : Gemini (Google)</h3>
  <p class="hint">
    Créez une clé gratuite sur <b>aistudio.google.com</b> (« Get API key »), collez-la ici, puis « Essayer ». Elle reste sur cet ordinateur.
  </p>
  <div class="champs">
    <label>
      Clé d'API
      <input class="text-input" type="password" bind:value={cle} placeholder={enregistree ? "Clé enregistrée (laissez vide pour la garder)" : "Collez votre clé"} autocomplete="off" spellcheck="false" />
    </label>
    <label>
      Modèle
      <input class="text-input" list="modeles-ia" bind:value={modele} placeholder={MODELE_DEFAUT} autocomplete="off" />
      <datalist id="modeles-ia">{#each MODELES as m (m.id)}<option value={m.id}>{m.nom}</option>{/each}</datalist>
    </label>
    <div class="buttons">
      <button class="btn primary" onclick={enregistrer}>Enregistrer</button>
      <button class="btn" onclick={essayer} disabled={occupe || (!enregistree && cle.trim() === "")}>{occupe ? "Essai…" : "Essayer"}</button>
      {#if enregistree}<button class="btn" onclick={retirer}>Retirer la clé</button>{/if}
    </div>
    {#if message}<p class:erreur={!reussi} class:ok={reussi} role="status">{message}</p>{/if}
  </div>
</div>

<div class="box">
  <h3>Ce qui est envoyé à Google</h3>
  <p class="hint">
    Quand vous lisez un ticket, la photo du ticket part chez Google pour être lue ; pour une liste de courses, c'est votre demande. Rien n'est envoyé
    sans que vous le demandiez. Avec une clé gratuite, les conditions de Google permettent d'utiliser ces données pour améliorer ses produits :
    ne photographiez que ce que vous acceptez de partager (un ticket de courses, pas un document personnel).
  </p>
</div>

<style>
  .champs {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 420px;
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
  .ok {
    margin: 0;
    color: var(--ok);
    font-size: 13px;
  }
  .hint {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 13px;
  }
</style>