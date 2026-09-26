<script lang="ts">
  // Vitesse de rotation (cahier des charges des plugins, section 5.3). Le cas courant tient en une
  // saisie : le Ø du trou donne la vitesse théorique et sa plage mini-maxi (selon la machine).
  // Opération, matière, outil, avance et vitesses de la machine sont sous « Plus de paramètres ».
  import { Card, Field, MiniAppDocument, PluginSettings, Result, Segmented, SelectField, evaluate, format } from "@etabli/ui";
  import {
    CONSEIL_AVANCE,
    MATIERES_USINAGE,
    OPERATIONS,
    OUTILS,
    avance,
    avanceConseillee,
    rotation,
    temps,
    vcPlage,
    vitesseCoupe,
    vitesseMachine,
    type Operation,
    type Outil,
  } from "../../src/vitesse";

  interface Data {
    operation: Operation;
    outil: Outil;
    matiere: string;
    /** Vc saisie à la place de celle de la table (vide : valeur de la table). */
    vc: string;
    diametre: string;
    /** Avance par tour (perçage, tournage) ou par dent (fraisage) ; vide : valeur conseillée. */
    avance: string;
    dents: string;
    longueur: string;
  }

  /** Vitesses de la perceuse ou de la fraiseuse de l'atelier, communes à tous les calculs. */
  const reglages = new PluginSettings({ vitessesMachine: "" });

  const num = (text: string) => (text.trim() === "" ? NaN : evaluate(text));

  const doc = new MiniAppDocument<Data>(
    { operation: "percage", outil: "hss", matiere: "acier-doux", vc: "", diametre: "", avance: "", dents: "", longueur: "" },
    (d) => {
      const vc = d.vc.trim() === "" ? vcPlage(d.operation, d.outil, d.matiere).conseillee : num(d.vc);
      const n = rotation(vc, num(d.diametre));
      return Number.isFinite(n) && n > 0 ? `Ø ${format(num(d.diametre), 1)} · ${format(n, 0)} tr/min` : "";
    },
  );

  const DIAMETRE: Record<Operation, string> = { percage: "Ø du trou", fraisage: "Ø de la fraise", tournage: "Ø de la pièce" };
  const OUTIL: Record<Operation, string> = { percage: "foret", fraisage: "fraise", tournage: "outil" };

  let plus = $state(false);

  const plage = $derived(vcPlage(doc.data.operation, doc.data.outil, doc.data.matiere));
  const vcSaisie = $derived(num(doc.data.vc));
  const vc = $derived(doc.data.vc.trim() === "" ? plage.conseillee : vcSaisie);
  const d = $derived(num(doc.data.diametre));
  const n = $derived(vc > 0 && d > 0 ? rotation(vc, d) : NaN);
  const nMin = $derived(d > 0 ? rotation(plage.min, d) : NaN);
  const nMax = $derived(d > 0 ? rotation(plage.max, d) : NaN);
  const nMachine = $derived(vitesseMachine(reglages.data.vitessesMachine, n, nMin, nMax));
  const nUtile = $derived(Number.isFinite(nMachine) ? nMachine : n);
  const fraisage = $derived(doc.data.operation === "fraisage");
  const fConseil = $derived(avanceConseillee(doc.data.operation, doc.data.outil, doc.data.matiere, d > 0 ? d : 10));
  const f = $derived(doc.data.avance.trim() === "" ? fConseil : num(doc.data.avance));
  const dents = $derived(fraisage ? (doc.data.dents.trim() === "" ? 4 : Math.round(num(doc.data.dents))) : 1);
  const vf = $derived(Number.isFinite(nUtile) && f > 0 && dents > 0 ? avance(nUtile, f, dents) : NaN);
  const longueur = $derived(num(doc.data.longueur));
  const t = $derived(vf > 0 && longueur > 0 ? temps(longueur, vf) : NaN);

  const nomMatiere = $derived(MATIERES_USINAGE.find((m) => m.id === doc.data.matiere)?.nom ?? "");
  const nomOperation = $derived(OPERATIONS.find((o) => o.id === doc.data.operation)?.label ?? "");
  const nomOutil = $derived(`${OUTIL[doc.data.operation]} ${doc.data.outil === "hss" ? "HSS" : "carbure"}`);
</script>

