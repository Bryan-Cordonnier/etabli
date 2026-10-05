<script lang="ts">
  // Prévisions (docs/24, section 7) : ce qui est attendu (à la main ou posé par un autre plugin), les virements entre comptes, les
  // abonnements et les plafonds par catégorie. Les virements et abonnements produisent des prévisions ; la courbe lit ces prévisions.
  import { Card, Field, Segmented, SelectField } from "@etabli/ui";
  import { ajouterJours, jourDeSemaine } from "@etabli/ui/civil";
  import { formatEuros, parseEuros } from "@etabli/ui/money";
  import { ajouterPrevision, creerAbonnement, creerVirement, fixerEnveloppe, marquerAResilier, supprimerAbonnement, supprimerVirement } from "../../src/operations";
  import { lireBrouillonPrevision } from "../../src/plan";
  import { Session } from "../../src/session.svelte";
  import type { Periodicite } from "../../src/types";
  import { ErreurBudget } from "../../src/types";

  const s = new Session();
  void s.demarrer();

  const euros = (c: number) => formatEuros(c);
  const jourCourt = (j: string) => `${j.slice(8)}/${j.slice(5, 7)}`;
  const nomCompte = (id: string | null) => (id === null ? "compte à choisir" : (s.finances?.comptes.find((c) => c.id === id)?.nom ?? id));
  const nomCategorie = (id: string | null) => s.finances?.categories.find((c) => c.id === id)?.nom ?? "Sans catégorie";
  const choixComptes = $derived([{ value: "", label: "À choisir" }, ...(s.finances?.comptes.filter((c) => !c.archive).map((c) => ({ value: c.id, label: c.nom })) ?? [])]);
  const choixComptesFermes = $derived(choixComptes.filter((c) => c.value !== ""));
  const choixCategories = $derived([{ value: "", label: "Sans catégorie" }, ...(s.finances?.categories.map((c) => ({ value: c.id, label: c.nom })) ?? [])]);

  // — Ajout rapide d'une prévision —
  let pv = $state({ sens: "sortie" as "sortie" | "entree", montant: "", jour: s.aujourdhui, libelle: "", compteId: "", categorieId: "" });
  function ajouterUnePrevision() {
    s.message = "";
    const cents = parseEuros(pv.montant);
    if (cents === null || cents <= 0) {
      s.message = "Le montant s'écrit comme 12,50 (supérieur à zéro).";
      return;
    }
    try {
      const b = lireBrouillonPrevision({ montantCents: pv.sens === "sortie" ? -cents : cents, jour: pv.jour, libelle: pv.libelle, ...(pv.compteId ? { compteId: pv.compteId } : {}), ...(pv.categorieId ? { categorieId: pv.categorieId } : {}) });
      if (s.appliquer((p) => ajouterPrevision(p, b).plan)) pv = { ...pv, montant: "", libelle: "" };
    } catch (e) {
      s.message = e instanceof ErreurBudget ? e.message : "Prévision invalide.";
    }
  }

  const prochaines = $derived(
    (s.plan?.previsions ?? [])
      .filter((p) => p.statut === "attendue" && p.jour >= s.aujourdhui && p.jour <= ajouterJours(s.aujourdhui, 60))
      .sort((a, b) => (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : Number(a.id.slice(1)) - Number(b.id.slice(1)))),
  );

  // — Virements —
  const FREQ = [{ value: "unique", label: "Une fois" }, { value: "semaine", label: "Chaque semaine" }, { value: "mois", label: "Chaque mois" }];
  let vir = $state({ libelle: "", montant: "", source: "", cible: "", jour: s.aujourdhui, frequence: "unique" as "unique" | "semaine" | "mois", jusquau: ajouterJours(s.aujourdhui, 365) });
  function nouveauVirement() {
    s.message = "";
    const cents = parseEuros(vir.montant);
    if (cents === null || cents <= 0) {
      s.message = "Le montant s'écrit comme 250 ou 250,00 (supérieur à zéro).";
      return;
    }
    const brut = { libelle: vir.libelle, montantCents: cents, compteSourceId: vir.source, compteCibleId: vir.cible, jour: vir.jour, ...(vir.frequence === "unique" ? {} : { repetition: { frequence: vir.frequence, jusquau: vir.jusquau } }) };
    if (s.appliquer((p) => creerVirement(p, brut, s.aujourdhui).plan)) vir = { ...vir, libelle: "", montant: "" };
  }

  // — Abonnements —
  const PERIODES: { value: Periodicite; label: string }[] = [{ value: "semaine", label: "Chaque semaine" }, { value: "mois", label: "Chaque mois" }, { value: "an", label: "Chaque année" }];
  let abo = $state({ libelle: "", montant: "", periodicite: "mois" as Periodicite, jour: s.aujourdhui, compteId: "", categorieId: "" });
  function nouvelAbonnement() {
    s.message = "";
    const cents = parseEuros(abo.montant);
    if (cents === null || cents <= 0) {
      s.message = "Le montant s'écrit comme 9,99 (supérieur à zéro).";
      return;
    }
    const brut = { libelle: abo.libelle, montantCents: cents, periodicite: abo.periodicite, jour: abo.jour, ...(abo.compteId ? { compteId: abo.compteId } : {}), ...(abo.categorieId ? { categorieId: abo.categorieId } : {}) };
    if (s.appliquer((p) => creerAbonnement(p, brut, s.aujourdhui).plan)) abo = { ...abo, libelle: "", montant: "" };
  }

  // — Plafonds par catégorie —
  let env = $state({ categorieId: "", plafond: "" });
  function fixerPlafond() {
    s.message = "";
    if (!env.categorieId) {
      s.message = "Choisissez une catégorie.";
      return;
    }
    const cents = env.plafond.trim() === "" ? 0 : parseEuros(env.plafond);
    if (cents === null || cents < 0) {
      s.message = "Le plafond s'écrit comme 400 ou 400,00 ; vide pour le retirer.";
      return;
    }
    if (s.appliquer((p) => fixerEnveloppe(p, env.categorieId, cents))) env = { categorieId: "", plafond: "" };
  }
  const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const libelleRepetition = (v: { repetition: { frequence: string; jusquau: string } | null; jour: string }) =>
    v.repetition ? `${v.repetition.frequence === "mois" ? "chaque mois" : `chaque ${JOURS[jourDeSemaine(v.jour) - 1]}`} jusqu'au ${jourCourt(v.repetition.jusquau)}` : "une fois";
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
  {:else if s.plan && s.finances}
    <Card title="Nouvelle prévision">
      <div class="form">
        <Segmented label="Sens" options={[{ value: "sortie", label: "Dépense" }, { value: "entree", label: "Recette" }]} bind:value={pv.sens} />
        <Field label="Montant" numeric={false} unit="€" bind:value={pv.montant} placeholder="12,50" />
        <label class="date"><span>Jour</span><input type="date" bind:value={pv.jour} /></label>
        <Field label="Libellé" numeric={false} bind:value={pv.libelle} placeholder="Loyer, paie attendue…" />
        <SelectField label="Compte" options={choixComptes} bind:value={pv.compteId} />
        <SelectField label="Catégorie" options={choixCategories} bind:value={pv.categorieId} />
        <button class="btn primary" onclick={ajouterUnePrevision}>Ajouter</button>
      </div>
    </Card>

    <Card title="Les 60 prochains jours">
      {#if prochaines.length === 0}
        <p class="aide">Aucune prévision attendue.</p>
      {:else}
        <ul class="liste">
          {#each prochaines as p (p.id)}
            <li>
              <span class="corps">
                <b>{p.libelle}</b>
                <small>{jourCourt(p.jour)} · {nomCompte(p.compteId)}{p.source.plugin !== "@utilisateur" && p.source.plugin !== "@budget" ? ` · via ${p.source.plugin}` : ""}</small>
              </span>
              <span class="montant" class:sortie={p.montantCents < 0}>{euros(p.montantCents)}</span>
              <button class="btn" onclick={() => s.abandonnerPrevision(p.id)}>Abandonner</button>
            </li>
          {/each}
        </ul>
      {/if}
    </Card>

    <Card title="Virements entre comptes">
      {#if s.plan.virements.length > 0}
        <ul class="liste">
          {#each s.plan.virements as v (v.id)}
            <li>
              <span class="corps"><b>{v.libelle}</b><small>{nomCompte(v.compteSourceId)} → {nomCompte(v.compteCibleId)} · {jourCourt(v.jour)}, {libelleRepetition(v)}</small></span>
              <span class="montant">{euros(v.montantCents)}</span>
              <button class="btn" onclick={() => s.appliquer((p) => supprimerVirement(p, v.id))}>Supprimer</button>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="aide">Planifiez les dates pour que le compte bancaire colle à la réalité.</p>
      <div class="form">
        <Field label="Libellé" numeric={false} bind:value={vir.libelle} placeholder="Épargne mensuelle" />
        <Field label="Montant" numeric={false} unit="€" bind:value={vir.montant} placeholder="250" />
        <SelectField label="Depuis" options={choixComptesFermes} bind:value={vir.source} />
        <SelectField label="Vers" options={choixComptesFermes} bind:value={vir.cible} />
        <label class="date"><span>Premier jour</span><input type="date" bind:value={vir.jour} /></label>
        <SelectField label="Répétition" options={FREQ} bind:value={vir.frequence} />
        {#if vir.frequence !== "unique"}<label class="date"><span>Jusqu'au</span><input type="date" bind:value={vir.jusquau} /></label>{/if}
        <button class="btn" onclick={nouveauVirement}>Ajouter le virement</button>
      </div>
    </Card>

    <Card title="Abonnements">
      {#if s.plan.abonnements.length > 0}
        <ul class="liste">
          {#each s.plan.abonnements as a (a.id)}
            <li>
              <span class="corps"><b>{a.libelle}{a.aResilier ? " (à résilier)" : ""}</b><small>{PERIODES.find((x) => x.value === a.periodicite)?.label.toLowerCase()} depuis le {jourCourt(a.jour)} · {nomCompte(a.compteId)} · {nomCategorie(a.categorieId)}</small></span>
              <span class="montant sortie">{euros(-a.montantCents)}</span>
              <button class="btn" onclick={() => s.appliquer((p) => marquerAResilier(p, a.id, !a.aResilier))}>{a.aResilier ? "Garder" : "À résilier"}</button>
              <button class="btn" onclick={() => s.appliquer((p) => supprimerAbonnement(p, a.id))}>Supprimer</button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="form">
        <Field label="Libellé" numeric={false} bind:value={abo.libelle} placeholder="Forfait mobile" />
        <Field label="Montant" numeric={false} unit="€" bind:value={abo.montant} placeholder="9,99" />
        <SelectField label="Périodicité" options={PERIODES} bind:value={abo.periodicite} />
        <label class="date"><span>Première échéance</span><input type="date" bind:value={abo.jour} /></label>
        <SelectField label="Compte" options={choixComptes} bind:value={abo.compteId} />
        <SelectField label="Catégorie" options={choixCategories} bind:value={abo.categorieId} />
        <button class="btn" onclick={nouvelAbonnement}>Ajouter l'abonnement</button>
      </div>
    </Card>

    <Card title="Plafonds par catégorie">
      {#if s.plan.enveloppes.length > 0}
        <ul class="liste">
          {#each s.plan.enveloppes as e (e.categorieId)}
            <li>
              <span class="corps"><b>{nomCategorie(e.categorieId)}</b></span>
              <span class="montant">{euros(e.plafondCents)} par mois</span>
              <button class="btn" onclick={() => s.appliquer((p) => fixerEnveloppe(p, e.categorieId, null))}>Retirer</button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="form">
        <SelectField label="Catégorie" options={choixCategories.filter((c) => c.value !== "")} bind:value={env.categorieId} />
        <Field label="Plafond mensuel" numeric={false} unit="€" bind:value={env.plafond} placeholder="400" />
        <button class="btn" onclick={fixerPlafond}>Fixer</button>
      </div>
    </Card>
    {#if s.message}<p class="erreur">{s.message}</p>{/if}
  {:else}
    <p class="aide">Chargement…</p>
  {/if}
</main>

<style>
  main { display: flex; flex-direction: column; gap: 12px; padding: 12px; max-width: 760px; margin-inline: auto; }
  .liste { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .liste li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .corps { flex: 1 1 200px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  small { color: var(--text-muted, #7c8794); }
  .montant { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
  .montant.sortie { color: var(--danger, #c0392b); }
  .form { display: flex; flex-direction: column; gap: 10px; }
  .date { display: flex; flex-direction: column; gap: 4px; }
  .date span { font-size: 12px; color: var(--text-muted, #7c8794); }
  .erreur { color: var(--danger, #c0392b); }
  .aide { color: var(--text-muted, #7c8794); margin: 0 0 8px; }
</style>
