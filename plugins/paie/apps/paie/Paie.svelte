<script lang="ts">
  // Paie (docs/24, section 7) : programmer sa paie. Dit COMBIEN on sera payé et QUAND ; c'est Budget qui estime ce qui reste.
  // Tous les montants sont des ESTIMATIONS : les taux sont des réglages à confirmer sur un vrai bulletin. Le calcul est dans
  // src/calculs.ts ; l'écran est mince. Sans Budget, Finances ni Agenda, tout fonctionne : ce qui n'a pas pu partir est « en attente ».
  import { Card, Check, Field, Segmented, SelectField } from "@etabli/ui";
  import { ajouterJours, jourDeInstant, parseHeure } from "@etabli/ui/civil";
  import { formatEuros, formatTaux, parseEuros, parseTaux } from "@etabli/ui/money";
  import { detailMission, detailReserve, joursDeMission, paiesContrat } from "../../src/calculs";
  import { ajouterContrat, ajouterMission, ajouterReserve, lireMission, regler, supprimerContrat, supprimerMission, supprimerReserve } from "../../src/donnees";
  import { Session } from "../../src/session.svelte";
  import { ErreurPaie, type Mission, type Reglages } from "../../src/types";

  const s = new Session();
  void s.demarrer();

  type Onglet = "interim" | "reserve" | "contrats" | "reglages";
  let onglet = $state<Onglet>("interim");
  const euros = (c: number) => formatEuros(c);
  const jourCourt = (j: string) => `${j.slice(8)}/${j.slice(5, 7)}`;
  const aujourdhui = () => jourDeInstant(Date.now());
  const JOURS = [["1", "L"], ["2", "M"], ["3", "M"], ["4", "J"], ["5", "V"], ["6", "S"], ["7", "D"]] as const;
  const choixComptes = $derived([{ value: "", label: "Ne pas ajouter dans Finances" }, ...s.comptes.map((c) => ({ value: c.id, label: c.nom }))]);

  // — Mission d'intérim —
  let mi = $state({ libelle: "", debut: aujourdhui(), fin: ajouterJours(aujourdhui(), 4), jours: [true, true, true, true, true, false, false], debutH: "08:00", finH: "15:00", pause: "0", taux: "", statut: "prevu" as Mission["statut"] });
  /** La mission décrite par le formulaire, ou le message qui dit quoi corriger. */
  const missionSaisie = $derived.by(() => {
    const debutMin = parseHeure(mi.debutH);
    const finMin = parseHeure(mi.finH);
    const taux = parseEuros(mi.taux);
    if (debutMin === null || finMin === null) return { erreur: "Les heures s'écrivent 08:00 ou 8h30." };
    if (taux === null || taux <= 0) return { erreur: "Le taux horaire s'écrit comme 13 ou 13,50." };
    try {
      const m = lireMission({ libelle: mi.libelle || "Mission", debut: mi.debut, fin: mi.fin, joursSemaine: mi.jours.flatMap((o, i) => (o ? [i + 1] : [])), debutMin, finMin, pauseMin: Number(mi.pause) || 0, tauxHoraireCents: taux, statut: mi.statut }, false);
      return { brut: m };
    } catch (e) {
      return { erreur: e instanceof ErreurPaie ? e.message : "Mission invalide." };
    }
  });
  const apercu = $derived(s.donnees && missionSaisie.brut ? detailMission({ id: "m0", ...missionSaisie.brut } as Mission, s.donnees.reglages) : null);
  function nouvelleMission() {
    if (!missionSaisie.brut) {
      s.message = missionSaisie.erreur ?? "";
      return;
    }
    const brut = missionSaisie.brut;
    if (s.appliquer((d) => ajouterMission(d, brut).donnees)) mi = { ...mi, libelle: "" };
  }

  // — Net reçu —
  let recu = $state<{ ref: string; montant: string; jour: string; compteId: string } | null>(null);
  function ouvrirRecu(ref: string, net: number) {
    recu = { ref, montant: formatEuros(net).replace(/\s*€$/, ""), jour: aujourdhui(), compteId: "" };
  }
  async function validerRecu(libelle: string, jourPrevu: string | null) {
    if (!recu) return;
    const cents = parseEuros(recu.montant);
    if (cents === null || cents <= 0) {
      s.message = "Le net s'écrit comme 429,43 (supérieur à zéro).";
      return;
    }
    await s.netRecu({ ref: recu.ref, netCents: cents, jour: recu.jour, compteId: recu.compteId || null, libelle: `${libelle} (net reçu)`, jourPrevu });
    recu = null;
  }

  // — Réserve —
  let re = $state({ libelle: "Réserve", jour: aujourdhui(), jours: [] as string[], horsBase: "0" });
  function ajouterJourReserve() {
    if (!re.jours.includes(re.jour)) re.jours = [...re.jours, re.jour].sort();
  }
  function nouvelleReserve() {
    const brut = { libelle: re.libelle, jours: re.jours, horsBase: Number(re.horsBase) || 0 };
    if (s.appliquer((d) => ajouterReserve(d, brut).donnees)) re = { ...re, jours: [], horsBase: "0" };
  }

  // — Contrats —
  let co = $state({ libelle: "", type: "cdi" as "cdi" | "cdd", brut: "", debut: aujourdhui(), fin: ajouterJours(aujourdhui(), 180), jourDePaie: "28" });
  function nouveauContrat() {
    const brut = parseEuros(co.brut);
    if (brut === null || brut <= 0) {
      s.message = "Le brut mensuel s'écrit comme 2 000 ou 2000,00.";
      return;
    }
    const donnees = { libelle: co.libelle || "Contrat", type: co.type, brutMensuelCents: brut, debut: co.debut, jourDePaie: Number(co.jourDePaie) || 28, ...(co.type === "cdd" ? { fin: co.fin } : {}) };
    if (s.appliquer((d) => ajouterContrat(d, donnees).donnees)) co = { ...co, libelle: "", brut: "" };
  }

  // — Réglages —
  const CHAMPS: { cle: keyof Reglages; label: string; genre: "taux" | "minutes" | "jours" | "euros"; aide?: string }[] = [
    { cle: "cotisationsBp", label: "Cotisations salariales", genre: "taux", aide: "Hypothèse 22 % : à confirmer sur un bulletin." },
    { cle: "ifmBp", label: "Indemnité de fin de mission (IFM)", genre: "taux" },
    { cle: "cpBp", label: "Congés payés (intérim)", genre: "taux" },
    { cle: "seuilSemaineMin", label: "Heures normales par semaine", genre: "minutes", aide: "En minutes : 2100 = 35 h." },
    { cle: "majorationSup1Bp", label: "Majoration, 1res heures supplémentaires", genre: "taux" },
    { cle: "seuilSup1Min", label: "Durée de la 1re majoration par semaine", genre: "minutes", aide: "En minutes : 480 = 8 h." },
    { cle: "majorationSup2Bp", label: "Majoration, heures suivantes", genre: "taux" },
    { cle: "delaiPaieJours", label: "Délai de paiement après la fin", genre: "jours" },
    { cle: "tarifReserveCents", label: "Tarif d'un jour de réserve (brut)", genre: "euros", aide: "À régler : sans tarif, seuls les jours hors base rapportent." },
    { cle: "indemniteHorsBaseCents", label: "Indemnité d'un jour hors base", genre: "euros", aide: "Hypothèse 38 € : à confirmer." },
    { cle: "precariteBp", label: "CDD : prime de précarité", genre: "taux" },
    { cle: "cpCddBp", label: "CDD : congés payés", genre: "taux" },
  ];
  let saisie = $state<Record<string, string>>({});
  $effect(() => {
    if (!s.donnees) return;
    const r = s.donnees.reglages;
    saisie = Object.fromEntries(CHAMPS.map((c) => [c.cle, c.genre === "taux" ? formatTaux(r[c.cle]).replace(/\s*%$/, "") : c.genre === "euros" ? formatEuros(r[c.cle]).replace(/\s*€$/, "") : String(r[c.cle])]));
  });
  function enregistrerReglages() {
    const r = { ...(s.donnees?.reglages as Reglages) };
    for (const c of CHAMPS) {
      const v = c.genre === "taux" ? parseTaux(saisie[c.cle] ?? "") : c.genre === "euros" ? parseEuros(saisie[c.cle] ?? "") : Number(saisie[c.cle]);
      if (v === null || Number.isNaN(v)) {
        s.message = `« ${c.label} » : valeur illisible.`;
        return;
      }
      r[c.cle] = v;
    }
    s.appliquer((d) => regler(d, r));
  }
