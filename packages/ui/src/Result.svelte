<script lang="ts">
  // Valeur de résultat : un clic la copie (cahier des charges, section 5.6).
  import { format } from "./calc";

  interface Props {
    label: string;
    value: number;
    unit: string;
    decimals?: number;
    big?: boolean;
    oncopy: (text: string) => void;
  }

  let { label, value, unit, decimals = 2, big = false, oncopy }: Props = $props();

  const text = $derived(format(value, decimals));
</script>

<button class="result" class:big onclick={() => Number.isFinite(value) && oncopy(text)} title="Cliquer pour copier">
  <span class="label">{label}</span>
  <span class="value">
    {#key text}<span class="number">{text}</span>{/key}
    <small>{unit}</small>
  </span>
</button>

<style>
  .result {
    width: 100%;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface-2);
    text-align: left;
    cursor: copy;
  }
  .result:hover {
    border-color: var(--accent);
  }
  .label {
    color: var(--muted);
    font-size: 12.5px;
  }
  .value {
    font: 600 22px var(--mono);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .big .value {
    font-size: 30px;
    color: var(--accent);
  }
  small {
    margin-left: 4px;
    font-size: 13px;
    font-weight: 500;
    color: var(--faint);
  }
  .number {
    display: inline-block;
    animation: flash 0.4s ease-out;
    border-radius: var(--r-xs);
  }
  @keyframes flash {
    from {
      background: var(--accent-soft);
    }
    to {
      background: transparent;
    }
  }
</style>
