<script lang="ts">
  // Développé de pliage (cahier des charges des plugins, section 4.1) : la longueur du flan
  // à découper et la position des lignes de pli, à partir des cotes du plan.
  import { Card, Field, MiniAppDocument, Result, Segmented, SelectField, evaluate, format, sendTo } from "@etabli/ui";
  import { MATIERES, kFactor, matiere, minFlange, recommendedVee, unfold, type UnfoldResult } from "../../src/pliage";

  interface Data {
    material: string;
    thickness: string;
    radius: string;
    /** Largeur de la pièce (longueur des plis) : pour la masse et l'envoi au calepinage. */
    width: string;
    dims: "ext" | "int";
    method: "k" | "deduction";
    k: string;
    deduction: string;
    flanges: string[];
    bends: { angle: string; up: boolean }[];
  }

  const PROFILES: Record<string, { flanges: string[]; bends: { angle: string; up: boolean }[] }> = {
    L: { flanges: ["50", "50"], bends: [{ angle: "90", up: true }] },
    U: { flanges: ["30", "50", "30"], bends: [{ angle: "90", up: true }, { angle: "90", up: true }] },
    Z: { flanges: ["30", "50", "30"], bends: [{ angle: "90", up: true }, { angle: "90", up: false }] },
    Chapeau: {
      flanges: ["20", "30", "40", "30", "20"],
      bends: [
        { angle: "90", up: true },
        { angle: "90", up: false },
        { angle: "90", up: false },
        { angle: "90", up: true },
      ],
    },
  };

  const DEFAULTS: Data = {
    material: "s235",
    thickness: "2",
    radius: "",
    width: "",
    dims: "ext",
    method: "k",
    k: "",
    deduction: "",
    ...structuredClone(PROFILES.L!),
  };

  const num = (text: string) => (text.trim() === "" ? NaN : evaluate(text));
  const thicknessOf = (d: Data) => num(d.thickness);
  /** Rayon intérieur : celui saisi, sinon l'épaisseur (rayon courant en pliage en l'air). */
  const radiusOf = (d: Data) => (d.radius.trim() === "" ? thicknessOf(d) : num(d.radius));
  const kOf = (d: Data) => (d.k.trim() === "" ? kFactor(radiusOf(d), thicknessOf(d)) : num(d.k));

  function solve(d: Data): UnfoldResult | string {
    if (!Number.isFinite(thicknessOf(d))) return "Renseignez l'épaisseur de la tôle.";
    if (d.method === "deduction" && d.deduction.trim() === "") return "Renseignez la déduction par pli de vos tables.";
    return unfold({
      thickness: thicknessOf(d),
      radius: radiusOf(d),
      flanges: d.flanges.map(num),
      bends: d.bends.map((b) => ({ angle: num(b.angle), up: b.up })),
      dims: d.dims,
      method: d.method,
      k: kOf(d),
      deduction: num(d.deduction),
    });
  }

  const doc = new MiniAppDocument<Data>(DEFAULTS, (d) => {
    const r = solve(d);
    return typeof r === "string" ? "" : `Développé = ${format(r.developed)} mm`;
  });

  const result = $derived(solve(doc.data));
  const r = $derived(typeof result === "string" ? null : result);
  const m = $derived(matiere(doc.data.material));
  const e = $derived(thicknessOf(doc.data));
  const ri = $derived(radiusOf(doc.data));
  const width = $derived(num(doc.data.width));
  const vee = $derived(e > 0 ? recommendedVee(e) : NaN);

  const warnings = $derived.by(() => {
    const list: string[] = [];
    if (!(e > 0)) return list;
    if (ri < m.rayonMini * e - 1e-9) {
      list.push(`Rayon intérieur ${format(ri)} mm : sous le rayon mini conseillé pour ${m.nom} (${format(m.rayonMini * e)} mm), risque de fissure.`);
    }
    const mini = minFlange(vee);
    doc.data.flanges.forEach((f, i) => {
      const length = num(f);
      if (length > 0 && length < mini) list.push(`Aile ${i + 1} (${format(length)} mm) : plus courte que l'aile mini pour le vé conseillé de ${format(vee)} (≈ ${format(mini, 0)} mm).`);
    });
    if (doc.data.method === "deduction" && doc.data.bends.some((b) => Math.abs(num(b.angle) - 90) > 1e-6)) {
      list.push("Déduction : valable pour l'angle de pliage de vos tables (en général 90°).");
    }
    return list;
  });

  function loadProfile(name: string): void {
    const p = structuredClone(PROFILES[name]!);
    doc.data.flanges = p.flanges;
    doc.data.bends = p.bends;
  }

  function addFlange(): void {
    doc.data.bends.push({ angle: "90", up: doc.data.bends.at(-1)?.up ?? true });
    doc.data.flanges.push("30");
  }

  function removeFlange(): void {
    if (doc.data.flanges.length <= 2) return;
    doc.data.flanges.pop();
    doc.data.bends.pop();
  }

  const mass = $derived(r && width > 0 ? (r.developed * width * e * m.masseVolumique) / 1e6 : NaN);

  /** Le flan part au calepinage : un rectangle largeur × développé, sens imposé (plis en travers du laminage). */
  function send(): void {
    if (!r || !(width > 0)) return;
    sendTo("piece-plate", {
      name: `Flan plié (${doc.data.flanges.map((f) => format(num(f))).join(" / ")})`,
      length: Math.round(r.developed * 10) / 10,
      width,
      quantity: 1,
      grain: true,
      thickness: e,
      family: m.id.startsWith("inox") ? "inox" : m.id.startsWith("alu") ? "alu" : m.id === "cuivre" ? "cuivre" : m.id === "laiton" ? "laiton" : m.id === "dx51d" ? "galva" : "acier",
    });
  }

  // Profil plié : l'arête extérieure, dessinée à l'échelle dans un cadre de 380 × 190.
  const profile = $derived.by(() => {
    const lengths = doc.data.flanges.map(num);
    if (lengths.some((l) => !(l > 0))) return null;
    let [x, y, heading] = [0, 0, 0];
    const points: [number, number][] = [[0, 0]];
    const labels: { x: number; y: number; text: string }[] = [];
    lengths.forEach((length, i) => {
      const [nx, ny] = [x + length * Math.cos(heading), y + length * Math.sin(heading)];
      labels.push({ x: (x + nx) / 2, y: (y + ny) / 2, text: format(length) });
      [x, y] = [nx, ny];
      points.push([x, y]);
      const bend = doc.data.bends[i];
      if (bend) heading += ((180 - num(bend.angle)) * Math.PI) / 180 * (bend.up ? 1 : -1);
    });
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const scale = Math.min(320 / Math.max(maxX - minX, 1), 140 / Math.max(maxY - minY, 1));
    // Y vers le haut à l'écran : on inverse.
    const px = (p: number) => 30 + (p - minX) * scale;
    const py = (p: number) => 165 - (p - minY) * scale;
    return {
      path: points.map((p, i) => `${i ? "L" : "M"}${px(p[0]).toFixed(1)} ${py(p[1]).toFixed(1)}`).join(" "),
      stroke: Math.max(2, Math.min(8, e * scale)),
      labels: labels.map((l) => ({ x: px(l.x), y: py(l.y), text: l.text })),
    };
  });

  // Flan déplié avec ses lignes de pli.
  const blank = $derived.by(() => {
    if (!r) return null;
    const W = 340;
    const scale = W / r.developed;
    const h = width > 0 ? Math.min(90, Math.max(30, width * scale)) : 50;
    return { W, h, scale, lines: r.bendLines.map((pos) => ({ x: 20 + pos * scale, pos })) };
  });
