<script lang="ts">
  // Anneau SVG de répartition (par exemple les dépenses du mois par catégorie) avec sa légende : l'identité ne repose jamais sur la couleur
  // seule (chaque part est nommée dans la légende, avec sa valeur et son pourcentage). Au plus 8 parts ; le reste est regroupé en « Autres ».
  // Les textes portent les jetons du thème ; seules les pastilles de la légende et les secteurs prennent la couleur de la part.
  import { COLORS } from "./colors";
  import { regrouper, secteurs } from "./charts";

  interface Props {
    parts: { label: string; value: number }[];
    /** Écrit une valeur (légende, centre). */
    format?: (value: number) => string;
    title: string;
    /** Texte sous le total, au centre de l'anneau. */
    centre?: string;
  }

  let { parts, format = String, title, centre = "" }: Props = $props();

  const R = 70;
  const regroupees = $derived(regrouper(parts));
  const total = $derived(regroupees.reduce((s, p) => s + p.value, 0));
  const arcs = $derived(secteurs(regroupees.map((p) => p.value), R, 22, 2));
  const couleur = (i: number, label: string) => (label === "Autres" && i === COLORS.length - 1 ? "var(--faint)" : COLORS[i % COLORS.length]!);
  /** Pourcentage entier (arrondi au plus proche) : sert seulement à l'affichage. */
  const pourcent = (v: number) => (total > 0 ? Math.round((v * 100) / total) : 0);
  let actif = $state<number | null>(null);
</script>

<figure>
  <svg viewBox="-80 -80 160 160" role="img" aria-label={title}>
    <title>{title}</title>
    {#each arcs as a, i (i)}
      {#if a.d}
        <path
          d={a.d}
          fill-rule="evenodd"
          fill={couleur(i, regroupees[i]!.label)}
          opacity={actif === null || actif === i ? 1 : 0.35}
          onpointerenter={() => (actif = i)}
          onpointerleave={() => (actif = null)}
          role="presentation"
        />
      {/if}
    {/each}
    <text class="total" x="0" y={centre ? -2 : 4} text-anchor="middle">{actif === null ? format(total) : format(regroupees[actif]!.value)}</text>
    {#if centre}<text class="centre" x="0" y="14" text-anchor="middle">{actif === null ? centre : regroupees[actif]!.label}</text>{/if}
  </svg>
  {#if regroupees.length === 0}
    <p class="vide">Rien à répartir.</p>
  {:else}
    <ul>
      {#each regroupees as p, i (p.label)}
        <li onpointerenter={() => (actif = i)} onpointerleave={() => (actif = null)}>
          <span class="pastille" style:background={couleur(i, p.label)}></span>
          <span class="nom">{p.label}</span>
          <span class="valeur">{format(p.value)}</span>
          <span class="pct">{pourcent(p.value)} %</span>
        </li>
      {/each}
    </ul>
  {/if}
</figure>

<style>
  figure {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    margin: 0;
  }
  svg {
    flex: 0 0 160px;
    width: 160px;
    height: 160px;
  }
  path {
    transition: opacity 120ms;
  }
  .total {
    fill: var(--text);
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .centre {
    fill: var(--muted);
    font-size: 10px;
  }
  ul {
    flex: 1 1 200px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto 3.4em;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: var(--text);
  }
  .pastille {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  .nom {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .valeur,
  .pct {
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  .pct {
    color: var(--muted);
  }
  .vide {
    margin: 0;
    font-size: 12.5px;
    color: var(--faint);
  }
</style>
