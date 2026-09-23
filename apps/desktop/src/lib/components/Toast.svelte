<script lang="ts">
  import { ui } from "$lib/state/ui.svelte";
</script>

{#if ui.toast}
  {#key ui.toast.id}
    <div class="toast" role="status">{ui.toast.text}</div>
  {/key}
{/if}

<style>
  .toast {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 50;
    max-width: 360px;
    background: var(--text);
    color: var(--surface);
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 13px;
    box-shadow: var(--shadow);
    animation: toast 0.2s ease-out;
  }
  @keyframes toast {
    from {
      transform: translateY(10px);
      opacity: 0;
    }
    to {
      transform: none;
      opacity: 1;
    }
  }
</style>
