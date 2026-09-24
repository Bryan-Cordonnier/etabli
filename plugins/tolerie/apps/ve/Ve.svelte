<script lang="ts">
  // Vé et effort de pliage en l'air (cahier des charges des plugins, section 4.2).
  import { Card, Field, MiniAppDocument, Result, SelectField, evaluate, format } from "@etabli/ui";
  import { MATIERES, airBendRadius, bendingForce, matiere, minFlange, recommendedVee, toTonnes } from "../../src/pliage";

  interface Data {
    material: string;
    /** Rm saisi à la place de celui de la table (vide : valeur de la table). */
    rm: string;
    thickness: string;
    length: string;
    vee: string;
    press: string;
  }

  const num = (text: string) => (text.trim() === "" ? NaN : evaluate(text));

  interface Computed {
    rm: number;
    e: number;
    length: number;
    vee: number;
    suggested: number;
    force: number;
  }

  function solve(d: Data): Computed | string {
    const e = num(d.thickness);
    const length = num(d.length);
    if (!(e > 0)) return "Renseignez l'épaisseur de la tôle.";
    if (!(length > 0)) return "Renseignez la longueur de pli.";
    const rm = d.rm.trim() === "" ? matiere(d.material).rm : num(d.rm);
    if (!(rm > 0)) return "La résistance Rm doit être positive.";
    const suggested = recommendedVee(e);
    const vee = d.vee.trim() === "" ? suggested : num(d.vee);
    if (!(vee > 0)) return "L'ouverture du vé doit être positive.";
    if (vee < 4 * e) return `Vé de ${format(vee)} mm : trop serré pour ${format(e)} mm d'épaisseur (au moins 4 × e, ${format(4 * e)} mm).`;
    return { rm, e, length, vee, suggested, force: bendingForce(rm, e, length, vee) };
  }

  const doc = new MiniAppDocument<Data>({ material: "s235", rm: "", thickness: "", length: "", vee: "", press: "" }, (d) => {
    const c = solve(d);
    return typeof c === "string" ? "" : `Vé ${format(c.vee)} · ${format(toTonnes(c.force), 1)} t`;
  });

  const result = $derived(solve(doc.data));
  const c = $derived(typeof result === "string" ? null : result);
  const m = $derived(matiere(doc.data.material));
  const press = $derived(num(doc.data.press));
  const usage = $derived(c && press > 0 ? (toTonnes(c.force) / press) * 100 : NaN);
</script>

<div class="split">
  <Card title="Entrées">
    <SelectField label="Matière" options={MATIERES.map((x) => ({ value: x.id, label: x.nom }))} bind:value={doc.data.material} />
    <div class="two">
      <Field label="Rm" unit="MPa" bind:value={doc.data.rm} placeholder={`${m.rm} (table)`} />
      <Field label="Épaisseur" unit="mm" bind:value={doc.data.thickness} />
    </div>
    <div class="two">
      <Field label="Longueur de pli" unit="mm" bind:value={doc.data.length} />
      <Field label="Ouverture du vé" unit="mm" bind:value={doc.data.vee} placeholder={c ? `${format(c.suggested)} (conseillé)` : ""} />
    </div>
    <Field label="Capacité de la presse" unit="t" bind:value={doc.data.press} placeholder="facultatif" />
    <p class="hint">
      Pliage en l'air. Vé conseillé : 8 × e jusqu'à 8 mm, 10 × e jusqu'à 20 mm, 12 × e au-delà, arrondi au vé courant.
      Rm de la table : valeur courante de la norme, à remplacer par celle du certificat matière si vous l'avez.
    </p>
  </Card>

  <Card title="Résultats">
    {#if c}
      <Result label="Effort de pliage" value={toTonnes(c.force)} unit="t" decimals={1} big oncopy={doc.copy} />
      {#if Number.isFinite(usage)}
        <div class="usage" class:over={usage > 100}>
          <div class="bar"><span style:width="{Math.min(100, usage)}%"></span></div>
          <b>{format(usage, 0)} % de la presse</b>
          {#if usage > 100}<span>Trop lourd : ouvrez le vé, ou pliez en plusieurs fois.</span>{/if}
        </div>
      {/if}
      <div class="grid">
        <Result label="Effort" value={c.force / 1000} unit="kN" decimals={1} oncopy={doc.copy} />
        <Result label="Effort par mètre" value={toTonnes(c.force) / (c.length / 1000)} unit="t/m" decimals={1} oncopy={doc.copy} />
        <Result label="Vé conseillé" value={c.suggested} unit="mm" decimals={0} oncopy={doc.copy} />
        <Result label="Rayon intérieur obtenu" value={airBendRadius(c.vee)} unit="mm" decimals={1} oncopy={doc.copy} />
        <Result label="Aile mini" value={minFlange(c.vee)} unit="mm" decimals={0} oncopy={doc.copy} />
      </div>
      {#if airBendRadius(c.vee) < m.rayonMini * c.e}
        <p class="warn">
          Rayon obtenu (≈ {format(airBendRadius(c.vee), 1)} mm) sous le rayon mini de {m.nom} ({format(m.rayonMini * c.e, 1)} mm) : ouvrez le vé.
        </p>
      {/if}
      <p class="hint">F = 1,33 × Rm × e² × L / V. Valeurs indicatives : le tonnage exact dépend de l'outillage, voir l'abaque de la presse.</p>
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
  .usage {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    align-items: center;
    font-size: 13px;
  }
  .usage > span {
    grid-column: 1 / -1;
    color: var(--err);
  }
  .bar {
    height: 10px;
    border-radius: var(--r-xs);
    background: var(--field);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--ok);
    transition: width 0.2s;
  }
  .over .bar span {
    background: var(--err);
  }
  .over b {
    color: var(--err);
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
