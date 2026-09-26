<script lang="ts">
  // Piquage cylindre sur cylindre (cahier des charges des plugins, section 6.3) : développé du
  // piquage (droit ou incliné, centré ou excentré) et gabarit du trou dans le tube principal.
  import { Card, Field, MiniAppDocument, Result, evaluate, format, printFiche, saveFile } from "@etabli/ui";
  import Apercu from "../../src/Apercu.svelte";
  import CoteField from "../../src/CoteField.svelte";
  import { bounds, piquage, type DiameterKind, type Piquage, type Point } from "../../src/developpes";
  import { patternDxf, tracageFiche } from "../../src/export";
  import Flat from "../../src/Flat.svelte";
  import { piquageModel } from "../../src/modele3d";
  import TraceTable from "../../src/TraceTable.svelte";

  interface Data {
    main: string;
    mainKind: DiameterKind;
    mainThickness: string;
    diameter: string;
    kind: DiameterKind;
    thickness: string;
    angle: string;
    offset: string;
    length: string;
    divisions: string;
  }

  const HEADERS: [string, string, string, string] = ["Génératrice", "Angle (°)", "Abscisse (mm)", "Longueur (mm)"];

  const num = (t: string) => (t.trim() === "" ? NaN : evaluate(t));

  function solve(d: Data): Piquage | string {
    if ([d.main, d.diameter, d.length].some((t) => t.trim() === "")) return "Renseignez le Ø du tube principal, le Ø du piquage et sa longueur.";
    return piquage({
      mainDiameter: num(d.main),
      mainKind: d.mainKind,
      mainThickness: num(d.mainThickness) || 0,
      diameter: num(d.diameter),
      kind: d.kind,
      thickness: num(d.thickness) || 0,
      angle: num(d.angle) || 90,
      offset: num(d.offset) || 0,
      length: num(d.length),
      divisions: num(d.divisions) || 24,
    });
  }

  const doc = new MiniAppDocument<Data>(
    { main: "", mainKind: "ext", mainThickness: "3", diameter: "", kind: "ext", thickness: "3", angle: "90", offset: "0", length: "", divisions: "24" },
    (d) => {
      const p = solve(d);
      return typeof p === "string" ? "" : `Piquage Ø ${format(num(d.diameter))} sur Ø ${format(num(d.main))}`;
    },
  );

  const result = $derived(solve(doc.data));
  const p = $derived(typeof result === "string" ? null : result);
  const e = $derived(num(doc.data.thickness) || 0);
  const mainE = $derived(num(doc.data.mainThickness) || 0);
  const model = () =>
    piquageModel(p!, { angle: num(doc.data.angle) || 90, offset: num(doc.data.offset) || 0, length: num(doc.data.length), thickness: e, mainThickness: mainE });
  const rise = $derived(p ? Math.max(...p.table.map((r) => r.rise)) : 0);
  /** Gabarit du trou, placé à droite du flan du piquage (pour le gabarit papier). */
  const holeBeside = $derived.by((): Point[] => {
    if (!p) return [];
    const flat = bounds(p.pattern.contour);
    const hole = bounds(p.hole);
    return p.hole.map(([x, y]) => [x - hole.minX + flat.maxX + 40, y - hole.minY] as Point);
  });

  function exportDxf(which: "piquage" | "trou"): void {
    if (!p) return;
    const content =
      which === "piquage"
        ? patternDxf(p.pattern)
        : patternDxf({ contour: p.hole, lines: [], labels: [{ at: [0, 0], text: "trou (developpe sur le Ø exterieur du tube principal)" }] });
    saveFile({ name: `piquage-${format(num(doc.data.diameter), 0)}-${which}.dxf`, content, extension: "dxf", description: "Dessin DXF" });
  }

  function print(): void {
    if (!p) return;
    printFiche(
      tracageFiche({
        kind: "Piquage",
        subtitle: `Ø ${format(num(doc.data.diameter))} sur Ø ${format(num(doc.data.main))} · ${format(num(doc.data.angle) || 90)}° · excentration ${format(num(doc.data.offset) || 0)} mm`,
        results: [
          { label: "Développé du piquage", value: `${format(p.developed, 1)} mm` },
          { label: "Flèche de la coupe", value: `${format(rise, 1)} mm` },
          { label: "Génératrice la plus courte", value: `${format(Math.min(...p.table.map((r) => r.y)), 1)} mm` },
          { label: "Génératrice la plus longue", value: `${format(Math.max(...p.table.map((r) => r.y)), 1)} mm` },
        ],
        rows: p.table,
        headers: HEADERS,
        pattern: p.pattern,
        extraShapes: [{ points: holeBeside, closed: true, kind: "contour" }],
        note: "À droite du flan : gabarit du trou à tracer sur le tube principal (développé sur son diamètre extérieur).",
      }),
    );
  }
