<script lang="ts">
  // Calendrier de l'Agenda (docs/24, section 7) : mois, jour, événements, chronologie à rebours, alertes de repos, export .ics.
  // L'écran est mince : tout le calcul est dans src/vue.ts et src/calculs.ts. Les écritures passent par src/operations.ts avec
  // l'utilisateur comme propriétaire. Un carnet illisible n'est JAMAIS remplacé par un carnet vide : l'écran le dit et n'écrit rien.
  import { connect } from "@etabli/sdk";
  import { Card, Field, Segmented, SelectField } from "@etabli/ui";
  import { ajouterJours, ajouterMois, instantVersLocal, parseHeure, premierDuMois, type Jour } from "@etabli/ui/civil";
  import { occurrences } from "../../src/calculs";
  import { rappelsPourLeMoteur } from "../../src/rappels";
  import { AVERTISSEMENT_OCTETS, lireBrouillon, lireCarnet, octetsDe } from "../../src/carnet";
  import { genererIcs } from "../../src/ics";
  import { ajouter, modifier, reglerHoraires, supprimer, type Contexte } from "../../src/operations";
  import { ErreurAgenda, UTILISATEUR, type Carnet, type Frequence, type TypeEvenement } from "../../src/types";
  import { COULEURS_TYPE, JOURS_COURTS, LIBELLES_TYPE, heure, libelleJour, libelleMois, vueJour, vueMois } from "../../src/vue";

  const ctx: Contexte = { appelant: UTILISATEUR, proprietaire: true };
  const aujourdhui = (): Jour => instantVersLocal(Date.now()).jour;

  let carnet = $state<Carnet | null>(null);
  let illisible = $state("");
  let host: Awaited<ReturnType<typeof connect<unknown>>> | undefined;
  let reference = $state<Jour>(aujourdhui());
  let choisi = $state<Jour>(aujourdhui());
  let message = $state("");

  function recevoir(donnees: unknown) {
    try {
      carnet = lireCarnet(donnees);
      illisible = "";
    } catch (e) {
      carnet = null;
      illisible = e instanceof ErreurAgenda ? e.message : "Carnet illisible.";
    }
  }

  void connect<unknown>().then((h) => {
    host = h;
    recevoir(h.settings.data);
    h.settings.onChange(recevoir);
    // À chaque ouverture, on renouvelle l'horizon de 60 jours des rappels (le moteur ne programme pas plus loin).
    if (carnet) void h.reminders.set(rappelsPourLeMoteur(carnet, Date.now()));
  });

  const mois = $derived(carnet ? vueMois(carnet, reference) : null);
  const jour = $derived(carnet ? vueJour(carnet, choisi) : []);
  const alertesDuJour = $derived(mois ? mois.alertes.filter((a) => a.jour === choisi) : []);

  function enregistrer(suivant: Carnet): boolean {
    if (!host) return false;
    host.settings.update(suivant);
    carnet = suivant;
    // Un événement avec trajet change « pars maintenant » et le coucher : la liste complète repart au téléphone (sans effet sur PC).
    void host.reminders.set(rappelsPourLeMoteur(suivant, Date.now()));
    return true;
  }

  function appliquer(travail: (c: Carnet) => Carnet): boolean {
    message = "";
    if (!carnet) return false;
    try {
      return enregistrer(travail(carnet));
    } catch (e) {
      message = e instanceof ErreurAgenda ? e.message : "Une erreur est survenue : rien n'a été enregistré.";
      return false;
    }
  }

  // — Formulaire d'événement —
  const TYPES = (Object.keys(LIBELLES_TYPE) as TypeEvenement[]).map((value) => ({ value, label: LIBELLES_TYPE[value] }));
  const REPETITIONS: { value: Frequence | "aucune"; label: string }[] = [
    { value: "aucune", label: "Ne se répète pas" },
    { value: "jour", label: "Chaque jour" },
    { value: "semaine", label: "Chaque semaine" },
    { value: "mois", label: "Chaque mois" },
  ];

  let edition = $state<string | null>(null); // identifiant en cours de modification, ou null pour un nouvel événement
  let ouvert = $state(false);
  let f = $state({ type: "travail" as TypeEvenement, titre: "", lieu: "", jour: aujourdhui(), debut: "08:00", fin: "16:00", trajet: "", repetition: "aucune" as Frequence | "aucune", jusquau: aujourdhui() });

  function nouveau() {
    edition = null;
    f = { type: "travail", titre: "", lieu: "", jour: choisi, debut: "08:00", fin: "16:00", trajet: "", repetition: "aucune", jusquau: ajouterMois(choisi, 1) };
    ouvert = true;
    message = "";
  }

  function modifierExistant(id: string) {
    const e = carnet?.evenements.find((x) => x.id === id);
    if (!e) return;
    edition = id;
    f = {
      type: e.type,
      titre: e.titre,
      lieu: e.lieu ?? "",
      jour: e.jour,
      debut: heure(e.debutMin),
      fin: heure(e.finMin),
      trajet: e.trajetMin === null ? "" : String(e.trajetMin),
      repetition: e.repetition?.frequence ?? "aucune",
      jusquau: e.repetition?.jusquau ?? ajouterMois(e.jour, 1),
    };
    ouvert = true;
    message = "";
  }

  function valider() {
    const debut = parseHeure(f.debut);
    const fin = parseHeure(f.fin);
    if (debut === null || fin === null) {
      message = "Les heures s'écrivent 08:00 ou 8h30.";
      return;
    }
    const trajet = f.trajet.trim() === "" ? undefined : Number(f.trajet);
    let brouillon;
    try {
      brouillon = lireBrouillon({
        type: f.type,
        titre: f.titre,
        lieu: f.lieu.trim() === "" ? undefined : f.lieu,
        jour: f.jour,
        debutMin: debut,
        finMin: fin,
        trajetMin: trajet,
        repetition: f.repetition === "aucune" ? undefined : { frequence: f.repetition, jusquau: f.jusquau },
      });
    } catch (e) {
      message = e instanceof ErreurAgenda ? e.message : "Événement invalide.";
      return;
    }
    const id = edition;
    if (appliquer((c) => (id ? modifier(c, id, brouillon, ctx).carnet : ajouter(c, brouillon, ctx).carnet))) {
      ouvert = false;
      choisi = brouillon.jour;
      reference = brouillon.jour;
    }
  }

  function retirer(id: string) {
    appliquer((c) => supprimer(c, id, ctx).carnet);
    ouvert = false;
  }

  // — Réglages de la chronologie —
  let r = $state({ margeArriveeMin: "", miseEnRouteMin: "", preparationMin: "", sommeilMin: "", endormissementMin: "", majorationPourcent: "" });
  $effect(() => {
    if (!carnet) return;
    const g = carnet.reglages;
    r = {
      margeArriveeMin: String(g.margeArriveeMin),
      miseEnRouteMin: String(g.miseEnRouteMin),
      preparationMin: String(g.preparationMin),
      sommeilMin: String(g.sommeilMin),
      endormissementMin: String(g.endormissementMin),
      majorationPourcent: String(g.majorationTrajetBp / 100),
    };
  });
  function enregistrerReglages() {
    appliquer((c) =>
      reglerHoraires(c, {
        // Les réglages des rappels (écran « Rappels ») sont conservés tels quels.
        ...c.reglages,
        margeArriveeMin: Number(r.margeArriveeMin),
        miseEnRouteMin: Number(r.miseEnRouteMin),
        preparationMin: Number(r.preparationMin),
        sommeilMin: Number(r.sommeilMin),
        endormissementMin: Number(r.endormissementMin),
        majorationTrajetBp: Math.round(Number(r.majorationPourcent) * 100),
      }),
    );
  }

  // — Export .ics : les 12 mois qui suivent le début du mois affiché —
  function exporter() {
    if (!host || !carnet) return;
    const du = premierDuMois(reference);
    const au = ajouterJours(ajouterMois(du, 12), -1);
    const contenu = genererIcs(occurrences(carnet.evenements, du, au), Date.now());
    host.saveFile({ name: `agenda-${du}.ics`, content: contenu, extension: "ics", description: "Calendrier iCalendar" });
  }

  const plein = $derived(carnet ? octetsDe(carnet) > AVERTISSEMENT_OCTETS : false);
