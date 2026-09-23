<script lang="ts">
  interface Props {
    label: string;
    checked?: boolean;
    hint?: string;
    onchange?: (checked: boolean) => void;
  }

  let { label, checked = $bindable(false), hint = "", onchange }: Props = $props();
</script>

<label class="check">
  <input type="checkbox" bind:checked onchange={() => onchange?.(checked)} />
  <span class="text">
    {label}
    {#if hint}<small>{hint}</small>{/if}
  </span>
</label>

<style>
  .check {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
  }
  input {
    width: 16px;
    height: 16px;
    margin: 2px 0 0;
    accent-color: var(--accent);
    flex: none;
  }
  .text {
    display: flex;
    flex-direction: column;
    font-size: 13.5px;
  }
  small {
    color: var(--faint);
    font-size: 12px;
  }
</style>