</script>

<main>
  {#if s.illisible}
    <Card title="Paie illisible">
      <p class="erreur">{s.illisible}</p>
      <p class="aide">Les données n'ont pas été touchées. Rien ne s'enregistre tant qu'elles ne peuvent pas être lues.</p>
    </Card>
  {:else if s.donnees}
    <Card title="Paie">
      {#snippet actions()}
        <Segmented label="Rubrique" options={[{ value: "interim", label: "Intérim" }, { value: "reserve", label: "Réserve" }, { value: "contrats", label: "Contrats" }, { value: "reglages", label: "Taux" }]} bind:value={onglet} />
      {/snippet}
      <p class="aide">Estimations : les taux sont des réglages à confirmer sur un vrai bulletin.</p>
      {#if s.rapport}
        <p class="aide">
          Transmis à Budget et à l'Agenda : {s.transmises.a} sur {s.transmises.sur}.
          {#each s.rapport.indisponibles as i (i.service)}<br /><span class="avert">{i.message}</span>{/each}
          {#each s.rapport.erreurs as e (e.ref + e.service)}<br /><span class="erreur">{e.ref} : {e.message}</span>{/each}
        </p>
      {/if}
    </Card>

    {#if onglet === "interim"}
      <Card title="Missions d'intérim">
        {#if s.donnees.missions.length === 0}<p class="aide">Aucune mission.</p>{/if}
        <ul class="liste">
          {#each s.donnees.missions as m (m.id)}
            {@const d = detailMission(m, s.donnees.reglages)}
            {@const ref = `mission:${m.id}`}
            {@const bulletin = s.donnees.bulletins[ref]}
            <li>
              <span class="corps">
                <b>{m.libelle}</b>
                <small>{jourCourt(m.debut)} → {jourCourt(m.fin)} · {joursDeMission(m).length} jours · {m.statut === "confirme" ? "confirmée" : "prévue"}{d.datePaiement ? ` · paie le ${jourCourt(d.datePaiement)}` : ""}</small>
                {#if bulletin}<small class="ok">Reçu : {euros(bulletin.netCents)} le {jourCourt(bulletin.jour)}</small>{/if}
              </span>
              <span class="montant" title="Net estimé">{euros(d.netCents)}</span>
              {#if !bulletin && d.netCents > 0}<button class="btn" onclick={() => ouvrirRecu(ref, d.netCents)}>Net reçu</button>{/if}
              <button class="btn" onclick={() => s.appliquer((x) => supprimerMission(x, m.id))}>Supprimer</button>
            </li>
            {#if recu && recu.ref === ref}
              <li class="recu">
                <Field label="Net reçu" numeric={false} unit="€" bind:value={recu.montant} />
                <label class="date"><span>Jour</span><input type="date" bind:value={recu.jour} /></label>
                <SelectField label="Compte (Finances)" options={choixComptes} bind:value={recu.compteId} />
                <button class="btn primary" onclick={() => validerRecu(m.libelle, d.datePaiement)}>Valider</button>
                <button class="btn" onclick={() => (recu = null)}>Annuler</button>
              </li>
            {/if}
          {/each}
        </ul>
      </Card>

      <Card title="Nouvelle mission">
        <div class="form">
          <Field label="Libellé" numeric={false} bind:value={mi.libelle} placeholder="Mission Dupont" />
          <label class="date"><span>Du</span><input type="date" bind:value={mi.debut} /></label>
          <label class="date"><span>Au</span><input type="date" bind:value={mi.fin} /></label>
          <div class="jours" role="group" aria-label="Jours travaillés">
            {#each JOURS as [n, l], i (n)}<Check label={l} bind:checked={mi.jours[i]!} />{/each}
          </div>
          <Field label="Début" numeric={false} bind:value={mi.debutH} placeholder="08:00" />
          <Field label="Fin" numeric={false} bind:value={mi.finH} placeholder="15:00 (avant le début : passe minuit)" />
          <Field label="Pause" unit="min" bind:value={mi.pause} />
          <Field label="Taux horaire brut" numeric={false} unit="€" bind:value={mi.taux} placeholder="13" />
          <Segmented label="Statut" options={[{ value: "prevu", label: "Prévue" }, { value: "confirme", label: "Confirmée" }]} bind:value={mi.statut} />
          {#if apercu && s.donnees}
            <p class="apercu" aria-live="polite">
              Net estimé <b>{euros(apercu.netCents)}</b>
              <small>(brut {euros(apercu.brutTotalCents)}, dont IFM {euros(apercu.ifmCents)} et congés {euros(apercu.cpCents)}{apercu.datePaiement ? `, paie le ${jourCourt(apercu.datePaiement)}` : ""})</small>
            </p>
          {:else if missionSaisie.erreur}<p class="aide">{missionSaisie.erreur}</p>{/if}
          <button class="btn primary" onclick={nouvelleMission}>Ajouter la mission</button>
        </div>
      </Card>
    {/if}

    {#if onglet === "reserve"}
      <Card title="Réserve">
        {#if s.donnees.reglages.tarifReserveCents === 0}<p class="avert">Aucun tarif de jour de réserve n'est réglé (rubrique Taux) : seuls les jours hors base rapportent.</p>{/if}
        <ul class="liste">
          {#each s.donnees.reserves as r (r.id)}
            {@const d = detailReserve(r, s.donnees.reglages)}
            {@const ref = `reserve:${r.id}`}
            {@const bulletin = s.donnees.bulletins[ref]}
            <li>
              <span class="corps">
                <b>{r.libelle}</b>
                <small>{r.jours.length} jour{r.jours.length > 1 ? "s" : ""} + {r.horsBase} hors base{d.datePaiement ? ` · paie le ${jourCourt(d.datePaiement)}` : ""}</small>
                {#if bulletin}<small class="ok">Reçu : {euros(bulletin.netCents)} le {jourCourt(bulletin.jour)}</small>{/if}
              </span>
              <span class="montant">{euros(d.netCents)}</span>
              {#if !bulletin && d.netCents > 0}<button class="btn" onclick={() => ouvrirRecu(ref, d.netCents)}>Net reçu</button>{/if}
              <button class="btn" onclick={() => s.appliquer((x) => supprimerReserve(x, r.id))}>Supprimer</button>
            </li>
            {#if recu && recu.ref === ref}
              <li class="recu">
                <Field label="Net reçu" numeric={false} unit="€" bind:value={recu.montant} />
                <label class="date"><span>Jour</span><input type="date" bind:value={recu.jour} /></label>
                <SelectField label="Compte (Finances)" options={choixComptes} bind:value={recu.compteId} />
                <button class="btn primary" onclick={() => validerRecu(r.libelle, d.datePaiement)}>Valider</button>
                <button class="btn" onclick={() => (recu = null)}>Annuler</button>
              </li>
            {/if}
          {/each}
        </ul>
        <div class="form">
          <Field label="Libellé" numeric={false} bind:value={re.libelle} />
          <div class="form ligne">
            <label class="date"><span>Jour de réserve</span><input type="date" bind:value={re.jour} /></label>
            <button class="btn" onclick={ajouterJourReserve}>Ajouter ce jour</button>
          </div>
          <p class="aide">{re.jours.length === 0 ? "Aucun jour ajouté." : re.jours.map(jourCourt).join(", ")}</p>
          <Field label="Jours hors base" bind:value={re.horsBase} />
          <button class="btn primary" onclick={nouvelleReserve}>Ajouter la période</button>
        </div>
      </Card>
    {/if}

    {#if onglet === "contrats"}
      <Card title="Contrats CDI et CDD">
        <ul class="liste">
          {#each s.donnees.contrats as c (c.id)}
            {@const paies = paiesContrat(c, s.donnees.reglages, s.aujourdhui, ajouterJours(s.aujourdhui, 62))}
            <li>
              <span class="corps">
                <b>{c.libelle} ({c.type.toUpperCase()})</b>
                <small>{euros(c.brutMensuelCents)} brut par mois · depuis le {jourCourt(c.debut)}{c.fin ? ` jusqu'au ${jourCourt(c.fin)}` : ""}</small>
                {#each paies as p (p.datePaiement + p.libelle)}<small>{jourCourt(p.datePaiement)} : {euros(p.netCents)} net estimé</small>{/each}
              </span>
              <button class="btn" onclick={() => s.appliquer((x) => supprimerContrat(x, c.id))}>Supprimer</button>
            </li>
          {/each}
        </ul>
        <div class="form">
          <Field label="Libellé" numeric={false} bind:value={co.libelle} placeholder="Employeur" />
          <Segmented label="Type" options={[{ value: "cdi", label: "CDI" }, { value: "cdd", label: "CDD" }]} bind:value={co.type} />
          <Field label="Brut mensuel" numeric={false} unit="€" bind:value={co.brut} placeholder="2000" />
          <label class="date"><span>Début</span><input type="date" bind:value={co.debut} /></label>
          {#if co.type === "cdd"}<label class="date"><span>Fin</span><input type="date" bind:value={co.fin} /></label>{/if}
          <Field label="Jour de paie dans le mois" bind:value={co.jourDePaie} />
          <button class="btn primary" onclick={nouveauContrat}>Ajouter le contrat</button>
        </div>
      </Card>
    {/if}

    {#if onglet === "reglages"}
      <Card title="Taux et paramètres">
        <p class="aide">Rien n'est figé dans le code : changez ici ce que dit votre contrat ou votre bulletin. Vos paies déjà calculées se recalculent.</p>
        <div class="form">
          {#each CHAMPS as c (c.cle)}
            <div>
              <Field label={c.label} numeric={false} unit={c.genre === "taux" ? "%" : c.genre === "euros" ? "€" : c.genre === "jours" ? "jours" : "min"} bind:value={saisie[c.cle]!} />
              {#if c.aide}<small>{c.aide}</small>{/if}
            </div>
          {/each}
          <button class="btn primary" onclick={enregistrerReglages}>Enregistrer les taux</button>
        </div>
      </Card>
    {/if}
    {#if s.message}<p class="erreur">{s.message}</p>{/if}
  {:else}
    <p class="aide">Chargement…</p>
  {/if}
</main>

<style>
  main { display: flex; flex-direction: column; gap: 12px; padding: 12px; max-width: 760px; margin-inline: auto; }
  .liste { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .liste li { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .liste li.recu { flex-direction: column; align-items: stretch; padding: 10px; border: 1px solid var(--border, #d5dae0); border-radius: 6px; }
  .corps { flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  small { color: var(--text-muted, #7c8794); }
  .montant { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
  .form { display: flex; flex-direction: column; gap: 10px; }
  .form.ligne { flex-direction: row; align-items: flex-end; flex-wrap: wrap; }
  .jours { display: flex; gap: 10px; flex-wrap: wrap; }
  .date { display: flex; flex-direction: column; gap: 4px; }
  .date span { font-size: 12px; color: var(--text-muted, #7c8794); }
  .apercu { margin: 0; font-variant-numeric: tabular-nums; }
  .ok { color: var(--ok, #1f7a4d); }
  .avert { color: var(--warning, #b45309); }
  .erreur { color: var(--danger, #c0392b); }
  .aide { color: var(--text-muted, #7c8794); margin: 0 0 8px; }
</style>
