<script lang="ts">
  // Héberge les cadres invisibles des fournisseurs de service (state/appels.svelte.ts). À monter une fois par fenêtre.
  import { hote } from "$lib/state/appels.svelte";
  import ServiceFrame from "./ServiceFrame.svelte";
</script>

{#each hote.cadres as cadre (cadre.invocation.id)}
  <ServiceFrame {cadre} />
{/each}
