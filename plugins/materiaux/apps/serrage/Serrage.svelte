<script lang="ts">
  // Couple de serrage et précharge (cahier des charges des plugins, section 5.4).
  import { Card, MiniAppDocument, Result, SelectField, format } from "@etabli/ui";
  import { designation, sectionResistante, filetage } from "../../src/filetage";
  import { CLASSES, DIAMETRES, FROTTEMENTS, classe, cle, serrage } from "../../src/serrage";

  interface Data {
    d: string;
    classe: string;
    /** Coefficient de frottement (« 0.12 »). */
    mu: string;
  }

  const doc = new MiniAppDocument<Data>({ d: "10", classe: "8.8", mu: "0.12" }, (d) => {
    const s = serrage(Number(d.d), classe(d.classe).rp, Number(d.mu));
    return s ? `M${d.d} ${classe(d.classe).nom} · ${format(s.couple, s.couple < 10 ? 1 : 0)} N·m` : "";
  });

  const d = $derived(Number(doc.data.d));
  const c = $derived(classe(doc.data.classe));
  const mu = $derived(Number(doc.data.mu));
  const s = $derived(serrage(d, c.rp, mu));
  const pas = $derived(filetage(d)?.pas ?? NaN);
  const decimales = (couple: number) => (couple < 10 ? 1 : 0);

  function copyTable() {
    const lines = [`Vis ${c.nom}, µ ${format(mu, 2)}\tCouple (N·m)\tPrécharge (kN)`];
    for (const x of DIAMETRES) {
      const r = serrage(x, c.rp, mu);
      if (r) lines.push(`M${x}\t${format(r.couple, decimales(r.couple))}\t${format(r.precharge / 1000, 1)}`);
    }
    doc.copy(lines.join("\n"));
  }
</script>

<div class="split">
  <Card title="Vis">
    <div class="two">
      <SelectField label="Diamètre" options={DIAMETRES.map((x) => ({ value: String(x), label: `M${x}` }))} bind:value={doc.data.d} />
      <SelectField label="Classe" options={CLASSES.map((x) => ({ value: x.id, label: x.nom }))} bind:value={doc.data.classe} />
    </div>
    <SelectField label="Frottement µ" options={FROTTEMENTS.map((x) => ({ value: String(x.mu), label: x.nom }))} bind:value={doc.data.mu} />
    <p class="hint">
      Filetage à pas gros, tête hexagonale ou CHC, trou de passage moyen. Le même µ est pris dans les filets et sous la tête.
    </p>
    {#if c.id.startsWith("A")}
      <p class="warn">Inox sur inox : risque de grippage à sec. Graissez à la pâte anti-grippage (µ ≈ 0,10 à 0,12).</p>
    {/if}
  </Card>

  <Card title="{designation(d, pas)} {c.nom}">
    {#if s}
      <Result label="Couple de serrage" value={s.couple} unit="N·m" decimals={decimales(s.couple)} big oncopy={doc.copy} />
      <div class="grid">
        <Result label="Précharge" value={s.precharge / 1000} unit="kN" decimals={1} oncopy={doc.copy} />
        <Result label="Précharge" value={s.precharge / 9806.65} unit="t" decimals={2} oncopy={doc.copy} />
        <Result label="Ouverture de clé" value={cle(d)} unit="mm" decimals={1} oncopy={doc.copy} />
        <Result label="Section résistante As" value={sectionResistante(d, pas)} unit="mm²" decimals={1} oncopy={doc.copy} />
      </div>
      <div class="parts" aria-label="Où part le couple">
        <div class="bar">
          <span class="tete" style:width="{s.parts.tete * 100}%"></span>
          <span class="filets" style:width="{s.parts.filets * 100}%"></span>
          <span class="pas" style:width="{s.parts.pas * 100}%"></span>
        </div>
        <div class="legend">
          <span><i class="tete"></i>Frottement sous la tête {format(s.parts.tete * 100, 0)} %</span>
          <span><i class="filets"></i>Frottement dans les filets {format(s.parts.filets * 100, 0)} %</span>
          <span><i class="pas"></i>Tension de la vis {format(s.parts.pas * 100, 0)} %</span>
        </div>
      </div>
      <p class="hint">
        Méthode simplifiée VDI 2230, précharge à 90 % de la limite élastique ({format(c.rp, 0)} MPa) : c'est le couple maxi
        de montage. Une clé dynamométrique garde 10 à 25 % d'incertitude sur la précharge. Valeurs indicatives.
      </p>
    {:else}
      <p class="empty">Diamètre non couvert.</p>
    {/if}
  </Card>
</div>

<Card title="Tableau {c.nom}, µ {format(mu, 2)}">
  {#snippet actions()}
    <button class="btn" onclick={copyTable}>Copier le tableau</button>
  {/snippet}
  <div class="scroll">
    <table>
      <thead>
        <tr><th>Vis</th><th class="r">Couple (N·m)</th><th class="r">Précharge (kN)</th><th class="r">Clé (mm)</th></tr>
      </thead>
      <tbody>
        {#each DIAMETRES as x (x)}
          {@const r = serrage(x, c.rp, mu)}
          {#if r}
            <tr class:on={x === d}>
              <td><button onclick={() => (doc.data.d = String(x))}>M{x}</button></td>
              <td class="r">{format(r.couple, decimales(r.couple))}</td>
              <td class="r">{format(r.precharge / 1000, 1)}</td>
              <td class="r">{format(cle(x), 1)}</td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
</Card>

<style>
  .split {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 16px;
    align-items: start;
    margin-bottom: 16px;
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
  .parts {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bar {
    display: flex;
    height: 10px;
    border-radius: var(--r-xs);
    overflow: hidden;
    background: var(--field);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: 12px;
    color: var(--muted);
  }
  .legend i {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 5px;
    border-radius: 2px;
  }
  .tete {
    background: var(--warn);
  }
  .filets {
    background: var(--faint);
  }
  .pas {
    background: var(--ok);
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
  .scroll {
    max-height: 360px;
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    position: sticky;
    top: 0;
    background: var(--surface);
    text-align: left;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--faint);
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 3px 8px;
    border-bottom: 1px solid var(--border);
    font-family: var(--mono);
  }
  tr.on td {
    background: var(--accent-soft);
  }
  .r {
    text-align: right;
  }
  td button {
    border: 0;
    background: none;
    padding: 0;
    font: 600 13px var(--mono);
    color: var(--accent);
    cursor: pointer;
  }
</style>
