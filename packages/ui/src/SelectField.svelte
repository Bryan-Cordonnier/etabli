<script lang="ts" generics="T extends string">
  interface Props {
    label: string;
    options: { value: T; label: string }[];
    value: T;
    compact?: boolean;
    onchange?: (value: T) => void;
  }

  let { label, options, value = $bindable(), compact = false, onchange }: Props = $props();
</script>

<label class="field" class:compact>
  {#if !compact}<span class="label">{label}</span>{/if}
  <span class="input">
    <select bind:value onchange={() => onchange?.(value)} aria-label={label}>
      {#each options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </span>
</label>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--muted);
  }
  .input {
    display: flex;
    align-items: center;
    height: 36px;
    padding: 0 6px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--field);
  }
  .compact .input {
    height: 32px;
  }
  .input:focus-within {
    border-color: var(--accent);
  }
  select {
    width: 100%;
    border: 0;
    outline: none;
    background: none;
    font: 500 14px var(--font);
    color: var(--text);
  }
</style>