<div class="split">
  <Card title={nomOperation}>
    <Field label={DIAMETRE[doc.data.operation]} unit="mm" bind:value={doc.data.diametre} />
    <p class="context">
      {nomMatiere} · {nomOutil} · Vc
      {#if doc.data.vc.trim() === ""}{format(plage.min, 0)} à {format(plage.max, 0)} m/min{:else}{format(vcSaisie, 1)} m/min (saisie){/if}
    </p>
    <button class="more" aria-expanded={plus} onclick={() => (plus = !plus)}>{plus ? "▾ Moins de paramètres" : "▸ Plus de paramètres"}</button>
    {#if plus}
      <div class="params">
        <Segmented label="Opération" options={OPERATIONS.map((o) => ({ value: o.id, label: o.label }))} bind:value={doc.data.operation} />
        <div class="two">
          <SelectField label="Matière usinée" options={MATIERES_USINAGE.map((m) => ({ value: m.id, label: m.nom }))} bind:value={doc.data.matiere} />
          <SelectField label="Outil" options={OUTILS.map((o) => ({ value: o.id, label: o.label }))} bind:value={doc.data.outil} />
        </div>
        <Field label="Vitesse de coupe Vc" unit="m/min" bind:value={doc.data.vc} placeholder={`${format(plage.conseillee, 0)} (table)`} />
        <div class:two={fraisage}>
          <Field
            label={fraisage ? "Avance par dent fz" : "Avance par tour f"}
            unit={fraisage ? "mm/dent" : "mm/tr"}
            bind:value={doc.data.avance}
            placeholder={`${format(fConseil, 2)} (conseillé)`}
          />
          {#if fraisage}<Field label="Nombre de dents Z" bind:value={doc.data.dents} placeholder="4" />{/if}
        </div>
        <Field label="Longueur usinée" unit="mm" bind:value={doc.data.longueur} placeholder="facultatif, pour le temps" />
        <Field label="Vitesses de la machine" numeric={false} unit="tr/min" bind:value={reglages.data.vitessesMachine} placeholder="ex. 180 280 450 710 1120" />
        <p class="hint">Vitesses de la perceuse ou de la fraiseuse, séparées par des espaces : gardées pour tous les calculs.</p>
      </div>
    {/if}
  </Card>

  <Card title="Vitesse de rotation">
    {#if Number.isFinite(n)}
      <Result label="Vitesse théorique" value={n} unit="tr/min" decimals={0} big oncopy={doc.copy} />
      <div class="grid">
        <Result label="Mini" value={nMin} unit="tr/min" decimals={0} oncopy={doc.copy} />
        <Result label="Maxi" value={nMax} unit="tr/min" decimals={0} oncopy={doc.copy} />
        {#if Number.isFinite(nMachine)}
          <Result label="À régler sur la machine" value={nMachine} unit="tr/min" decimals={0} oncopy={doc.copy} />
        {/if}
      </div>
      {#if Number.isFinite(nMachine) && (nMachine < nMin || nMachine > nMax)}
        <p class="warn">Aucune vitesse de la machine dans la plage : {format(nMachine, 0)} tr/min est la plus proche en dessous.</p>
      {/if}
      {#if plus}
        <div class="grid">
          {#if Number.isFinite(nMachine)}
            <Result label="Vc réelle à cette vitesse" value={vitesseCoupe(nMachine, d)} unit="m/min" decimals={1} oncopy={doc.copy} />
          {/if}
          <Result label="Vitesse d'avance Vf" value={vf} unit="mm/min" decimals={0} oncopy={doc.copy} />
          {#if Number.isFinite(t)}
            {#if t < 1}
              <Result label="Temps d'usinage" value={t * 60} unit="s" decimals={0} oncopy={doc.copy} />
            {:else}
              <Result label="Temps d'usinage" value={t} unit="min" decimals={1} oncopy={doc.copy} />
            {/if}
          {/if}
        </div>
      {/if}
      <p class="hint">
        N = 1000 × Vc / (π × D). La plage dépend de la machine, de l'outil et de l'arrosage : partez de la vitesse théorique,
        baissez si l'outil chauffe ou si ça vibre.
        {#if plus}{CONSEIL_AVANCE[doc.data.operation]}{/if}
      </p>
    {:else}
      <p class="empty">Renseignez le {DIAMETRE[doc.data.operation].toLowerCase()}.</p>
    {/if}
  </Card>
</div>

<style>
  .split {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 720px) {
    .split {
      grid-template-columns: 1fr;
    }
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
  }
  .context {
    margin: -4px 0 0;
    font-size: 12.5px;
    color: var(--muted);
  }
  .more {
    align-self: flex-start;
    border: 0;
    background: none;
    padding: 0;
    font: 600 13px var(--font);
    color: var(--accent);
    cursor: pointer;
  }
  .params {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
  }
  .hint,
  .empty {
    margin: 0;
    font-size: 12.5px;
    color: var(--faint);
  }
  .empty {
    padding: 24px 0;
    text-align: center;
  }
  .warn {
    margin: 0;
    padding: 8px 12px;
    border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--warn) 16%, transparent);
    font-size: 13px;
  }
</style>
