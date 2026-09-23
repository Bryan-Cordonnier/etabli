<script lang="ts">
  import { Card, Field, MiniAppDocument, Result, Segmented, evaluate, format } from "@etabli/ui";
  import {
    LENGTH_TO_MM,
    parseInches,
    slopeFromDegrees,
    toDegrees,
    toFraction,
    type LengthUnit,
    type SlopeUnit,
  } from "../../src/geometry";

  interface Data {
    length: string;
    lengthUnit: LengthUnit;
    slope: string;
    slopeUnit: SlopeUnit;
  }

  const LENGTH_UNITS: { value: LengthUnit; label: string }[] = [
    { value: "mm", label: "mm" },
    { value: "cm", label: "cm" },
    { value: "m", label: "m" },
    { value: "in", label: "pouces" },
    { value: "ft", label: "pieds" },
  ];

  const SLOPE_UNITS: { value: SlopeUnit; label: string }[] = [
    { value: "deg", label: "degrés" },
    { value: "percent", label: "pente %" },
    { value: "mmPerM", label: "mm/m" },
    { value: "rad", label: "radians" },
  ];

  const millimetres = (d: Data) =>
    d.lengthUnit === "in" ? parseInches(d.length, evaluate) * 25.4 : evaluate(d.length) * LENGTH_TO_MM[d.lengthUnit];

  const doc = new MiniAppDocument<Data>({ length: "", lengthUnit: "in", slope: "", slopeUnit: "deg" }, (d) => {
    const parts = [];
    const mm = millimetres(d);
    if (Number.isFinite(mm)) parts.push(`${format(mm)} mm = ${toFraction(mm / 25.4)}`);
    const deg = toDegrees(evaluate(d.slope), d.slopeUnit);
    if (Number.isFinite(deg)) parts.push(`${format(deg)}° = ${format(slopeFromDegrees(deg).percent)} %`);
    return parts.join(" · ");
  });

  const mm = $derived(millimetres(doc.data));
  const degrees = $derived(toDegrees(evaluate(doc.data.slope), doc.data.slopeUnit));
  const slope = $derived(slopeFromDegrees(degrees));
</script>

<div class="columns">
  <Card title="Longueurs">
    <Segmented label="Unité de départ" options={LENGTH_UNITS} bind:value={doc.data.lengthUnit} />
    <Field
      label="Valeur"
      unit={LENGTH_UNITS.find((u) => u.value === doc.data.lengthUnit)?.label}
      bind:value={doc.data.length}
      placeholder={doc.data.lengthUnit === "in" ? "ex. 1 3/8" : "ex. 250"}
    />
    {#if Number.isFinite(mm)}
      <button class="fraction" onclick={() => doc.copy(toFraction(mm / 25.4))} title="Cliquer pour copier">
        <span>Pouces, fraction au 1/64</span>
        <b>{toFraction(mm / 25.4)}</b>
      </button>
      <div class="grid">
        <Result label="Millimètres" value={mm} unit="mm" oncopy={doc.copy} />
        <Result label="Centimètres" value={mm / 10} unit="cm" decimals={3} oncopy={doc.copy} />
        <Result label="Mètres" value={mm / 1000} unit="m" decimals={4} oncopy={doc.copy} />
        <Result label="Pouces" value={mm / 25.4} unit="in" decimals={4} oncopy={doc.copy} />
        <Result label="Pieds" value={mm / 304.8} unit="ft" decimals={4} oncopy={doc.copy} />
      </div>
    {:else}
      <p class="hint">Les pouces acceptent les fractions : <code>1 3/8</code>, <code>3/4</code>.</p>
    {/if}
  </Card>

  <Card title="Angles et pentes">
    <Segmented label="Unité de départ" options={SLOPE_UNITS} bind:value={doc.data.slopeUnit} />
    <Field
      label="Valeur"
      unit={SLOPE_UNITS.find((u) => u.value === doc.data.slopeUnit)?.label}
      bind:value={doc.data.slope}
      placeholder="ex. 3"
    />
    {#if Number.isFinite(degrees)}
      <div class="grid">
        <Result label="Degrés" value={slope.deg} unit="°" decimals={3} oncopy={doc.copy} />
        <Result label="Pente" value={slope.percent} unit="%" oncopy={doc.copy} />
        <Result label="Pente" value={slope.mmPerM} unit="mm/m" oncopy={doc.copy} />
        <Result label="Radians" value={slope.rad} unit="rad" decimals={4} oncopy={doc.copy} />
        <Result label="Rapport 1 : n" value={slope.ratio} unit="" oncopy={doc.copy} />
      </div>
    {:else}
      <p class="hint">Pente de toiture, de rampe, d'écoulement : 3 % = 30 mm/m ≈ 1,72°.</p>
    {/if}
  </Card>
</div>

<style>
  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
    align-items: start;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
  }
  .fraction {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface-2);
    cursor: copy;
    text-align: left;
  }
  .fraction:hover {
    border-color: var(--accent);
  }
  .fraction span {
    color: var(--muted);
    font-size: 12.5px;
  }
  .fraction b {
    font: 700 28px var(--mono);
    color: var(--accent);
  }
  .hint {
    margin: 0;
    font-size: 12.5px;
    color: var(--faint);
  }
  code {
    font-family: var(--mono);
    color: var(--muted);
  }
</style>
