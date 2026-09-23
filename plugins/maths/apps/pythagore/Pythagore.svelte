<script lang="ts">
  import { connect, type Etabli } from "@etabli/sdk";
  import { Field, Result, evaluate, format } from "@etabli/ui";

  /** Données enregistrées : le texte des champs, tel que saisi (calculs compris). */
  interface Data {
    a: string;
    b: string;
    c: string;
  }

  type Side = keyof Data;
  interface Solution {
    side: Side;
    a: number;
    b: number;
    c: number;
  }

  const LABELS: Record<Side, string> = { a: "Côté a", b: "Côté b", c: "Hypoténuse c" };

  let etabli: Etabli<Data> | undefined;
  let a = $state("");
  let b = $state("");
  let c = $state("");
  // Dernières données transmises : évite d'enregistrer un calcul que l'on vient seulement d'ouvrir.
  let lastSent = JSON.stringify({ a: "", b: "", c: "" });

  connect<Data>().then((host) => {
    const saved = host.document.data;
    if (saved) {
      a = saved.a ?? "";
      b = saved.b ?? "";
      c = saved.c ?? "";
    }
    lastSent = JSON.stringify({ a, b, c });
    etabli = host;
  });

  const solution = $derived.by((): Solution | string => {
    const values = { a: evaluate(a), b: evaluate(b), c: evaluate(c) };
    const filled = { a: a.trim() !== "", b: b.trim() !== "", c: c.trim() !== "" };
    const count = Object.values(filled).filter(Boolean).length;

    if (count < 2) return "Remplissez deux valeurs sur trois.";
    if (count === 3) return "Videz le champ de la valeur à calculer.";
    for (const side of ["a", "b", "c"] as const) {
      if (filled[side] && !(values[side] > 0)) return `${LABELS[side]} doit être un nombre positif.`;
    }
    if (!filled.c) return { side: "c", a: values.a, b: values.b, c: Math.hypot(values.a, values.b) };

    const known = filled.a ? values.a : values.b;
    if (values.c <= known) return "L'hypoténuse doit être plus longue que les deux autres côtés.";
    if (!filled.b) return { side: "b", a: values.a, b: Math.sqrt(values.c ** 2 - values.a ** 2), c: values.c };
    return { side: "a", a: Math.sqrt(values.c ** 2 - values.b ** 2), b: values.b, c: values.c };
  });

  const solved = $derived(typeof solution === "object" ? solution : null);
  const alpha = $derived(solved ? (Math.atan2(solved.a, solved.b) * 180) / Math.PI : NaN);

  // Enregistrement : à chaque modification des champs, les données partent au moteur.
  $effect(() => {
    const data = { a, b, c };
    const summary = solved ? `${LABELS[solved.side]} = ${format(solved[solved.side])} mm` : "";
    const json = JSON.stringify(data);
    if (!etabli || json === lastSent) return;
    lastSent = json;
    etabli.document.update(data);
    etabli.document.setSummary(summary);
  });

  const copy = (text: string) => etabli?.clipboard.copy(text);

  // Schéma du triangle rectangle, à l'échelle, dans un cadre de 420 × 230.
  const drawing = $derived.by(() => {
    if (!solved) return null;
    // Marge à gauche pour l'étiquette « a = … », écrite à gauche du côté vertical.
    const scale = Math.min(290 / solved.b, 170 / solved.a);
    const x0 = 110;
    const y0 = 195;
    const x1 = x0 + solved.b * scale;
    const y1 = y0 - solved.a * scale;
    return { x0, y0, x1, y1 };
  });
</script>

<div class="split">
  <section class="card">
    <h3>Entrées</h3>
    <Field label={LABELS.a} unit="mm" bind:value={a} placeholder={solved?.side === "a" ? format(solved.a) : "ex. 350"} />
    <Field label={LABELS.b} unit="mm" bind:value={b} placeholder={solved?.side === "b" ? format(solved.b) : "ex. 120"} />
    <Field label={LABELS.c} unit="mm" bind:value={c} placeholder={solved?.side === "c" ? format(solved.c) : "à calculer"} />
    <p class="hint">Remplissez deux valeurs sur trois. Les calculs sont acceptés : <code>1200 - 2*15</code></p>
  </section>

  <section class="card">
    <h3>Résultats</h3>
    {#if solved}
      <Result label={LABELS[solved.side]} value={solved[solved.side]} unit="mm" big oncopy={copy} />
      <div class="angles">
        <Result label="Angle α (opposé à a)" value={alpha} unit="°" oncopy={copy} />
        <Result label="Angle β (opposé à b)" value={90 - alpha} unit="°" oncopy={copy} />
      </div>
      {#if drawing}
        {@const d = drawing}
        <svg viewBox="0 0 420 230" role="img" aria-label="Schéma du triangle rectangle">
          <path class="shape" d="M{d.x0} {d.y0} H{d.x1} L{d.x0} {d.y1} Z" />
          <path class="square" d="M{d.x0 + 14} {d.y0} V{d.y0 - 14} H{d.x0}" />
          <text x={d.x0 - 10} y={(d.y0 + d.y1) / 2} text-anchor="end">a = {format(solved.a)}</text>
          <text x={(d.x0 + d.x1) / 2} y={d.y0 + 22} text-anchor="middle">b = {format(solved.b)}</text>
          <text class="hyp" x={(d.x0 + d.x1) / 2 + 10} y={(d.y0 + d.y1) / 2 - 8}>c = {format(solved.c)}</text>
        </svg>
      {/if}
    {:else}
      <p class="empty">{solution}</p>
    {/if}
  </section>
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
  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
  }
  h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--faint);
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
  code {
    font-family: var(--mono);
    color: var(--muted);
  }
  .angles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px;
  }
  svg {
    width: 100%;
    max-width: 440px;
    align-self: center;
  }
  .shape {
    fill: color-mix(in srgb, var(--accent) 10%, transparent);
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-linejoin: round;
  }
  .square {
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.5;
  }
  text {
    font: 500 13px var(--mono);
    fill: var(--muted);
  }
  .hyp {
    fill: var(--text);
    font-weight: 600;
  }
</style>