</script>

<div class="split">
  <div class="inputs">
    <Card title="Tôle">
      <SelectField label="Matière" options={MATIERES.map((x) => ({ value: x.id, label: x.nom }))} bind:value={doc.data.material} />
      <div class="three">
        <Field label="Épaisseur" unit="mm" bind:value={doc.data.thickness} />
        <Field label="Rayon intérieur" unit="mm" bind:value={doc.data.radius} placeholder={Number.isFinite(e) ? format(e) : ""} />
        <Field label="Largeur de pli" unit="mm" bind:value={doc.data.width} placeholder="facultatif" />
      </div>
      <Segmented
        label="Cotes du plan"
        options={[
          { value: "ext", label: "Cotes extérieures" },
          { value: "int", label: "Cotes intérieures" },
        ]}
        bind:value={doc.data.dims}
      />
      <Segmented
        label="Méthode"
        options={[
          { value: "k", label: "Facteur K" },
          { value: "deduction", label: "Déduction de pli" },
        ]}
        bind:value={doc.data.method}
      />
      {#if doc.data.method === "k"}
        <Field
          label="Facteur K"
          bind:value={doc.data.k}
          placeholder={Number.isFinite(e) ? `${format(kFactor(ri, e), 3)} (DIN 6935)` : ""}
        />
      {:else}
        <Field label="Déduction par pli (tables de l'atelier)" unit="mm" bind:value={doc.data.deduction} />
      {/if}
    </Card>

    <Card title="Profil">
      <div class="types" role="group" aria-label="Profils types">
        {#each Object.keys(PROFILES) as name (name)}
          <button class="btn" onclick={() => loadProfile(name)}>{name}</button>
        {/each}
      </div>
      <div class="profile">
        {#each doc.data.flanges as _, i (i)}
          <div class="row">
            <span class="tag">Aile {i + 1}</span>
            <Field compact label="Longueur de l'aile {i + 1}" unit="mm" bind:value={doc.data.flanges[i]} />
          </div>
          {#if doc.data.bends[i]}
            {@const bend = doc.data.bends[i]}
            <div class="row bend">
              <span class="tag">Pli {i + 1}</span>
              <Field compact label="Angle entre les ailes" unit="°" bind:value={bend.angle} />
              <button class="dir" onclick={() => (bend.up = !bend.up)} title="Sens du pli (pour le dessin)" aria-label="Sens du pli {i + 1}">
                {bend.up ? "↰ gauche" : "↱ droite"}
              </button>
            </div>
          {/if}
        {/each}
      </div>
      <div class="types">
        <button class="btn" onclick={addFlange}>+ Aile</button>
        <button class="btn" onclick={removeFlange} disabled={doc.data.flanges.length <= 2}>− Aile</button>
      </div>
      <p class="hint">Angle entre les deux ailes : 90° pour une équerre, 135° pour un pli ouvert. Le sens du pli ne sert qu'au dessin.</p>
    </Card>
  </div>

  <Card title="Développé">
    {#snippet actions()}
      {#if r && width > 0}<button class="btn" onclick={send}>Envoyer au calepinage</button>{/if}
    {/snippet}
    {#each warnings as w (w)}
      <p class="warn">{w}</p>
    {/each}
    {#if r}
      <Result label="Longueur développée" value={r.developed} unit="mm" big oncopy={doc.copy} />
      <div class="grid">
        {#if doc.data.method === "k"}
          <Result label="Facteur K" value={kOf(doc.data)} unit="" decimals={3} oncopy={doc.copy} />
          {#if r.bends.every((b) => Math.abs(b.alpha - r.bends[0]!.alpha) < 1e-9)}
            <!-- Tous les plis au même angle : une seule valeur, comparable aux tables de l'atelier. -->
            <Result label="Longueur d'un pli à {format(r.bends[0]!.alpha)}°" value={r.bends[0]!.allowance} unit="mm" decimals={3} oncopy={doc.copy} />
            <Result label="Déduction par pli" value={r.bends[0]!.deduction} unit="mm" decimals={3} oncopy={doc.copy} />
          {/if}
        {/if}
        {#if width > 0}
          <Result label="Flan" value={width} unit={`× ${format(r.developed)} mm`} oncopy={doc.copy} />
          <Result label="Masse du flan" value={mass} unit="kg" decimals={3} oncopy={doc.copy} />
        {/if}
      </div>

      {#if profile}
        <svg class="drawing" viewBox="0 0 380 190" role="img" aria-label="Profil plié">
          <path class="bent" d={profile.path} stroke-width={profile.stroke} />
          {#each profile.labels as l, i (i)}
            <text x={l.x} y={l.y - 8} text-anchor="middle">{l.text}</text>
          {/each}
        </svg>
      {/if}

      {#if blank}
        <svg class="drawing" viewBox="0 0 380 {blank.h + 50}" role="img" aria-label="Flan déplié">
          <rect class="flat" x="20" y="10" width={blank.W} height={blank.h} />
          {#each blank.lines as line, i (i)}
            <line class="fold" x1={line.x} y1="4" x2={line.x} y2={blank.h + 16} />
            <text x={line.x} y={blank.h + 32} text-anchor="middle">{format(line.pos, 1)}</text>
          {/each}
          <text x="20" y={blank.h + 46}>0</text>
          <text x={20 + blank.W} y={blank.h + 46} text-anchor="end">{format(r.developed, 1)}</text>
        </svg>
      {/if}

      <table>
        <thead><tr><th>Partie</th><th class="r">Longueur</th><th class="r">Ligne de pli (cote cumulée)</th></tr></thead>
        <tbody>
          {#each r.parts as part, i (i)}
            <tr>
              <td>{part.kind === "aile" ? `Aile ${part.index + 1} (partie droite)` : `Pli ${part.index + 1} (${format(r.bends[part.index]!.alpha)}°)`}</td>
              <td class="r">{format(part.length, 2)}</td>
              <td class="r">
                {#if part.kind === "pli" || (doc.data.method === "deduction" && r.bendLines[part.index] !== undefined)}
                  <button onclick={() => doc.copy(format(r.bendLines[part.index]!, 2))} title="Copier">{format(r.bendLines[part.index]!, 2)}</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="hint">Lignes de pli au milieu de chaque pli, cotées depuis le bord gauche du flan : pour le traçage ou la butée de la presse.</p>
    {:else}
      <p class="empty">{result}</p>
    {/if}
  </Card>
</div>

<style>
  .split {
    display: grid;
    grid-template-columns: minmax(340px, 400px) 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 820px) {
    .split {
      grid-template-columns: 1fr;
    }
  }
  .inputs {
    display: flex;
    flex-direction: column;
    gap: 16px;
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
  .types {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .profile {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row {
    display: grid;
    grid-template-columns: 56px 1fr;
    gap: 8px;
    align-items: center;
  }
  .row.bend {
    grid-template-columns: 56px 1fr 90px;
    padding-left: 12px;
  }
  .tag {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .bend .tag {
    color: var(--accent);
  }
  .dir {
    height: 32px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface);
    color: var(--muted);
    font-size: 12.5px;
    cursor: pointer;
    user-select: none;
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
  .drawing {
    width: 100%;
    max-width: 420px;
    align-self: center;
  }
  .bent {
    fill: none;
    stroke: var(--accent);
    stroke-linejoin: round;
    stroke-linecap: square;
  }
  .flat {
    fill: color-mix(in srgb, var(--accent) 10%, transparent);
    stroke: var(--text);
    stroke-width: 1.5;
  }
  .fold {
    stroke: var(--accent);
    stroke-width: 1.4;
    stroke-dasharray: 6 4;
  }
  text {
    font: 500 11.5px var(--mono);
    fill: var(--muted);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--faint);
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 5px 8px;
    border-bottom: 1px solid var(--border);
  }
  .r {
    text-align: right;
    font-family: var(--mono);
  }
  td button {
    border: 0;
    background: none;
    padding: 2px 6px;
    margin: 0 -6px;
    border-radius: var(--r-xs);
    font: 500 13px var(--mono);
    color: var(--text);
    cursor: copy;
  }
  td button:hover {
    background: var(--accent-soft);
  }
</style>
