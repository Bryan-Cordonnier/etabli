<script lang="ts">
  // Virole (cahier des charges des plugins, section 6.1) : développé d'un cylindre, avec bout
  // coupé en biais si besoin, découpe en plusieurs tôles, masse, gabarit et DXF.
  import { Card, Field, MiniAppDocument, Result, Segmented, SelectField, evaluate, format, printFiche, saveFile } from "@etabli/ui";
  import { virole, type DiameterKind, type Virole } from "../../src/developpes";
  import { MATIERES, patternDxf, plateMass, tracageFiche } from "../../src/export";
  import Flat from "../../src/Flat.svelte";
  import TraceTable from "../../src/TraceTable.svelte";

  interface Data {
    diameter: string;
    kind: DiameterKind;
    thickness: string;
    height: string;
    bevel: string;
    sheet: string;
    divisions: string;
    material: string;
  }

  const KINDS: { value: DiameterKind; label: string }[] = [
    { value: "int", label: "Ø intérieur" },
    { value: "moy", label: "Ø moyen" },
    { value: "ext", label: "Ø extérieur" },
  ];

  const num = (t: string) => (t.trim() === "" ? NaN : evaluate(t));

  function solve(d: Data): Virole | string {
    if (d.diameter.trim() === "" || d.height.trim() === "") return "Renseignez le diamètre, l'épaisseur et la hauteur.";
    return virole({
      diameter: num(d.diameter),
      kind: d.kind,
      thickness: num(d.thickness) || 0,
      height: num(d.height),
      bevel: num(d.bevel) || 0,
      sheetLength: num(d.sheet) || 0,
      divisions: num(d.divisions) || 12,
    });
  }

  const doc = new MiniAppDocument<Data>(
    { diameter: "", kind: "int", thickness: "3", height: "", bevel: "0", sheet: "", divisions: "12", material: "acier" },
    (d) => {
      const v = solve(d);
      return typeof v === "string" ? "" : `Développé ${format(v.developed)} mm`;
    },
  );

  const result = $derived(solve(doc.data));
  const v = $derived(typeof result === "string" ? null : result);
  const e = $derived(num(doc.data.thickness) || 0);
  const density = $derived(MATIERES.find((m) => m.id === doc.data.material)?.density ?? 7.85);
  const bevel = $derived((num(doc.data.bevel) || 0) > 0);

  function exportDxf(): void {
    if (!v) return;
    saveFile({ name: `virole-${format(v.dm, 0)}.dxf`, content: patternDxf(v.pattern), extension: "dxf", description: "Dessin DXF" });
  }

  function print(): void {
    if (!v) return;
    printFiche(
      tracageFiche({
        kind: "Virole",
        subtitle: `Ø moyen ${format(v.dm)} · hauteur ${format(num(doc.data.height))} · épaisseur ${format(e)} mm`,
        results: [
          { label: "Développé", value: `${format(v.developed, 1)} mm` },
          { label: "Diamètre moyen", value: `${format(v.dm, 1)} mm` },
          { label: "Tôles", value: String(v.pieces), detail: v.pieces > 1 ? `${format(v.pieceLength, 1)} mm chacune` : "une seule" },
          { label: "Masse", value: `${format(plateMass(v.area, e, density), 1)} kg` },
        ],
        rows: bevel ? v.table : undefined,
        headers: ["Génératrice", "Angle (°)", "Abscisse (mm)", "Hauteur (mm)"],
        pattern: v.pattern,
      }),
    );
  }
</script>

<div class="split">
  <Card title="Virole">
    <Segmented label="Diamètre saisi" options={KINDS} bind:value={doc.data.kind} />
    <div class="two">
      <Field label="Diamètre" unit="mm" bind:value={doc.data.diameter} />
      <Field label="Épaisseur" unit="mm" bind:value={doc.data.thickness} />
    </div>
    <div class="two">
      <Field label="Hauteur" unit="mm" bind:value={doc.data.height} />
      <Field label="Bout en biais" unit="°" bind:value={doc.data.bevel} />
    </div>
    <div class="two">
      <Field label="Longueur de tôle" unit="mm" bind:value={doc.data.sheet} placeholder="illimitée" />
      <Field label="Génératrices" bind:value={doc.data.divisions} />
    </div>
    <SelectField label="Matière" options={MATIERES.map((m) => ({ value: m.id, label: m.label }))} bind:value={doc.data.material} />
    <p class="hint">Développé à la fibre moyenne : π × (Ø intérieur + épaisseur). Bout en biais : angle du plan de coupe depuis l'horizontale, hauteur mesurée à l'axe ; soudure sur la génératrice la plus courte.</p>
  </Card>

  <Card title="Développé">
    {#snippet actions()}
      {#if v}
        <button class="btn" onclick={exportDxf}>Exporter en DXF</button>
        <button class="btn primary" onclick={print}>Imprimer le gabarit</button>
      {/if}
    {/snippet}
    {#if v}
      <Result label="Longueur développée" value={v.developed} unit="mm" big oncopy={doc.copy} />
      <div class="grid">
        <Result label="Diamètre moyen" value={v.dm} unit="mm" oncopy={doc.copy} />
        {#if v.pieces > 1}
          <Result label={`${v.pieces} tôles de`} value={v.pieceLength} unit="mm" oncopy={doc.copy} />
        {/if}
        {#if bevel}
          <Result label="Génératrice la plus courte" value={v.minHeight} unit="mm" oncopy={doc.copy} />
          <Result label="Génératrice la plus longue" value={v.maxHeight} unit="mm" oncopy={doc.copy} />
        {/if}
        <Result label="Masse" value={plateMass(v.area, e, density)} unit="kg" decimals={1} oncopy={doc.copy} />
      </div>
      <Flat pattern={v.pattern} />
      {#if bevel}
        <TraceTable rows={v.table} headers={["Génératrice", "Angle (°)", "Abscisse (mm)", "Hauteur (mm)"]} oncopy={doc.copy} />
      {/if}
    {:else}
      <p class="empty">{result}</p>
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
  @media (max-width: 760px) {
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
