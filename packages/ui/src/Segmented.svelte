<script lang="ts" generics="T extends string">
  interface Props {
    options: { value: T; label: string }[];
    value: T;
    label: string;
    onchange?: (value: T) => void;
  }

  let { options, value = $bindable(), label, onchange }: Props = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
  {#each options as option (option.value)}
    <button
      class:on={value === option.value}
      role="radio"
      aria-checked={value === option.value}
      onclick={() => {
        value = option.value;
        onchange?.(option.value);
      }}
    >
      {option.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    align-self: flex-start;
    flex-wrap: wrap;
    background: var(--field);
    border-radius: 10px;
    padding: 3px;
    gap: 2px;
  }
  button {
    height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    font-weight: 500;
    font-size: 13px;
    white-space: nowrap;
  }
  button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
</style>
