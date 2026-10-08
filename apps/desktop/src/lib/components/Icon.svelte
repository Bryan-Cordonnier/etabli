<script lang="ts">
  import { distribution } from "$lib/distribution";
  import { ICONS, type IconName } from "$lib/icons";

  interface Props {
    /** Une icône d'Établi, ou une icône propre à la distribution (distribution.json). */
    name: string;
    size?: number;
    strokeWidth?: number;
    fill?: string;
  }

  let { name, size = 20, strokeWidth = 2, fill = "none" }: Props = $props();

  const propre = $derived(distribution.icons[name]);
  const Glyph = $derived(ICONS[name as IconName] ?? ICONS.puzzle);
</script>

{#if propre}
  <!-- Dessin de la distribution, validé à la lecture (formes SVG simples seulement). -->
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">{@html propre}</svg>
{:else}
  <Glyph {size} {strokeWidth} {fill} aria-hidden="true" />
{/if}
