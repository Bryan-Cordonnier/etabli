<script lang="ts">
  // Tronçon de cône droit (cahier des charges des plugins, section 6.2) : rayons de traçage, angle
  // du développé, corde et flèche pour tracer sans compas géant, secteurs, gabarit et DXF.
  import { Card, Field, MiniAppDocument, Result, Segmented, SelectField, evaluate, format, printFiche, saveFile } from "@etabli/ui";
  import { cone, type Cone, type DiameterKind } from "../../src/developpes";
  import { MATIERES, patternDxf, plateMass, tracageFiche } from "../../src/export";
  import Flat from "../../src/Flat.svelte";

  type Given = "height" | "slant" | "halfAngle";

  interface Data {
    big: string;
    small: string;
    kind: DiameterKind;
    thickness: string;
    given: Given;
    value: string;
    sectors: string;
    material: string;
  }

  const KINDS: { value: DiameterKind; label: string }[] = [
    { value: "int", label: "Ø intérieurs" },
    { value: "moy", label: "Ø moyens" },
    { value: "ext", label: "Ø extérieurs" },
  ];
  const GIVEN: { value: Given; label: string }[] = [
    { value: "height", label: "Hauteur" },
    { value: "slant", label: "Génératrice" },
    { value: "halfAngle", label: "Demi-angle" },
  ];

  const num = (t: string) => (t.trim() === "" ? NaN : evaluate(t));

  function solve(d: Data): Cone | string {
    if (d.big.trim() === "" || d.value.trim() === "") return "Renseignez les deux diamètres et la hauteur (ou la génératrice, ou le demi-angle).";
    const v = num(d.value);
    return cone({
      big: num(d.big),
      small: num(d.small) || 0,
      kind: d.kind,
      thickness: num(d.thickness) || 0,
      height: d.given === "height" ? v : 0,
      slant: d.given === "slant" ? v : 0,
      halfAngle: d.given === "halfAngle" ? v : 0,
      sectors: num(d.sectors) || 1,
      divisions: 24,
    });
  }

  const doc = new MiniAppDocument<Data>(
    { big: "", small: "", kind: "moy", thickness: "3", given: "height", value: "", sectors: "1", material: "acier" },
    (d) => {
      const c = solve(d);
      return typeof c === "string" ? "" : `ρ ${format(c.rho)} · θ ${format(c.theta)}°`;
    },
  );

  const result = $derived(solve(doc.data));
  const c = $derived(typeof result === "string" ? null : result);
  const e = $derived(num(doc.data.thickness) || 0);
  const density = $derived(MATIERES.find((m) => m.id === doc.data.material)?.density ?? 7.85);
  const sectors = $derived(Math.max(1, Math.round(num(doc.data.sectors) || 1)));

  function exportDxf(): void {
    if (!c) return;
    saveFile({ name: `cone-${format(c.R * 2, 0)}-${format(c.r * 2, 0)}.dxf`, content: patternDxf(c.pattern), extension: "dxf", description: "Dessin DXF" });
  }

  function print(): void {
    if (!c) return;
    printFiche(
      tracageFiche({
        kind: "Tronçon de cône",
        subtitle: `Ø moyens ${format(c.R * 2)} / ${format(c.r * 2)} · hauteur ${format(c.height)} · épaisseur ${format(e)} mm`,
        results: [
          { label: "Grand rayon ρ", value: `${format(c.rho, 1)} mm` },
          { label: "Petit rayon ρ'", value: `${format(c.rhoSmall, 1)} mm` },
          { label: sectors > 1 ? "Angle d'un secteur" : "Angle du développé", value: `${format(c.sectorAngle, 2)}°` },
          { label: "Génératrice", value: `${format(c.slant, 1)} mm` },
          { label: "Corde du grand arc", value: `${format(c.chord, 1)} mm` },
          { label: "Flèche du grand arc", value: `${format(c.sagitta, 1)} mm` },
          { label: "Secteurs", value: String(sectors) },
          { label: "Masse", value: `${format(plateMass(c.area, e, density), 1)} kg` },
        ],
        pattern: c.pattern,
        note: sectors > 1 ? `Gabarit d'un secteur : en découper ${sectors}.` : undefined,
      }),
    );
  }
</script>

<div class="split">
  <Card title="Tronçon de cône">
    <Segmented label="Diamètres saisis" options={KINDS} bind:value={doc.data.kind} />
    <div class="three">
      <Field label="Grand Ø" unit="mm" bind:value={doc.data.big} />
      <Field label="Petit Ø" unit="mm" bind:value={doc.data.small} placeholder="0 : pointe" />
      <Field label="Épaisseur" unit="mm" bind:value={doc.data.thickness} />
    </div>
    <Segmented label="Donnée connue" options={GIVEN} bind:value={doc.data.given} />
    <Field label={GIVEN.find((g) => g.value === doc.data.given)!.label} unit={doc.data.given === "halfAngle" ? "°" : "mm"} bind:value={doc.data.value} />
    <div class="two">
      <Field label="Nombre de secteurs" bind:value={doc.data.sectors} />
      <SelectField label="Matière" options={MATIERES.map((m) => ({ value: m.id, label: m.label }))} bind:value={doc.data.material} />
    </div>
    <p class="hint">Développé à la fibre moyenne. Plusieurs secteurs quand la tôle est trop petite pour le flan entier.</p>
  </Card>

  <Card title="Développé">
    {#snippet actions()}
      {#if c}
        <button class="btn" onclick={exportDxf}>Exporter en DXF</button>
        <button class="btn primary" onclick={print}>Imprimer le gabarit</button>
      {/if}
    {/snippet}
    {#if c}
      <div class="grid">
        <Result label="Grand rayon de traçage ρ" value={c.rho} unit="mm" big oncopy={doc.copy} />
        <Result label="Petit rayon de traçage ρ'" value={c.rhoSmall} unit="mm" big oncopy={doc.copy} />
      </div>
      <div class="grid">
        <Result label={sectors > 1 ? "Angle d'un secteur" : "Angle du développé"} value={c.sectorAngle} unit="°" oncopy={doc.copy} />
        <Result label="Génératrice" value={c.slant} unit="mm" oncopy={doc.copy} />
        <Result label="Hauteur" value={c.height} unit="mm" oncopy={doc.copy} />
        <Result label="Demi-angle au sommet" value={c.halfAngle} unit="°" oncopy={doc.copy} />
        <Result label="Corde du grand arc" value={c.chord} unit="mm" oncopy={doc.copy} />
        <Result label="Flèche du grand arc" value={c.sagitta} unit="mm" oncopy={doc.copy} />
        <Result label="Corde du petit arc" value={c.chordSmall} unit="mm" oncopy={doc.copy} />
        <Result label="Masse" value={plateMass(c.area, e, density)} unit="kg" decimals={1} oncopy={doc.copy} />
      </div>
      <Flat pattern={c.pattern} />
      <p class="hint">
        Traçage : pointe du compas au sommet, arcs de rayon ρ et ρ', angle {format(c.sectorAngle, 2)}° — ou, sans compas assez grand, la corde
        et la flèche du grand arc. Lignes rouges : génératrices (roulage).
      </p>
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
