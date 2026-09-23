<script lang="ts">
  // Logo Établi, même dessin que l'icône de l'application (src-tauri/icons/source.svg).
  let { size = 32 }: { size?: number } = $props();
</script>

<span class="logo" style:--size="{size}px" aria-hidden="true">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 18h16M6 18V9l6-4 6 4v9" />
  </svg>
</span>

<style>
  .logo {
    width: var(--size);
    height: var(--size);
    border-radius: var(--r-md);
    background: var(--accent);
    color: var(--accent-text);
    display: grid;
    place-items: center;
    flex: none;
  }
  svg {
    width: 58%;
    height: 58%;
  }
</style>
