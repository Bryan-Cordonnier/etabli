<script lang="ts">
  // Bandeau discret sous les onglets quand une nouvelle version d'Établi est disponible.
  import { updates } from "$lib/state/updates.svelte";
  import { tabs } from "$lib/state/tabs.svelte";

  const visible = $derived(
    !updates.dismissed && (updates.status === "available" || updates.status === "downloading" || updates.status === "installing"),
  );
  const percent = $derived(Number.isFinite(updates.progress) ? Math.round(updates.progress * 100) : null);
</script>

{#if visible}
  <div class="banner" role="status">
    {#if updates.status === "available"}
      <span class="text"><b>Établi {updates.version}</b> est disponible.</span>
      <button class="link" onclick={() => tabs.navigate({ kind: "settings", section: "a-propos" })}>Voir les nouveautés</button>
      <span class="spacer"></span>
      <button class="btn primary small" onclick={() => void updates.install()}>Installer et redémarrer</button>
      <button class="btn small" onclick={() => (updates.dismissed = true)}>Plus tard</button>
    {:else}
      <span class="text">
        {updates.status === "installing" ? "Installation… Établi va redémarrer." : `Téléchargement d'Établi ${updates.version}${percent === null ? "…" : ` : ${percent} %`}`}
      </span>
      <span class="bar"><span style:width="{updates.status === 'installing' ? 100 : (percent ?? 30)}%"></span></span>
    {/if}
  </div>
{/if}

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--accent-soft);
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    animation: fade-in 0.18s ease-out;
  }
  .spacer {
    flex: 1;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .small {
    height: 28px;
    padding: 0 12px;
    font-size: 12.5px;
  }
  .bar {
    flex: 1;
    max-width: 320px;
    height: 6px;
    border-radius: 3px;
    background: var(--surface);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }
</style>
