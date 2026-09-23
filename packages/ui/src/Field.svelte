<script lang="ts">
  // Champ de saisie. Numérique par défaut : unité affichée, calculs acceptés (« 1200 - 2*15 »),
  // résultat du calcul et erreur sous le champ. `compact` : sans libellé ni ligne d'aide (tableaux).
  import { evaluate, format, isExpression } from "./calc";

  interface Props {
    label?: string;
    value?: string;
    unit?: string;
    /** Texte en filigrane quand le champ est vide (valeur calculée, exemple). */
    placeholder?: string;
    /** false : texte libre (repère, nom de profilé…). */
    numeric?: boolean;
    compact?: boolean;
    oninput?: () => void;
  }

  let {
    label = "",
    value = $bindable(""),
    unit = "",
    placeholder = "",
    numeric = true,
    compact = false,
    oninput,
  }: Props = $props();

  const result = $derived(numeric ? evaluate(value) : NaN);
  const invalid = $derived(numeric && value.trim() !== "" && Number.isNaN(result));
  const hint = $derived(invalid ? "Calcul non reconnu" : numeric && isExpression(value) ? `= ${format(result, 3)}` : "");
</script>

<label class="field" class:compact>
  {#if label && !compact}<span class="label">{label}</span>{/if}
  <span class="input" class:invalid class:text={!numeric} title={compact ? hint : undefined}>
    <input
      bind:value
      {placeholder}
      {oninput}
      inputmode={numeric ? "decimal" : "text"}
      autocomplete="off"
      spellcheck="false"
      aria-label={label || placeholder}
    />
    {#if unit}<span class="unit">{unit}</span>{/if}
  </span>
  {#if !compact}<span class="hint" class:bad={invalid}>{hint}</span>{/if}
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
    gap: 6px;
    height: 36px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--field);
    transition: border-color 0.12s;
  }
  .compact .input {
    height: 32px;
    padding: 0 8px;
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
  .text input {
    font-family: var(--font);
  }
  input::placeholder {
    color: var(--faint);
    font-style: italic;
  }
  .unit {
    color: var(--faint);
    font-size: 12px;
    white-space: nowrap;
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
