<script lang="ts">
  // « Combien j'aurai à telle date » (docs/24, section 7) : le solde réel d'aujourd'hui (lu dans Finances) puis les prévisions attendues,
  // les jours sous le seuil, les prévisions en retard, et le budget du mois par catégorie. Tout le calcul est dans src/calculs.ts.
  import { Card, Field, LineChart, Segmented } from "@etabli/ui";
  import { formatEuros, parseEuros } from "@etabli/ui/money";
  import { budgetDuMois, courbe } from "../../src/calculs";
  import { fixerSeuil } from "../../src/operations";
  import { Session } from "../../src/session.svelte";

  const s = new Session();
  void s.demarrer();

  let jours = $state("60");
  let seuil = $state("");
  let seuilInitialise = false;

  $effect(() => {
    if (s.plan && !seuilInitialise) {
      seuil = formatEuros(s.plan.seuilCents).replace(/\s*€$/, "");
      seuilInitialise = true;
    }
  });

  const euros = (c: number) => formatEuros(c);
  const vue = $derived(
    s.plan && s.finances ? courbe({ soldeCents: s.finances.soldeCents, aujourdhui: s.aujourdhui, jours: Number(jours), previsions: s.plan.previsions, seuilCents: s.plan.seuilCents }) : null,
  );
  const lignes = $derived(
    s.plan && s.finances ? budgetDuMois({ enveloppes: s.plan.enveloppes, reelsSorties: s.finances.sortiesDuMois, previsions: s.plan.previsions, aujourdhui: s.aujourdhui }) : [],
  );
  const nomCategorie = (id: string | null) => s.finances?.categories.find((c) => c.id === id)?.nom ?? "Sans catégorie";
  const nomCompte = (id: string | null) => (id === null ? "compte à choisir" : (s.finances?.comptes.find((c) => c.id === id)?.nom ?? id));
  const jourCourt = (j: string) => `${j.slice(8)}/${j.slice(5, 7)}`;

  function appliquerSeuil() {
    const cents = parseEuros(seuil);
    if (cents === null) {
      s.message = "Le seuil s'écrit comme 250 ou 250,00.";
      return;
    }
    s.appliquer((p) => fixerSeuil(p, cents));
  }
</script>

<main>
  {#if s.illisible}
    <Card title="Budget illisible">
      <p class="erreur">{s.illisible}</p>
      <p class="aide">Les données n'ont pas été touchées. Rien ne s'enregistre tant que le plan ne peut pas être lu.</p>
    </Card>
  {:else if s.indisponible}
    <Card title="Finances est nécessaire">
      <p class="erreur">{s.indisponible}</p>
      <button class="btn" onclick={() => s.recharger()}>Réessayer</button>
    </Card>
  {:else if s.plan && s.finances && vue}
    <Card title="Combien j'aurai">
      {#snippet actions()}
        <Segmented label="Durée" options={[{ value: "30", label: "30 j" }, { value: "60", label: "60 j" }, { value: "90", label: "90 j" }]} bind:value={jours} />
      {/snippet}
      <p class="gros" aria-label={`Solde actuel ${euros(s.finances.soldeCents)}`}>{euros(s.finances.soldeCents)} <small>aujourd'hui</small></p>
      <LineChart title={`Solde prévu sur ${jours} jours`} points={vue.serie.map((p) => ({ label: jourCourt(p.jour), value: p.soldeCents }))} format={euros} />
      <p class="aide">
        Point le plus bas : <b>{euros(vue.plancher.soldeCents)}</b> le {jourCourt(vue.plancher.jour)}.
        {#if vue.sousSeuil.length > 0}
          <span class="erreur">Sous le seuil de {euros(s.plan.seuilCents)} pendant {vue.sousSeuil.length} jour{vue.sousSeuil.length > 1 ? "s" : ""}, dès le {jourCourt(vue.sousSeuil[0]!.jour)} (il manque {euros(Math.max(...vue.sousSeuil.map((x) => x.ecartCents)))} au plus bas).</span>
        {/if}
      </p>
      <div class="form ligne">
        <Field label="Seuil à ne pas franchir" numeric={false} unit="€" bind:value={seuil} placeholder="0" />
        <button class="btn" onclick={appliquerSeuil}>Enregistrer</button>
      </div>
    </Card>

    {#if vue.enRetard.length > 0}
      <Card title={`En retard (${vue.enRetard.length})`}>
        <p class="aide">Ces prévisions sont passées sans être confirmées. Elles ne comptent pas dans la courbe tant que vous ne les avez pas traitées.</p>
        <ul class="liste">
          {#each vue.enRetard as p (p.id)}
            <li>
              <span class="corps"><b>{p.libelle}</b><small>{jourCourt(p.jour)} · {nomCompte(p.compteId)}</small></span>
              <span class="montant" class:sortie={p.montantCents < 0}>{euros(p.montantCents)}</span>
              <button class="btn" disabled={s.occupe} onclick={() => s.confirmerPrevision(p.id)} title="Ajoute l'écriture réelle dans Finances">Confirmer</button>
              <button class="btn" onclick={() => s.abandonnerPrevision(p.id)}>Abandonner</button>
            </li>
          {/each}
        </ul>
      </Card>
    {/if}

    <Card title="Budget du mois">
      {#if lignes.length === 0}
        <p class="aide">Aucun plafond. Fixez-en dans « Prévisions » pour suivre vos dépenses par catégorie.</p>
      {:else}
        <ul class="liste">
          {#each lignes as l (l.categorieId)}
            <li class="enveloppe">
              <span class="corps">
                <b>{nomCategorie(l.categorieId)}</b>
                <small>{euros(l.reelCents)} dépensé{l.prevuCents > 0 ? ` + ${euros(l.prevuCents)} prévu` : ""} sur {euros(l.plafondCents)}</small>
                <span class="barre" role="img" aria-label={`${Math.min(100, Math.round(((l.reelCents + l.prevuCents) / l.plafondCents) * 100))} % du plafond`}>
                  <i class:depasse={l.depasse} style={`width:${Math.min(100, ((l.reelCents + l.prevuCents) / l.plafondCents) * 100)}%`}></i>
                </span>
              </span>
              <span class="montant" class:sortie={l.depasse}>{l.depasse ? `dépasse de ${euros(-l.resteCents)}` : `reste ${euros(l.resteCents)}`}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </Card>
    {#if s.message}<p class="erreur">{s.message}</p>{/if}
  {:else}
    <p class="aide">Chargement…</p>
  {/if}
</main>

<style>
  main { display: flex; flex-direction: column; gap: 12px; padding: 12px; max-width: 760px; margin-inline: auto; }
  .gros { font-size: 28px; font-weight: 700; margin: 0 0 8px; font-variant-numeric: tabular-nums; }
  .gros small { font-size: 13px; font-weight: 400; color: var(--text-muted, #7c8794); }
  .liste { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .liste li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .corps { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  small { color: var(--text-muted, #7c8794); }
  .montant { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
  .montant.sortie { color: var(--danger, #c0392b); }
  .barre { display: block; height: 6px; border-radius: 3px; background: var(--border, #d5dae0); overflow: hidden; margin-top: 4px; }
  .barre i { display: block; height: 100%; background: var(--accent, #b45309); }
  .barre i.depasse { background: var(--danger, #c0392b); }
  .form.ligne { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
  .form.ligne > :global(*) { flex: 1 1 160px; min-width: 0; }
  .erreur { color: var(--danger, #c0392b); }
  .aide { color: var(--text-muted, #7c8794); margin: 4px 0 8px; }
</style>
