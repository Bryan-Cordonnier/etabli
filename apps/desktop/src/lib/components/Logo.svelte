<script lang="ts">
  // Logo Établi. Mode « émojis » : 🛠️ sans fond, comme les plugins. Mode « icônes colorées » :
  // un établi vu de face (plateau, pieds, traverse) avec un étau, même dessin que l'icône de
  // l'application (src-tauri/icons/source.svg).
  import { settings } from "$lib/state/settings.svelte";

  let { size = 30 }: { size?: number } = $props();
</script>

{#if settings.iconStyle === "emoji"}
  <span class="logo emoji" style:--size="{size}px" aria-hidden="true">🛠️</span>
{:else}
  <span class="logo drawn" style:--size="{size}px" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4.5" y="4" width="5" height="3.5" rx="0.8" fill="currentColor" stroke="none" />
      <rect x="2.5" y="8" width="19" height="3.2" rx="1" fill="currentColor" stroke="none" />
      <path d="M6 11v8.5M18 11v8.5M6 15.5h12" />
    </svg>
  </span>
{/if}

<style>
  .logo {
    width: var(--size);
    height: var(--size);
    display: grid;
    place-items: center;
    flex: none;
  }
  .drawn {
    border-radius: calc(var(--size) * 0.28);
    background: var(--accent);
    color: var(--accent-text);
  }
  .emoji {
    font-size: calc(var(--size) * 0.8);
    line-height: 1;
  }
  svg {
    width: 62%;
    height: 62%;
  }
</style>
