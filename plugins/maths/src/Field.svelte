<script lang="ts">
  // Champ numérique : unité affichée, calculs acceptés (« 1200 - 2*15 »), erreur sous le champ.
  import { evaluate, format, isExpression } from "./calc";

  interface Props {
    label: string;
    value?: string;
    unit: string;
    /** Valeur calculée affichée en filigrane quand le champ est vide. */
    placeholder?: string;
  }

  let { label, value = $bindable(""), unit, placeholder = "" }: Props = $props();

  const result = $derived(evaluate(value));
  const invalid = $derived(value.trim() !== "" && Number.isNaN(result));
  const hint = $derived(invalid ? "Calcul non reconnu" : isExpression(value) ? `= ${format(result, 3)}` : "");
</script>

<label class="field">
  <span class="label">{label}</span>
  <span class="input" class:invalid>
    <input bind:value {placeholder} inputmode="decimal" autocomplete="off" spellcheck="false" />
    <span class="unit">{unit}</span>
  </span>
  <span class="hint" class:bad={invalid}>{hint}</span>
</label>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--muted);
  }
  .input {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--field);
    transition: border-color 0.12s;
  }
  .input:focus-within {
    border-color: var(--accent);
    background: var(--surface);
  }
  .input.invalid {
    border-color: var(--err);
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: none;
    font: 500 14px var(--mono);
    font-variant-numeric: tabular-nums;
  }
  input::placeholder {
    color: var(--faint);
    font-style: italic;
  }
  .unit {
    color: var(--faint);
    font-size: 12px;
  }
  .hint {
    min-height: 16px;
    font-size: 12px;
    color: var(--faint);
  }
  .hint.bad {
    color: var(--err);
  }
</style>
