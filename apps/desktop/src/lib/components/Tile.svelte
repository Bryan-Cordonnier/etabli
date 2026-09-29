<script lang="ts">
  // Tuile d'icône d'un plugin ou d'une mini-app : une icône de la liste fermée (lib/icons.ts) sur la
  // couleur du plugin. Pas d'émoji : un plugin indépendant n'a qu'un nom d'icône et une couleur à fournir.
  import type { IconName } from "$lib/icons";
  import Icon from "./Icon.svelte";

  interface Props {
    color: string;
    icon: IconName;
    /** solid : icône blanche sur la couleur ; soft : icône colorée sur une teinte légère ;
     *  plain : icône neutre (Accueil). */
    variant?: "solid" | "soft" | "plain";
    size?: number;
  }

  let { color, icon, variant = "solid", size = 40 }: Props = $props();
</script>

<span class="tile {variant}" style:--c={color} style:--size="{size}px" aria-hidden="true">
  <Icon name={icon} size={Math.round(size * 0.5)} />
</span>

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
</style>
