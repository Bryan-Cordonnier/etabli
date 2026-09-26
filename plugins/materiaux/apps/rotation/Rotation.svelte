<script lang="ts">
  // Vitesse de coupe, de rotation et d'avance (cahier des charges des plugins, section 5.3).
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
    vcConseillee,
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
      const vc = d.vc.trim() === "" ? vcConseillee(d.operation, d.outil, d.matiere) : num(d.vc);
      const n = rotation(vc, num(d.diametre));
      return Number.isFinite(n) && n > 0 ? `Ø ${format(num(d.diametre), 1)} · ${format(n, 0)} tr/min` : "";
    },
  );

  const DIAMETRE: Record<Operation, string> = { percage: "Ø du foret", fraisage: "Ø de la fraise", tournage: "Ø de la pièce" };

  const vcTable = $derived(vcConseillee(doc.data.operation, doc.data.outil, doc.data.matiere));
  const vc = $derived(doc.data.vc.trim() === "" ? vcTable : num(doc.data.vc));
  const d = $derived(num(doc.data.diametre));
  const n = $derived(vc > 0 && d > 0 ? rotation(vc, d) : NaN);
  const nMachine = $derived(vitesseMachine(reglages.data.vitessesMachine, n));
  const nUtile = $derived(Number.isFinite(nMachine) ? nMachine : n);
  const fraisage = $derived(doc.data.operation === "fraisage");
  const fConseil = $derived(avanceConseillee(doc.data.operation, doc.data.outil, doc.data.matiere, d > 0 ? d : 10));
  const f = $derived(doc.data.avance.trim() === "" ? fConseil : num(doc.data.avance));
  const dents = $derived(fraisage ? (doc.data.dents.trim() === "" ? 4 : Math.round(num(doc.data.dents))) : 1);
  const vf = $derived(Number.isFinite(nUtile) && f > 0 && dents > 0 ? avance(nUtile, f, dents) : NaN);
  const longueur = $derived(num(doc.data.longueur));
  const t = $derived(vf > 0 && longueur > 0 ? temps(longueur, vf) : NaN);
</script>

<div class="split">
  <Card title="Usinage">
    <Segmented label="Opération" options={OPERATIONS.map((o) => ({ value: o.id, label: o.label }))} bind:value={doc.data.operation} />
    <div class="two">
      <SelectField label="Matière usinée" options={MATIERES_USINAGE.map((m) => ({ value: m.id, label: m.nom }))} bind:value={doc.data.matiere} />
      <SelectField label="Outil" options={OUTILS.map((o) => ({ value: o.id, label: o.label }))} bind:value={doc.data.outil} />
    </div>
    <div class="two">
      <Field label={DIAMETRE[doc.data.operation]} unit="mm" bind:value={doc.data.diametre} />
      <Field label="Vitesse de coupe Vc" unit="m/min" bind:value={doc.data.vc} placeholder={`${format(vcTable, 0)} (table)`} />
    </div>
    <div class="two">
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
  </Card>

  <Card title="Résultats">
    {#if Number.isFinite(n)}
      <Result label="Vitesse de rotation N" value={n} unit="tr/min" decimals={0} big oncopy={doc.copy} />
      <div class="grid">
        {#if Number.isFinite(nMachine)}
          <Result label="À régler sur la machine" value={nMachine} unit="tr/min" decimals={0} oncopy={doc.copy} />
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
      <p class="hint">
        N = 1000 × Vc / (π × D){fraisage ? " ; Vf = N × fz × Z" : " ; Vf = N × f"}.
        {CONSEIL_AVANCE[doc.data.operation]} Vitesses indicatives avec lubrification : à baisser si l'outil chauffe ou
        si la machine vibre.
        {#if Number.isFinite(nMachine)}La machine tourne à la vitesse disponible juste en dessous du calcul (5 % de marge).{/if}
      </p>
    {:else}
      <p class="empty">Renseignez le diamètre.</p>
    {/if}
  </Card>
</div>

<style>
  .split {
    display: grid;
    grid-template-columns: 360px 1fr;
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
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 8px;
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
</style>
