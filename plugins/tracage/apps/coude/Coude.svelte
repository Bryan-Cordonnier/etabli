<script lang="ts">
  // Coude à segments (cahier des charges des plugins, section 6.4) : angle de coupe, longueurs à
  // l'extrados et à l'intrados, tableau de traçage, développé d'un segment, longueur de tube.
  import { Card, Field, MiniAppDocument, Result, Segmented, evaluate, format, printFiche, saveFile } from "@etabli/ui";
  import { coude, type Coude, type DiameterKind } from "../../src/developpes";
  import { patternDxf, tracageFiche } from "../../src/export";
  import Flat from "../../src/Flat.svelte";
  import TraceTable from "../../src/TraceTable.svelte";

  interface Data {
    diameter: string;
    kind: DiameterKind;
    thickness: string;
    radius: string;
    angle: string;
    joints: string;
    straight: string;
    divisions: string;
  }

  const KINDS: { value: DiameterKind; label: string }[] = [
    { value: "int", label: "Ø intérieur" },
    { value: "moy", label: "Ø moyen" },
    { value: "ext", label: "Ø extérieur" },
  ];
  const HEADERS: [string, string, string, string] = ["Génératrice", "Angle (°)", "Abscisse (mm)", "Ordonnée (mm)"];

  const num = (t: string) => (t.trim() === "" ? NaN : evaluate(t));

  function solve(d: Data): Coude | string {
    if ([d.diameter, d.radius, d.angle].some((t) => t.trim() === "")) return "Renseignez le diamètre, le rayon de cintrage et l'angle du coude.";
    return coude({
      diameter: num(d.diameter),
      kind: d.kind,
      thickness: num(d.thickness) || 0,
      bendRadius: num(d.radius),
      angle: num(d.angle),
      joints: num(d.joints) || 1,
      straight: num(d.straight) || 0,
      divisions: num(d.divisions) || 12,
    });
  }

  const doc = new MiniAppDocument<Data>(
    { diameter: "", kind: "ext", thickness: "3", radius: "", angle: "90", joints: "3", straight: "0", divisions: "12" },
    (d) => {
      const c = solve(d);
      return typeof c === "string" ? "" : `Coude ${format(num(d.angle))}° · ${format(num(d.joints))} joints · coupe ${format(c.cutAngle)}°`;
    },
  );

  const result = $derived(solve(doc.data));
  const c = $derived(typeof result === "string" ? null : result);

  function exportDxf(): void {
    if (!c) return;
    saveFile({ name: `coude-segment-${format(c.dm, 0)}.dxf`, content: patternDxf(c.pattern), extension: "dxf", description: "Dessin DXF" });
  }

  function print(): void {
    if (!c) return;
    printFiche(
      tracageFiche({
        kind: "Coude à segments",
        subtitle: `Ø moyen ${format(c.dm)} · Rc ${format(num(doc.data.radius))} · ${format(num(doc.data.angle))}° · ${format(num(doc.data.joints))} joints`,
        results: [
          { label: "Angle de coupe", value: `${format(c.cutAngle, 2)}°`, detail: "depuis la coupe d'équerre" },
          { label: "Segment entier : extrados", value: `${format(c.full.extrados, 1)} mm`, detail: `${c.full.count} segment(s)` },
          { label: "Segment entier : intrados", value: `${format(c.full.intrados, 1)} mm` },
          { label: "Demi-segment : extrados", value: `${format(c.half.extrados, 1)} mm`, detail: "2 aux extrémités" },
          { label: "Demi-segment : intrados", value: `${format(c.half.intrados, 1)} mm` },
          { label: "Longueur de tube", value: `${format(c.tubeLength, 1)} mm`, detail: "segments emboîtés" },
        ],
        rows: c.table,
        headers: HEADERS,
        pattern: c.pattern,
        note: "Gabarit d'un segment entier : ordonnées de part et d'autre de la ligne d'axe. Un demi-segment = la moitié du gabarit (plus la longueur droite éventuelle).",
      }),
    );
  }
</script>

<div class="split">
  <Card title="Coude à segments">
    <Segmented label="Diamètre saisi" options={KINDS} bind:value={doc.data.kind} />
    <div class="two">
      <Field label="Diamètre" unit="mm" bind:value={doc.data.diameter} />
      <Field label="Épaisseur" unit="mm" bind:value={doc.data.thickness} />
    </div>
    <div class="two">
      <Field label="Rayon de cintrage (à l'axe)" unit="mm" bind:value={doc.data.radius} />
      <Field label="Angle du coude" unit="°" bind:value={doc.data.angle} />
    </div>
    <div class="three">
      <Field label="Joints" bind:value={doc.data.joints} />
      <Field label="Droit aux bouts" unit="mm" bind:value={doc.data.straight} />
      <Field label="Génératrices" bind:value={doc.data.divisions} />
    </div>
    <p class="hint">Joints = soudures : 2 demi-segments aux extrémités et « joints − 1 » segments entiers. Angle de coupe = angle du coude / (2 × joints).</p>
  </Card>

  <Card title="Segments">
    {#snippet actions()}
      {#if c}
        <button class="btn" onclick={exportDxf}>Exporter en DXF</button>
        <button class="btn primary" onclick={print}>Imprimer le gabarit</button>
      {/if}
    {/snippet}
    {#if c}
      <Result label="Angle de coupe de chaque joint" value={c.cutAngle} unit="°" big oncopy={doc.copy} />
      <div class="grid">
        <Result label="Segment entier : extrados" value={c.full.extrados} unit="mm" oncopy={doc.copy} />
        <Result label="Segment entier : intrados" value={c.full.intrados} unit="mm" oncopy={doc.copy} />
        <Result label="Demi-segment : extrados" value={c.half.extrados} unit="mm" oncopy={doc.copy} />
        <Result label="Demi-segment : intrados" value={c.half.intrados} unit="mm" oncopy={doc.copy} />
        <Result label="Longueur de tube (emboîtés)" value={c.tubeLength} unit="mm" oncopy={doc.copy} />
      </div>
      <p class="hint">{c.full.count} segment{c.full.count > 1 ? "s" : ""} entier{c.full.count > 1 ? "s" : ""} + 2 demi-segments. Couper à la suite dans un même tube en retournant chaque segment d'un demi-tour : les coupes s'emboîtent, sans chute.</p>
      <h4>Développé d'un segment entier</h4>
      <Flat pattern={c.pattern} />
      <TraceTable rows={c.table} headers={HEADERS} oncopy={doc.copy} />
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
  .three {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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