</script>

<div class="split">
  <Card title="Piquage">
    <div class="cote">
      <CoteField label="Ø du tube principal" bind:value={doc.data.main} bind:kind={doc.data.mainKind} thickness={mainE} />
      <Field label="Épaisseur" unit="mm" bind:value={doc.data.mainThickness} />
    </div>
    <div class="cote">
      <CoteField label="Ø du piquage" bind:value={doc.data.diameter} bind:kind={doc.data.kind} thickness={e} />
      <Field label="Épaisseur" unit="mm" bind:value={doc.data.thickness} />
    </div>
    <div class="two">
      <Field label="Angle entre les axes" unit="°" bind:value={doc.data.angle} />
      <Field label="Excentration" unit="mm" bind:value={doc.data.offset} />
    </div>
    <div class="two">
      <Field label="Longueur depuis l'axe principal" unit="mm" bind:value={doc.data.length} />
      <Field label="Génératrices" bind:value={doc.data.divisions} />
    </div>
    <p class="hint">
      Int / Moy / Ext : chaque diamètre est saisi à l'intérieur, à la fibre moyenne ou à l'extérieur de la tôle. Piquage posé :
      la coupe est calculée avec le rayon intérieur du piquage sur le diamètre extérieur du tube principal ; le développé se
      trace sur la fibre moyenne du piquage. Longueur : de l'axe du tube principal au bout libre, le long de l'axe du
      piquage.
    </p>
  </Card>

  <Card title="Développé">
    {#snippet actions()}
      {#if p}
        <button class="btn" onclick={() => exportDxf("piquage")}>DXF du piquage</button>
        <button class="btn" onclick={() => exportDxf("trou")}>DXF du trou</button>
        <button class="btn primary" onclick={print}>Imprimer le gabarit</button>
      {/if}
    {/snippet}
    {#if p}
      <Result label="Développé du piquage (fibre moyenne)" value={p.developed} unit="mm" big oncopy={doc.copy} />
      <div class="grid">
        <Result label="Flèche de la coupe" value={rise} unit="mm" oncopy={doc.copy} />
        <Result label="Génératrice la plus courte" value={Math.min(...p.table.map((r) => r.y))} unit="mm" oncopy={doc.copy} />
        <Result label="Génératrice la plus longue" value={Math.max(...p.table.map((r) => r.y))} unit="mm" oncopy={doc.copy} />
      </div>
      <Apercu {model}>
        {#snippet flat()}
          <h4>Flan du piquage</h4>
          <Flat pattern={p!.pattern} />
          <h4>Gabarit du trou dans le tube principal</h4>
          <Flat pattern={{ contour: p!.hole, lines: [], labels: [] }} height={180} />
        {/snippet}
      </Apercu>
      <TraceTable rows={p.table} headers={HEADERS} oncopy={doc.copy} />
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
  .cote {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
    gap: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 8px;
  }
  h4 {
    margin: 4px 0 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
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
