<script lang="ts">
  // Trémie carré-rond (cahier des charges des plugins, section 6.5) : triangulation, vraies
  // grandeurs, flan développé avec ses lignes de pliage léger, gabarit et DXF.
  import { Card, Field, MiniAppDocument, Result, SelectField, evaluate, format, printFiche, saveFile } from "@etabli/ui";
  import { MATIERES, patternDxf, plateMass, tracageFiche } from "../../src/export";
  import Flat from "../../src/Flat.svelte";
  import { tremie, type Tremie } from "../../src/tremie";

  interface Data {
    length: string;
    width: string;
    diameter: string;
    height: string;
    offsetX: string;
    offsetY: string;
    divisions: string;
    thickness: string;
    material: string;
  }

  const num = (t: string) => (t.trim() === "" ? NaN : evaluate(t));

  function solve(d: Data): Tremie | string {
    if ([d.length, d.width, d.diameter, d.height].some((t) => t.trim() === "")) return "Renseignez le rectangle du bas, le diamètre du haut et la hauteur.";
    return tremie({
      length: num(d.length),
      width: num(d.width),
      diameter: num(d.diameter),
      height: num(d.height),
      offsetX: num(d.offsetX) || 0,
      offsetY: num(d.offsetY) || 0,
      divisions: num(d.divisions) || 24,
    });
  }

  const doc = new MiniAppDocument<Data>(
    { length: "", width: "", diameter: "", height: "", offsetX: "0", offsetY: "0", divisions: "24", thickness: "3", material: "acier" },
    (d) => {
      const t = solve(d);
      return typeof t === "string" ? "" : `Carré-rond ${format(num(d.length))} × ${format(num(d.width))} → Ø ${format(num(d.diameter))}`;
    },
  );

  const result = $derived(solve(doc.data));
  const t = $derived(typeof result === "string" ? null : result);
  const e = $derived(num(doc.data.thickness) || 0);
  const density = $derived(MATIERES.find((m) => m.id === doc.data.material)?.density ?? 7.85);
  const corners = ["C1", "C2", "C3", "C4"];

  function copyLengths(): void {
    if (!t) return;
    doc.copy(["Coin\tPoint\tVraie grandeur (mm)", ...t.trueLengths.map((l) => `${l.corner}\t${l.point}\t${format(l.length, 2)}`)].join("\n"));
  }

  function exportDxf(): void {
    if (!t) return;
    saveFile({ name: `tremie-${format(num(doc.data.length), 0)}x${format(num(doc.data.width), 0)}-${format(num(doc.data.diameter), 0)}.dxf`, content: patternDxf(t.pattern), extension: "dxf", description: "Dessin DXF" });
  }

  function print(): void {
    if (!t) return;
    printFiche(
      tracageFiche({
        kind: "Trémie carré-rond",
        subtitle: `${format(num(doc.data.length))} × ${format(num(doc.data.width))} → Ø ${format(num(doc.data.diameter))} · hauteur ${format(num(doc.data.height))} mm`,
        results: [
          { label: "Surface de tôle", value: `${format(t.area / 1e6, 3)} m²` },
          { label: "Masse", value: `${format(plateMass(t.area, e, density), 1)} kg` },
          { label: "Soudure", value: `${format(t.seam, 1)} mm`, detail: "milieu d'un côté → cercle" },
          { label: "Divisions du cercle", value: String(t.divisions) },
        ],
        pattern: t.pattern,
        customTable: {
          title: "Vraies grandeurs (coin → point du cercle)",
          headers: ["Coin", "Point", "Vraie grandeur (mm)"],
          rows: t.trueLengths.map((l) => [l.corner, String(l.point), format(l.length, 1)]),
        },
        note: "Points du cercle numérotés à partir du milieu du côté de la soudure, dans le sens trigonométrique. Lignes rouges : pliage léger.",
      }),
    );
  }
</script>

<div class="split">
  <Card title="Trémie carré-rond">
    <div class="two">
      <Field label="Longueur du rectangle" unit="mm" bind:value={doc.data.length} />
      <Field label="Largeur du rectangle" unit="mm" bind:value={doc.data.width} />
    </div>
    <div class="two">
      <Field label="Ø du cercle" unit="mm" bind:value={doc.data.diameter} />
      <Field label="Hauteur" unit="mm" bind:value={doc.data.height} />
    </div>
    <div class="two">
      <Field label="Décalage du cercle en longueur" unit="mm" bind:value={doc.data.offsetX} />
      <Field label="Décalage en largeur" unit="mm" bind:value={doc.data.offsetY} />
    </div>
    <div class="three">
      <Field label="Divisions du cercle" bind:value={doc.data.divisions} />
      <Field label="Épaisseur" unit="mm" bind:value={doc.data.thickness} />
      <SelectField label="Matière" options={MATIERES.map((m) => ({ value: m.id, label: m.label }))} bind:value={doc.data.material} />
    </div>
    <p class="hint">
      Dimensions à la fibre moyenne. Divisions : un multiple de 4 (24 conseillé). Soudure au milieu du côté en bout de longueur.
      La plus complexe des formes : vérifier la première pièce (gabarit papier ou maquette).
    </p>
  </Card>

  <Card title="Développé">
    {#snippet actions()}
      {#if t}
        <button class="btn" onclick={exportDxf}>Exporter en DXF</button>
        <button class="btn primary" onclick={print}>Imprimer le gabarit</button>
      {/if}
    {/snippet}
    {#if t}
      <div class="grid">
        <Result label="Surface de tôle" value={t.area / 1e6} unit="m²" decimals={3} big oncopy={doc.copy} />
        <Result label="Masse" value={plateMass(t.area, e, density)} unit="kg" decimals={1} big oncopy={doc.copy} />
      </div>
      <Result label="Longueur de la soudure" value={t.seam} unit="mm" oncopy={doc.copy} />
      <Flat pattern={t.pattern} height={320} />
      <div class="head">
        <b>Vraies grandeurs</b>
        <button class="btn" onclick={copyLengths}>Copier</button>
      </div>
      <div class="lengths">
        {#each corners as corner (corner)}
          <div>
            <h4>{corner}</h4>
            {#each t.trueLengths.filter((l) => l.corner === corner) as l (l.point)}
              <div class="line"><span>point {l.point}</span><b>{format(l.length, 1)}</b></div>
            {/each}
          </div>
        {/each}
      </div>
    {:else}
      <p class="empty">{result}</p>
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
  @media (max-width: 780px) {
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
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
  }
  .lengths {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 12px;
  }
  h4 {
    margin: 0 0 4px;
    font-size: 12.5px;
    color: var(--accent);
  }
  .line {
    display: flex;
    justify-content: space-between;
    font-size: 12.5px;
    padding: 2px 0;
    border-bottom: 1px solid var(--border);
  }
  .line span {
    color: var(--muted);
  }
  .line b {
    font-family: var(--mono);
    font-weight: 500;
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
