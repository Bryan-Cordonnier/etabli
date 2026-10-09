<script lang="ts">
  import { distribution } from "$lib/distribution";
  const nom = distribution.name;
  // Paramètres → Administration (administrateur du serveur seulement) : utilisateurs, plugins, journal, sauvegarde.
  import { api, clientServeur } from "$lib/api";
  import { phraseErreur } from "$lib/connexion";
  import { admin, type LigneJournal, type PluginServeur, type UtilisateurServeur } from "$lib/serveur/admin";
  import { ui } from "$lib/state/ui.svelte";

  type Onglet = "utilisateurs" | "plugins" | "journal" | "sauvegarde";
  const ONGLETS: { id: Onglet; label: string }[] = [
    { id: "utilisateurs", label: "Utilisateurs" },
    { id: "plugins", label: "Plugins" },
    { id: "journal", label: "Journal" },
    { id: "sauvegarde", label: "Sauvegarde" },
  ];

  const appels = clientServeur ? admin(clientServeur) : null;
  let onglet = $state<Onglet>("utilisateurs");

  let utilisateurs = $state<UtilisateurServeur[]>([]);
  let plugins = $state<PluginServeur[]>([]);
  let journal = $state<LigneJournal[]>([]);
  let chargement = $state(false);

  /** Exécute un appel et affiche l'erreur du serveur telle quelle (phrase en français). */
  async function essayer<T>(travail: () => Promise<T>, succes?: string): Promise<T | undefined> {
    try {
      const r = await travail();
      if (succes) ui.notify(succes);
      return r;
    } catch (e) {
      ui.notify(phraseErreur(e));
      return undefined;
    }
  }

  async function charger(): Promise<void> {
    if (!appels) return;
    chargement = true;
    if (onglet === "utilisateurs" || onglet === "plugins") utilisateurs = (await essayer(() => appels.utilisateurs())) ?? utilisateurs;
    if (onglet === "plugins") plugins = (await essayer(() => appels.plugins())) ?? plugins;
    if (onglet === "journal") journal = (await essayer(() => appels.journal(100))) ?? journal;
    chargement = false;
  }
  $effect(() => {
    void onglet;
    void charger();
  });

  const date = (ms: number | null) => (ms ? new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

  // ——— Utilisateurs ———
  let nouveauNom = $state("");
  let nouveauMdp = $state("");
  let reinitialisation = $state<{ id: string; mdp: string } | null>(null);
  let suppression = $state<{ id: string; nom: string; saisie: string } | null>(null);

  async function creer(event: Event): Promise<void> {
    event.preventDefault();
    if (!appels) return;
    if (await essayer(() => appels.creerUtilisateur(nouveauNom.trim(), nouveauMdp), `Compte « ${nouveauNom.trim()} » créé.`)) {
      nouveauNom = nouveauMdp = "";
      await charger();
    }
  }
  async function basculer(u: UtilisateurServeur): Promise<void> {
    if (appels && (await essayer(() => appels.modifierUtilisateur(u.id, { actif: !u.actif }), u.actif ? "Compte désactivé." : "Compte réactivé."))) await charger();
  }
  async function reinitialiser(): Promise<void> {
    if (!appels || !reinitialisation) return;
    const { id, mdp } = reinitialisation;
    if (await essayer(() => appels.modifierUtilisateur(id, { motDePasse: mdp }), "Mot de passe réinitialisé : ses sessions sont fermées.")) reinitialisation = null;
  }
  async function supprimer(): Promise<void> {
    if (!appels || !suppression) return;
    const { id, nom } = suppression;
    if (await essayer(() => appels.supprimerUtilisateur(id, nom), `Compte « ${nom} » supprimé avec ses données.`)) {
      suppression = null;
      await charger();
    }
  }

  // ——— Plugins ———
  let fichierPlugin = $state<HTMLInputElement>();
  async function installerPaquet(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const fichier = input.files?.[0];
    input.value = "";
    if (!fichier || !appels) return;
    const octets = new Uint8Array(await fichier.arrayBuffer());
    const r = await essayer(() => appels.installerPlugin(octets));
    if (r) {
      ui.notify(`Plugin « ${r.id} » ${r.version} installé.`);
      await charger();
    }
  }
  async function reglerAcces(p: PluginServeur, changement: { actifGlobal?: boolean; utilisateurs?: string[] }): Promise<void> {
    if (appels && (await essayer(() => appels.modifierPlugin(p.id, changement)))) await charger();
  }
  function basculerAcces(p: PluginServeur, id: string): void {
    const liste = p.utilisateurs.includes(id) ? p.utilisateurs.filter((x) => x !== id) : [...p.utilisateurs, id];
    void reglerAcces(p, { utilisateurs: liste });
  }
  let retraitPlugin = $state<string | null>(null);
  async function retirer(id: string): Promise<void> {
    if (appels && (await essayer(() => appels.supprimerPlugin(id), `Plugin « ${id} » retiré. Les calculs de chacun sont conservés.`))) {
      retraitPlugin = null;
      await charger();
    }
  }

  // ——— Sauvegarde ———
  async function sauvegarder(): Promise<void> {
    if (!appels) return;
    const blob = await essayer(() => appels.exporterBase());
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const lien = Object.assign(document.createElement("a"), { href: url, download: `etabli-${new Date().toISOString().slice(0, 10)}.sqlite` });
    lien.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

{#if !appels || api.id !== "serveur"}

{:else}
  <div class="onglets" role="tablist">
    {#each ONGLETS as o (o.id)}
      <button role="tab" aria-selected={onglet === o.id} class:on={onglet === o.id} onclick={() => (onglet = o.id)}>{o.label}</button>
    {/each}
  </div>

  {#if onglet === "utilisateurs"}
    <div class="box">
      <h3>Comptes</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Identifiant</th><th>Rôle</th><th>État</th><th>Dernière connexion</th><th></th></tr></thead>
          <tbody>
            {#each utilisateurs as u (u.id)}
              <tr>
                <td>{u.nom}</td>
                <td>{u.role === "admin" ? "administrateur" : "utilisateur"}</td>
                <td>{u.actif ? "actif" : "désactivé"}</td>
                <td>{date(u.derniereConnexion)}</td>
                <td class="actions">
                  {#if u.role !== "admin"}
                    <button class="btn" onclick={() => basculer(u)}>{u.actif ? "Désactiver" : "Réactiver"}</button>
                    <button class="btn" onclick={() => (reinitialisation = { id: u.id, mdp: "" })}>Mot de passe</button>
                    <button class="btn" onclick={() => (suppression = { id: u.id, nom: u.nom, saisie: "" })}>Supprimer</button>
                  {:else}
                    <button class="btn" onclick={() => (reinitialisation = { id: u.id, mdp: "" })}>Mot de passe</button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if reinitialisation}
        <form class="ligne" onsubmit={(e) => { e.preventDefault(); void reinitialiser(); }}>
          <input class="text-input" type="password" placeholder="Nouveau mot de passe (10 caractères au moins)" bind:value={reinitialisation.mdp} required />
          <button class="btn primary" type="submit">Réinitialiser</button>
          <button class="btn" type="button" onclick={() => (reinitialisation = null)}>Annuler</button>
        </form>
      {/if}
      {#if suppression}
        <form class="ligne" onsubmit={(e) => { e.preventDefault(); void supprimer(); }}>
          <span>Suppression définitive de « {suppression.nom} » et de tous ses calculs. Tapez son identifiant :</span>
          <input class="text-input" bind:value={suppression.saisie} />
          <button class="btn primary" type="submit" disabled={suppression.saisie.toLowerCase() !== suppression.nom.toLowerCase()}>Supprimer</button>
          <button class="btn" type="button" onclick={() => (suppression = null)}>Annuler</button>
        </form>
      {/if}
    </div>
    <div class="box">
      <h3>Nouveau compte</h3>
      <form class="ligne" onsubmit={creer}>
        <input class="text-input" placeholder="Identifiant" bind:value={nouveauNom} required />
        <input class="text-input" type="password" placeholder="Mot de passe initial" bind:value={nouveauMdp} autocomplete="new-password" required />
        <button class="btn primary" type="submit">Créer le compte</button>
      </form>
      <p class="hint">Donnez-lui son identifiant et ce mot de passe : il pourra le changer dans Paramètres → Serveur. Il n'y a qu'un administrateur.</p>
    </div>
  {:else if onglet === "plugins"}
    <div class="box">
      <h3>Plugins installés sur le serveur</h3>
      {#if plugins.length === 0}<p class="hint">Aucun plugin. Installez un paquet <code>.etapl</code> signé.</p>{/if}
      {#each plugins as p (p.id)}
        <div class="plugin">
          <div class="plugin-tete">
            <b>{p.manifest?.name ?? p.id}</b> <span class="hint">{p.id} · version {p.version}</span>
            <span class="espace"></span>
            {#if retraitPlugin === p.id}
              <button class="btn primary" onclick={() => retirer(p.id)}>Retirer définitivement</button>
              <button class="btn" onclick={() => (retraitPlugin = null)}>Annuler</button>
            {:else}
              <button class="btn" onclick={() => (retraitPlugin = p.id)}>Retirer</button>
            {/if}
          </div>
          <label class="case"><input type="checkbox" checked={p.actifGlobal} onchange={(e) => reglerAcces(p, { actifGlobal: e.currentTarget.checked })} /> Disponible pour tous les utilisateurs</label>
          {#if !p.actifGlobal}
            <div class="acces">
              <span class="hint">Seulement pour :</span>
              {#each utilisateurs as u (u.id)}
                <label class="case"><input type="checkbox" checked={p.utilisateurs.includes(u.id)} onchange={() => basculerAcces(p, u.id)} /> {u.nom}</label>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
      <div class="buttons">
        <button class="btn primary" onclick={() => fichierPlugin?.click()}>Installer un plugin (.etapl)…</button>
        <input bind:this={fichierPlugin} type="file" accept=".etapl,application/zip" hidden onchange={installerPaquet} />
      </div>

    </div>
  {:else if onglet === "journal"}
    <div class="box">
      <h3>Journal d'audit (100 dernières actions)</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Action</th><th>Cible</th><th>Détail</th></tr></thead>
          <tbody>
            {#each journal as l (l.id)}
              <tr><td>{date(l.horodatage)}</td><td>{l.action}</td><td>{l.cible ?? "—"}</td><td>{l.detail ?? ""}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {:else}
    <div class="box">
      <h3>Sauvegarde</h3>
      <p>Télécharge une copie cohérente de la base du serveur (tous les comptes et leurs calculs). À faire régulièrement.</p>
      <div class="buttons"><button class="btn primary" onclick={sauvegarder}>Télécharger une copie de la base</button></div>
      <p class="hint">La copie contient les données de tous les utilisateurs : rangez-la en lieu sûr.</p>
    </div>
  {/if}
  {#if chargement}<p class="hint">Chargement…</p>{/if}
{/if}

<style>
  .onglets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .onglets button {
    height: 34px;
    padding: 0 14px;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--muted);
    font-weight: 600;
  }
  .onglets button:hover {
    background: var(--field);
  }
  .onglets button.on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    color: var(--faint);
    font-weight: 600;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .actions .btn {
    min-height: 30px;
    padding: 0 10px;
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .text-input {
    min-width: 200px;
    flex: 1 1 200px;
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
  .plugin {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
  }
  .plugin-tete {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .espace {
    flex: 1;
  }
  .acces {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  .case {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  p {
    margin: 0;
  }
  code {
    font-family: var(--mono);
    font-size: 12px;
  }
</style>
