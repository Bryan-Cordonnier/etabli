<script lang="ts">
  // Perçage avant taraudage, trous de passage et lamages (cahier des charges des plugins, section 5.2).
  import { Card, MiniAppDocument, Result, SelectField, format } from "@etabli/ui";
  import {
    FILETAGES,
    designation,
    diametreFlancs,
    filetage,
    foretRefouler,
    foretTaraudage,
    interieurTaraudage,
    noyauVis,
    sectionResistante,
  } from "../../src/filetage";

  interface Data {
    /** Diamètre nominal (« 8 », « 1.6 »). */
    d: string;
    /** Pas fin choisi ; vide : pas gros. */
    pas: string;
  }

  const doc = new MiniAppDocument<Data>({ d: "8", pas: "" }, (d) => {
    const f = filetage(Number(d.d));
    if (!f) return "";
    const pas = f.fins.includes(Number(d.pas)) ? Number(d.pas) : f.pas;
    return `${designation(f.d, pas)} · foret ${format(foretTaraudage(f.d, pas), 2)}`;
  });

  const f = $derived(filetage(Number(doc.data.d)) ?? FILETAGES.find((x) => x.d === 8)!);
  // Un pas fin qui n'existe pas pour ce diamètre (après un changement de diamètre) : pas gros.
  const pas = $derived(f.fins.includes(Number(doc.data.pas)) ? Number(doc.data.pas) : f.pas);
  const fin = $derived(pas !== f.pas);
  const foret = $derived(foretTaraudage(f.d, pas));
  let showTable = $state(false);

  function copyTable() {
    const lines = ["Filetage\tPas\tForet\tPassage fin\tPassage moyen\tPassage large\tLamage Ø\tLamage prof."];
    for (const x of FILETAGES) lines.push([designation(x.d, x.pas), x.pas, x.foret, ...x.passage, ...x.lamage].map((v) => (typeof v === "number" ? format(v, 2) : v)).join("\t"));
    doc.copy(lines.join("\n"));
  }
</script>

<div class="split">
  <Card title="Filetage">
    <div class="two">
      <SelectField label="Diamètre" options={FILETAGES.map((x) => ({ value: String(x.d), label: designation(x.d, x.pas) }))} bind:value={doc.data.d} />
      <SelectField
        label="Pas"
        options={[{ value: "", label: `Gros, ${format(f.pas, 2)}` }, ...f.fins.map((p) => ({ value: String(p), label: `Fin, ${format(p, 2)}` }))]}
        bind:value={() => (fin ? String(pas) : ""), (v) => (doc.data.pas = v)}
      />
    </div>
    <p class="hint">
      Longueur implantée conseillée : 1 × d dans l'acier ({format(f.d, 1)} mm), 1,5 × d dans la fonte ou le laiton
      ({format(1.5 * f.d, 1)} mm), 2 × d dans l'aluminium ({format(2 * f.d, 1)} mm).
    </p>
    <p class="hint">
      Trou borgne : percer au moins la longueur filetée + 3 pas ({format(3 * pas, 2)} mm), le taraud ayant une entrée conique.
    </p>
  </Card>

  <Card title={designation(f.d, pas)}>
    <Result label="Foret de taraudage" value={foret} unit="mm" decimals={2} big oncopy={doc.copy} />
    <div class="grid">
      <Result label="Foret, taraud à refouler" value={foretRefouler(f.d, pas)} unit="mm" decimals={2} oncopy={doc.copy} />
      <Result label="Ø intérieur du taraudage D1" value={interieurTaraudage(f.d, pas)} unit="mm" decimals={2} oncopy={doc.copy} />
      <Result label="Ø sur flancs d2" value={diametreFlancs(f.d, pas)} unit="mm" decimals={2} oncopy={doc.copy} />
      <Result label="Ø noyau de la vis d3" value={noyauVis(f.d, pas)} unit="mm" decimals={2} oncopy={doc.copy} />
      <Result label="Section résistante As" value={sectionResistante(f.d, pas)} unit="mm²" decimals={1} oncopy={doc.copy} />
    </div>
    <h4>Trous de passage (ISO 273)</h4>
    <div class="grid">
      <Result label="Série fine" value={f.passage[0]!} unit="mm" decimals={1} oncopy={doc.copy} />
      <Result label="Série moyenne" value={f.passage[1]!} unit="mm" decimals={1} oncopy={doc.copy} />
      <Result label="Série large" value={f.passage[2]!} unit="mm" decimals={1} oncopy={doc.copy} />
    </div>
    <h4>Lamage pour vis CHC (ISO 4762)</h4>
    <div class="grid">
      <Result label="Ø du lamage" value={f.lamage[0]!} unit="mm" decimals={1} oncopy={doc.copy} />
      <Result label="Profondeur (tête noyée)" value={f.lamage[1]!} unit="mm" decimals={1} oncopy={doc.copy} />
    </div>
    <p class="hint">
      {fin ? "Pas fin : foret = d − P." : "Foret de la table DIN 336."} Taraud à refouler : foret ≈ d − P/2, sans copeau, pour
      l'acier doux, l'inox et l'aluminium. Passage fin : ajustement précis ; moyen : cas courant ; large : pièces soudées ou mal alignées.
    </p>
  </Card>
</div>

<Card title="Tableau des filetages (pas gros)">
  {#snippet actions()}
    <button class="btn" onclick={() => (showTable = !showTable)} aria-expanded={showTable}>{showTable ? "Masquer" : "Afficher"}</button>
    <button class="btn" onclick={copyTable}>Copier le tableau</button>
  {/snippet}
  {#if showTable}
    <div class="scroll">
      <table>
        <thead>
          <tr><th>Filetage</th><th class="r">Pas</th><th class="r">Foret</th><th class="r">Passage fin / moyen / large</th><th class="r">Lamage Ø × prof.</th></tr>
        </thead>
        <tbody>
          {#each FILETAGES as x (x.d)}
            <tr class:on={x.d === f.d}>
              <td><button onclick={() => (doc.data.d = String(x.d))}>{designation(x.d, x.pas)}</button></td>
              <td class="r">{format(x.pas, 2)}</td>
              <td class="r">{format(x.foret, 2)}</td>
              <td class="r">{x.passage.map((v) => format(v, 1)).join(" / ")}</td>
              <td class="r">{format(x.lamage[0]!, 1)} × {format(x.lamage[1]!, 1)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
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
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 8px;
  }
  h4 {
    margin: 4px 0 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--muted);
  }
  .hint {
    margin: 0;
    font-size: 12.5px;
    color: var(--faint);
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
