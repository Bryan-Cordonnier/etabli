<script lang="ts">
  // Conversions : un tableau par grandeur, toutes les unités à la fois. On tape dans n'importe
  // quelle case, les autres se remplissent ; la case saisie garde le texte tel quel.
  import { Card, Field, MiniAppDocument, evaluate, format } from "@etabli/ui";
  import {
    LENGTH_TO_MM,
    parseInches,
    slopeFromDegrees,
    toDegrees,
    toFraction,
    type LengthUnit,
    type SlopeUnit,
  } from "../../src/geometry";

  type LengthField = LengthUnit | "frac";

  interface Data {
    /** Texte de la case saisie, et l'unité de cette case. */
    length: string;
    lengthUnit: LengthField;
    slope: string;
    slopeUnit: SlopeUnit;
  }

  const LENGTHS: { key: LengthField; label: string; unit: string; decimals: number }[] = [
    { key: "mm", label: "Millimètres", unit: "mm", decimals: 3 },
    { key: "cm", label: "Centimètres", unit: "cm", decimals: 4 },
    { key: "m", label: "Mètres", unit: "m", decimals: 6 },
    { key: "in", label: "Pouces", unit: "in", decimals: 4 },
    { key: "frac", label: "Pouces en fraction (1/64)", unit: "", decimals: 0 },
    { key: "ft", label: "Pieds", unit: "ft", decimals: 5 },
  ];

  const SLOPES: { key: SlopeUnit; label: string; unit: string; decimals: number }[] = [
    { key: "deg", label: "Degrés", unit: "°", decimals: 4 },
    { key: "percent", label: "Pente", unit: "%", decimals: 3 },
    { key: "mmPerM", label: "Pente", unit: "mm/m", decimals: 2 },
    { key: "ratio", label: "Rapport 1 : n", unit: "n", decimals: 2 },
    { key: "rad", label: "Radians", unit: "rad", decimals: 5 },
  ];

  /** Nombre à écrire dans une case : virgule décimale, sans séparateur de milliers (resaisissable). */
  const plain = (value: number, decimals: number) =>
    Number.isFinite(value) ? value.toLocaleString("fr-FR", { maximumFractionDigits: decimals, useGrouping: false }) : "";

  const millimetres = (d: Data) => {
    if (d.length.trim() === "") return NaN;
    if (d.lengthUnit === "in" || d.lengthUnit === "frac") return parseInches(d.length, evaluate) * 25.4;
    return evaluate(d.length) * LENGTH_TO_MM[d.lengthUnit];
  };
  const degreesOf = (d: Data) => (d.slope.trim() === "" ? NaN : toDegrees(evaluate(d.slope), d.slopeUnit));

  const doc = new MiniAppDocument<Data>({ length: "", lengthUnit: "mm", slope: "", slopeUnit: "deg" }, (d) => {
    const parts = [];
    const mm = millimetres(d);
    if (Number.isFinite(mm)) parts.push(`${format(mm)} mm = ${toFraction(mm / 25.4)}`);
    const deg = degreesOf(d);
    if (Number.isFinite(deg)) parts.push(`${format(deg)}° = ${format(slopeFromDegrees(deg).percent)} %`);
    return parts.join(" · ");
  });

  const mm = $derived(millimetres(doc.data));
  const slope = $derived(slopeFromDegrees(degreesOf(doc.data)));

  function lengthText(key: LengthField, decimals: number): string {
    if (key === doc.data.lengthUnit) return doc.data.length;
    if (!Number.isFinite(mm)) return "";
    if (key === "frac") return toFraction(mm / 25.4);
    return plain(mm / (key === "in" ? 25.4 : LENGTH_TO_MM[key]), decimals);
  }

  function slopeText(key: SlopeUnit, decimals: number): string {
    if (key === doc.data.slopeUnit) return doc.data.slope;
    return Number.isFinite(slope.deg) ? plain(slope[key], decimals) : "";
  }

  function editLength(key: LengthField, text: string): void {
    doc.data.lengthUnit = key;
    doc.data.length = text;
  }

  function editSlope(key: SlopeUnit, text: string): void {
    doc.data.slopeUnit = key;
    doc.data.slope = text;
  }
</script>

<div class="columns">
  <Card title="Longueurs">
    <div class="table">
      {#each LENGTHS as row (row.key)}
        {@const text = lengthText(row.key, row.decimals)}
        <span class="label" class:source={row.key === doc.data.lengthUnit && text !== ""}>{row.label}</span>
        <Field
          compact
          numeric={row.key !== "frac" && row.key !== "in"}
          label={row.label}
          unit={row.unit}
          placeholder={row.key === "frac" ? "ex. 1 3/8" : ""}
          bind:value={() => text, (v) => editLength(row.key, v)}
        />
        <button class="copy" onclick={() => text && doc.copy(text)} disabled={!text} title="Copier" aria-label="Copier {row.label}">⧉</button>
      {/each}
    </div>
    <p class="hint">Tapez dans n'importe quelle case : les autres se remplissent. Les pouces acceptent les fractions (<code>1 3/8</code>, <code>3/4</code>).</p>
  </Card>

  <Card title="Angles et pentes">
    <div class="table">
      {#each SLOPES as row (row.key)}
        {@const text = slopeText(row.key, row.decimals)}
        <span class="label" class:source={row.key === doc.data.slopeUnit && text !== ""}>{row.label}</span>
        <Field compact label="{row.label} ({row.unit})" unit={row.unit} bind:value={() => text, (v) => editSlope(row.key, v)} />
        <button class="copy" onclick={() => text && doc.copy(text)} disabled={!text} title="Copier" aria-label="Copier {row.label} {row.unit}">⧉</button>
      {/each}
    </div>
    <p class="hint">Pente de toiture, de rampe, d'écoulement : 3 % = 30 mm/m ≈ 1,72° ≈ 1 : 33.</p>
  </Card>
</div>

<style>
  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
    align-items: start;
  }
  .table {
    display: grid;
    grid-template-columns: minmax(110px, auto) 1fr 32px;
    gap: 6px 10px;
    align-items: center;
  }
  .label {
    font-size: 13px;
    color: var(--muted);
  }
  /* La case saisie par l'utilisateur : son libellé passe à l'accent. */
  .label.source {
    color: var(--accent);
    font-weight: 600;
  }
  .copy {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--faint);
    font-size: 15px;
    cursor: copy;
  }
  .copy:hover:not(:disabled) {
    background: var(--field);
    color: var(--accent);
  }
  .copy:disabled {
    opacity: 0.3;
    cursor: default;
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
