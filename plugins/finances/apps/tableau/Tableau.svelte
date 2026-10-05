<script lang="ts">
  // Tableau de bord de Finances (docs/24, section 7) : soldes, courbe du solde, dépenses du mois, dernières écritures, saisie rapide.
  // L'écran est mince : tout le calcul est dans src/tableau.ts et les écritures passent par le MÊME code que le service (src/service.ts),
  // avec l'utilisateur comme source. Le registre n'est jamais remplacé par un registre vide : s'il est illisible, l'écran le dit et n'écrit rien.
  import { connect } from "@etabli/sdk";
  import { Card, DonutChart, Field, LineChart, Segmented, SelectField } from "@etabli/ui";
  import { formatEuros, parseEuros } from "@etabli/ui/money";
  import { jourDeInstant } from "@etabli/ui/civil";
  import { LIMITE_OCTETS, lireRegistre } from "../../src/registre";
  import { executer } from "../../src/service";
  import { argumentsDeSaisie, jourCourt, pourcentageUtilise, vueTableau, type Saisie } from "../../src/tableau";
  import { ErreurFinances, TYPES_COMPTE, UTILISATEUR, type Registre, type TypeCompte } from "../../src/types";

  let registre = $state<Registre | null>(null);
  let illisible = $state("");
  let host: Awaited<ReturnType<typeof connect<unknown>>> | undefined;
  let maintenant = $state(Date.now());
  let jours = $state("90");
  let message = $state("");

  function recevoir(donnees: unknown) {
    try {
      registre = lireRegistre(donnees);
      illisible = "";
    } catch (e) {
      registre = null;
      illisible = e instanceof ErreurFinances ? e.message : "Registre illisible.";
    }
  }

  void connect<unknown>().then((h) => {
    host = h;
    recevoir(h.settings.data);
    h.settings.onChange(recevoir);
  });

  // Le tableau se met à jour à minuit passé sans qu'on touche à rien.
  $effect(() => {
    const t = setInterval(() => (maintenant = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  const vue = $derived(registre ? vueTableau(registre, maintenant, Number(jours)) : null);

  /** Une écriture de l'utilisateur : même code que le service, enregistrée en entier dans les réglages du plugin. */
  function appliquer(fonction: string, args: unknown): boolean {
    message = "";
    if (!host) return false;
    try {
      const r = executer(host.settings.data, fonction, args, UTILISATEUR, Date.now(), true);
      if (r.registre) {
        host.settings.update(r.registre);
        registre = r.registre;
      }
      return true;
    } catch (e) {
      message = e instanceof ErreurFinances ? e.message : "Une erreur est survenue : rien n'a été enregistré.";
      return false;
    }
  }

  const cle = () => `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  // — Premier compte et catégories —
  let nomCompte = $state("");
  let typeCompte = $state<TypeCompte>("courant");
  let soldeCompte = $state("0");
  const TYPES: Record<TypeCompte, string> = { courant: "Compte courant", epargne: "Épargne", especes: "Espèces", autre: "Autre" };

  function creerCompte() {
    const cents = parseEuros(soldeCompte);
    if (cents === null) return void (message = "Solde illisible : écrivez par exemple 1250,00.");
    if (appliquer("comptes.creer", { nom: nomCompte, type: typeCompte, soldeInitialCents: cents, cle: cle() })) {
      nomCompte = "";
      soldeCompte = "0";
    }
  }

  let nomCategorie = $state("");
  let sensCategorie = $state<"sortie" | "entree">("sortie");
  function creerCategorie() {
    if (appliquer("categories.creer", { nom: nomCategorie, sens: sensCategorie, cle: cle() })) nomCategorie = "";
  }

  // — Saisie rapide —
  let saisie = $state<Saisie>({ compteId: "", sens: "sortie", montant: "", jour: jourDeInstant(Date.now()), categorieId: "", libelle: "" });
  const comptesActifs = $derived((registre?.comptes ?? []).filter((c) => !c.archive));
  const choixComptes = $derived(comptesActifs.map((c) => ({ value: c.id, label: c.nom })));
  const choixCategories = $derived([
    { value: "", label: "Sans catégorie" },
    ...(registre?.categories ?? [])
      .filter((c) => c.sens === "les-deux" || (saisie.sens === "sortie" ? c.sens === "sortie" : c.sens === "entree"))
      .map((c) => ({ value: c.id, label: c.nom })),
  ]);
  $effect(() => {
    if (!saisie.compteId && comptesActifs[0]) saisie.compteId = comptesActifs[0].id;
    if (!choixCategories.some((c) => c.value === saisie.categorieId)) saisie.categorieId = "";
  });

  function ajouter() {
    if (!registre) return;
    const r = argumentsDeSaisie(saisie, registre, Date.now(), cle());
    if ("erreur" in r) return void (message = r.erreur);
    if (appliquer("ecritures.ajouter", r.args)) {
      saisie.montant = "";
      saisie.libelle = "";
    }
  }

  function annuler(id: string) {
    appliquer("ecritures.annuler", { id, motif: "Annulée depuis le tableau de bord", cle: cle() });
  }

  const euros = (c: number) => formatEuros(c);
  const signe = (c: number) => formatEuros(c, { signe: "toujours" });
</script>

<div class="page">
  {#if illisible}
    <Card title="Registre illisible">
      <p class="erreur" role="alert">{illisible}</p>
    </Card>
  {:else if !vue || !registre}
    <p class="vide">Chargement…</p>
  {:else}
    {#if vue.presquePlein}
      <p class="alerte" role="status">
        Le registre est rempli à {pourcentageUtilise(vue.octets)} % ({(vue.octets / 1e6).toFixed(1)} Mo sur {(LIMITE_OCTETS / 1e6).toFixed(1)} Mo). Au-delà,
        les nouvelles écritures seront refusées : pensez à exporter puis à clôturer les anciennes années (pas encore disponible dans cette version).
      </p>
    {/if}
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}

    {#if registre.comptes.length === 0}
      <Card title="Premier compte">
        <p class="aide">Finances retient l'argent réel : créez un compte (par exemple votre compte courant) avec son solde d'aujourd'hui.</p>
        <div class="form">
          <Field label="Nom du compte" numeric={false} bind:value={nomCompte} placeholder="Compte courant" />
          <SelectField label="Type" options={TYPES_COMPTE.map((t) => ({ value: t, label: TYPES[t] }))} bind:value={typeCompte} />
          <Field label="Solde actuel" numeric={false} unit="€" bind:value={soldeCompte} />
          <button class="btn primary" onclick={creerCompte}>Créer le compte</button>
        </div>
      </Card>
    {:else}
      <div class="haut">
        <Card title="Solde total">
          <div class="total" aria-label={`Solde total ${euros(vue.soldeTotal)}`}>{euros(vue.soldeTotal)}</div>
          <ul class="comptes">
            {#each vue.comptes as c (c.compte.id)}
              <li><span>{c.compte.nom}</span><span class="montant">{euros(c.soldeCents)}</span></li>
            {/each}
          </ul>
        </Card>
        <Card title="Courbe du solde">
          {#snippet actions()}
            <Segmented
              label="Période"
              options={[{ value: "30", label: "30 j" }, { value: "90", label: "90 j" }, { value: "365", label: "1 an" }]}
              bind:value={jours}
            />
          {/snippet}
          <LineChart
            title={`Solde total des ${jours} derniers jours`}
            points={vue.serie.map((p) => ({ label: jourCourt(p.jour), value: p.soldeCents }))}
            format={euros}
          />
        </Card>
      </div>

      <div class="milieu">
        <Card title="Dépenses du mois">
          {#if vue.depensesMois.length === 0}
            <p class="vide">Aucune dépense ce mois-ci.</p>
          {:else}
            <DonutChart
              title="Dépenses du mois par catégorie"
              parts={vue.depensesMois.map((d) => ({ label: d.nom, value: d.cents }))}
              format={euros}
              centre="dépensé"
            />
          {/if}
        </Card>
        <Card title="Saisie rapide">
          <div class="form">
            <SelectField label="Compte" options={choixComptes} bind:value={saisie.compteId} />
            <Segmented label="Sens" options={[{ value: "sortie", label: "Dépense" }, { value: "entree", label: "Recette" }]} bind:value={saisie.sens} />
            <Field label="Montant" numeric={false} unit="€" bind:value={saisie.montant} placeholder="12,50" />
            <label class="date">
              <span>Jour</span>
              <input type="date" bind:value={saisie.jour} max={vue.aujourdhui} />
            </label>
            <SelectField label="Catégorie" options={choixCategories} bind:value={saisie.categorieId} />
            <Field label="Libellé" numeric={false} bind:value={saisie.libelle} placeholder="Courses" />
            <button class="btn primary" onclick={ajouter}>Ajouter</button>
          </div>
        </Card>
      </div>

      <Card title="Dernières écritures">
        {#if vue.dernieres.length === 0}
          <p class="vide">Aucune écriture pour l'instant.</p>
        {:else}
          <table>
            <thead><tr><th>Jour</th><th>Libellé</th><th>Compte</th><th class="d">Montant</th><th></th></tr></thead>
            <tbody>
              {#each vue.dernieres as l (l.ecriture.id)}
                <tr class:annulee={l.annulee}>
                  <td>{jourCourt(l.ecriture.jour)}</td>
                  <td>
                    {l.ecriture.libelle}
                    {#if l.categorie}<small>{l.categorie}</small>{/if}
                    {#if l.annulee}<small>annulée</small>{/if}
                    {#if l.ecriture.source !== UTILISATEUR}<small>via {l.ecriture.source}</small>{/if}
                  </td>
                  <td>{l.compte}</td>
                  <td class="d montant">{signe(l.ecriture.montantCents)}</td>
                  <td class="d">{#if l.annulable}<button class="btn" onclick={() => annuler(l.ecriture.id)} title="Ajoute une écriture inverse : rien n'est supprimé">Annuler</button>{/if}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </Card>

      <Card title="Catégories">
        <p class="aide">
          {registre.categories.length === 0 ? "Aucune catégorie : sans elles, le graphique des dépenses regroupe tout en « Sans catégorie »." : registre.categories.map((c) => c.nom).join(", ")}
        </p>
        <div class="form ligne">
          <Field label="Nouvelle catégorie" numeric={false} bind:value={nomCategorie} placeholder="Courses" />
          <Segmented label="Sens" options={[{ value: "sortie", label: "Dépense" }, { value: "entree", label: "Recette" }]} bind:value={sensCategorie} />
          <button class="btn" onclick={creerCategorie}>Ajouter</button>
        </div>
      </Card>
    {/if}
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
  .haut, .milieu { display: grid; grid-template-columns: minmax(240px, 320px) 1fr; gap: 16px; align-items: start; }
  .milieu { grid-template-columns: 1fr minmax(260px, 340px); }
  @media (max-width: 720px) { .haut, .milieu { grid-template-columns: 1fr; } }
  .total { font-size: 28px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
  .comptes { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .comptes li { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--muted); }
  .montant { font-variant-numeric: tabular-nums; color: var(--text); white-space: nowrap; }
  .form { display: flex; flex-direction: column; gap: 10px; }
  .form.ligne { flex-direction: row; flex-wrap: wrap; align-items: flex-end; }
  .date { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  .date input { padding: 7px 8px; border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--field); color: var(--text); font: inherit; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-weight: 500; font-size: 11px; color: var(--faint); padding: 4px 6px; }
  td { padding: 7px 6px; border-top: 1px solid var(--border); color: var(--text); vertical-align: top; }
  .d { text-align: right; }
  small { display: inline-block; margin-left: 6px; font-size: 11px; color: var(--muted); }
  tr.annulee td { color: var(--faint); text-decoration: line-through; }
  .vide, .aide { margin: 0; font-size: 12.5px; color: var(--faint); }
  .erreur { margin: 0; padding: 8px 12px; border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: var(--r-sm); background: var(--surface); color: var(--text); font-size: 12.5px; }
  .alerte { margin: 0; padding: 8px 12px; border-radius: var(--r-sm); background: var(--accent-soft); color: var(--accent-text); font-size: 12.5px; }
</style>