</script>

<main>
  {#if illisible}
    <Card title="Agenda illisible">
      <p class="erreur">{illisible}</p>
      <p class="aide">Les données n'ont pas été touchées. Rien ne s'enregistre tant que le carnet ne peut pas être lu.</p>
    </Card>
  {:else if carnet && mois}
    <Card title={libelleMois(reference)}>
      {#snippet actions()}
        <button class="btn" onclick={() => (reference = ajouterMois(reference, -1))} aria-label="Mois précédent">‹</button>
        <button class="btn" onclick={() => { reference = aujourdhui(); choisi = aujourdhui(); }}>Aujourd'hui</button>
        <button class="btn" onclick={() => (reference = ajouterMois(reference, 1))} aria-label="Mois suivant">›</button>
      {/snippet}
      <div class="grille" role="grid" aria-label={`Calendrier de ${libelleMois(reference)}`}>
        {#each JOURS_COURTS as j (j)}<div class="entete">{j}</div>{/each}
        {#each mois.cases as c (c.jour)}
          <button
            class="case"
            class:hors={!c.dansLeMois}
            class:auj={c.jour === aujourdhui()}
            class:choisi={c.jour === choisi}
            onclick={() => (choisi = c.jour)}
            aria-label={`${libelleJour(c.jour)}, ${c.occurrences.length} événement${c.occurrences.length > 1 ? "s" : ""}`}
          >
            <span class="num">{Number(c.jour.slice(8))}</span>
            <span class="points">
              {#each c.occurrences.slice(0, 4) as o, i (i)}<i style={`background:${COULEURS_TYPE[o.type]}`}></i>{/each}
            </span>
          </button>
        {/each}
      </div>
      {#if plein}<p class="erreur">L'agenda approche de sa taille maximale : supprimez d'anciens événements.</p>{/if}
    </Card>

    {#if mois.alertes.length > 0}
      <Card title="Repos légal">
        <ul class="alertes">
          {#each mois.alertes as a, i (i)}
            <li><button class="lien" onclick={() => (choisi = a.jour)}>{libelleJour(a.jour)}</button> — {a.message}</li>
          {/each}
        </ul>
      </Card>
    {/if}

    <Card title={libelleJour(choisi)}>
      {#snippet actions()}<button class="btn primary" onclick={nouveau}>Ajouter</button>{/snippet}
      {#if alertesDuJour.length > 0}
        {#each alertesDuJour as a, i (i)}<p class="erreur">{a.message}</p>{/each}
      {/if}
      {#if jour.length === 0}
        <p class="aide">Rien de prévu ce jour-là.</p>
      {:else}
        <ul class="evenements">
          {#each jour as l (l.occurrence.evenementId)}
            <li>
              <span class="pastille" style={`background:${COULEURS_TYPE[l.occurrence.type]}`} title={LIBELLES_TYPE[l.occurrence.type]}></span>
              <div class="corps">
                <b>{l.occurrence.titre}</b>
                <small>
                  {heure(l.occurrence.debutMin)}–{heure(l.occurrence.finMin)}
                  {#if l.occurrence.lieu} · {l.occurrence.lieu}{/if}
                  {#if l.occurrence.source !== UTILISATEUR} · via {l.occurrence.source}{/if}
                </small>
                {#if l.chronologie}
                  <dl class="chrono" aria-label="Chronologie à rebours">
                    <div><dt>Coucher</dt><dd>{heure(l.chronologie.coucherMin)}</dd></div>
                    <div><dt>Réveil</dt><dd>{heure(l.chronologie.reveilMin)}</dd></div>
                    <div><dt>Départ</dt><dd>{heure(l.chronologie.decisionMin)}</dd></div>
                    <div><dt>Arrivée</dt><dd>{heure(l.chronologie.arriveeViseeMin)}</dd></div>
                  </dl>
                {/if}
              </div>
              <button class="btn" onclick={() => modifierExistant(l.occurrence.evenementId)}>Modifier</button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if message && !ouvert}<p class="erreur">{message}</p>{/if}
    </Card>

    {#if ouvert}
      <Card title={edition ? "Modifier l'événement" : "Nouvel événement"}>
        <div class="form">
          <SelectField label="Type" options={TYPES} bind:value={f.type} />
          <Field label="Titre" numeric={false} bind:value={f.titre} placeholder="Mission, rendez-vous…" />
          <Field label="Lieu" numeric={false} bind:value={f.lieu} placeholder="Facultatif" />
          <label class="date"><span>Jour</span><input type="date" bind:value={f.jour} /></label>
          <Field label="Début" numeric={false} bind:value={f.debut} placeholder="08:00" />
          <Field label="Fin" numeric={false} bind:value={f.fin} placeholder="16:00 (avant le début : passe minuit)" />
          <Field label="Trajet" unit="min" bind:value={f.trajet} placeholder="Facultatif" />
          <SelectField label="Répétition" options={REPETITIONS} bind:value={f.repetition} />
          {#if f.repetition !== "aucune"}
            <label class="date"><span>Jusqu'au</span><input type="date" bind:value={f.jusquau} /></label>
          {/if}
          {#if message}<p class="erreur">{message}</p>{/if}
          <div class="boutons">
            <button class="btn primary" onclick={valider}>Enregistrer</button>
            <button class="btn" onclick={() => (ouvert = false)}>Annuler</button>
            {#if edition}<button class="btn" onclick={() => retirer(edition!)}>Supprimer</button>{/if}
          </div>
        </div>
      </Card>
    {/if}

    <Card title="Chronologie à rebours">
      <p class="aide">Pour un événement avec trajet : coucher → réveil → départ, calculés depuis l'heure de début.</p>
      <div class="form ligne">
        <Field label="Marge à l'arrivée" unit="min" bind:value={r.margeArriveeMin} />
        <Field label="Mise en route" unit="min" bind:value={r.miseEnRouteMin} />
        <Field label="Préparation" unit="min" bind:value={r.preparationMin} />
        <Field label="Sommeil" unit="min" bind:value={r.sommeilMin} />
        <Field label="Endormissement" unit="min" bind:value={r.endormissementMin} />
        <Field label="Majoration du trajet" unit="%" bind:value={r.majorationPourcent} />
        <button class="btn" onclick={enregistrerReglages}>Enregistrer</button>
      </div>
    </Card>

    <Card title="Export">
      <p class="aide">Fichier .ics des 12 mois à partir de {libelleMois(reference)}, à ouvrir dans le calendrier du téléphone.</p>
      <button class="btn" onclick={exporter}>Exporter en .ics</button>
    </Card>
  {:else}
    <p class="aide">Chargement…</p>
  {/if}
</main>

<style>
  main { display: flex; flex-direction: column; gap: 12px; padding: 12px; max-width: 760px; margin-inline: auto; }
  .grille { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .entete { text-align: center; font-size: 12px; color: var(--text-muted, #7c8794); padding-block: 2px; }
  .case { display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 2px; min-height: 52px; padding: 4px 2px; border: 1px solid var(--border, #d5dae0); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; font: inherit; }
  .case.hors { opacity: 0.45; }
  .case.auj .num { font-weight: 700; text-decoration: underline; }
  .case.choisi { border-color: var(--accent, #7c3aed); box-shadow: inset 3px 0 0 var(--accent, #7c3aed); }
  .num { font-variant-numeric: tabular-nums; }
  .points { display: flex; gap: 3px; min-height: 8px; }
  .points i { width: 6px; height: 6px; border-radius: 50%; }
  .evenements { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .evenements li { display: flex; gap: 10px; align-items: flex-start; }
  .pastille { width: 10px; height: 10px; border-radius: 50%; margin-top: 6px; flex: none; }
  .corps { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  small { color: var(--text-muted, #7c8794); }
  .chrono { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 6px; margin: 6px 0 0; }
  .chrono div { display: flex; flex-direction: column; }
  .chrono dt { font-size: 12px; color: var(--text-muted, #7c8794); }
  .chrono dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 600; }
  .alertes { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
  .lien { background: none; border: 0; padding: 0; color: var(--accent, #7c3aed); cursor: pointer; font: inherit; text-decoration: underline; }
  .form { display: flex; flex-direction: column; gap: 10px; }
  .form.ligne { flex-direction: row; flex-wrap: wrap; align-items: flex-end; }
  .form.ligne > :global(*) { flex: 1 1 150px; min-width: 0; }
  .date { display: flex; flex-direction: column; gap: 4px; }
  .date span { font-size: 12px; color: var(--text-muted, #7c8794); }
  .boutons { display: flex; gap: 8px; flex-wrap: wrap; }
  .erreur { color: var(--danger, #c0392b); margin: 4px 0; }
  .aide { color: var(--text-muted, #7c8794); margin: 0 0 8px; }
</style>
