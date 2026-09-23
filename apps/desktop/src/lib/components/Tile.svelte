<script lang="ts">
  // Tuile d'icône d'un plugin ou d'une mini-app : icône colorée, ou émoji seul (réglage « Icônes »).
  import type { IconName } from "$lib/icons";
  import { settings } from "$lib/state/settings.svelte";
  import Icon from "./Icon.svelte";

  interface Props {
    color: string;
    icon: IconName;
    emoji: string;
    /** solid : icône blanche sur la couleur ; soft : icône colorée sur une teinte légère ;
     *  plain : icône neutre (Accueil). */
    variant?: "solid" | "soft" | "plain";
    size?: number;
  }

  let { color, icon, emoji, variant = "solid", size = 40 }: Props = $props();
</script>

{#if settings.iconStyle === "emoji"}
  <span class="tile emoji" style:--size="{size}px" aria-hidden="true">{emoji}</span>
{:else}
  <span class="tile {variant}" style:--c={color} style:--size="{size}px" aria-hidden="true">
    <Icon name={icon} size={Math.round(size * 0.5)} />
  </span>
{/if}

<style>
  .tile {
    width: var(--size);
    height: var(--size);
    border-radius: var(--r-md);
    display: grid;
    place-items: center;
    flex: none;
  }
  .solid {
    background: var(--c);
    color: #fff;
  }
  .soft {
    background: color-mix(in srgb, var(--c) 15%, transparent);
    color: var(--c);
  }
  .plain {
    background: var(--field);
    color: var(--muted);
  }
  .emoji {
    font-size: calc(var(--size) * 0.7);
    line-height: 1;
  }
</style>
