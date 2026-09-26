<script lang="ts">
  // Cote avec son côté de tôle : intérieure, moyenne (fibre neutre) ou extérieure. En dessous, la
  // cote à la fibre moyenne qui sert au développé.
  import { Field, format, evaluate } from "@etabli/ui";
  import { meanDiameter, type DiameterKind } from "./developpes";

  interface Props {
    label: string;
    value: string;
    kind: DiameterKind;
    /** Épaisseur de la tôle, pour afficher la cote moyenne. */
    thickness?: number;
    placeholder?: string;
  }

  let { label, value = $bindable(), kind = $bindable(), thickness = 0, placeholder = "" }: Props = $props();

  const KINDS: { value: DiameterKind; label: string; title: string }[] = [
    { value: "int", label: "Int", title: "Cote intérieure" },
    { value: "moy", label: "Moy", title: "Cote à la fibre moyenne" },
    { value: "ext", label: "Ext", title: "Cote extérieure" },
  ];

  const number = $derived(value.trim() === "" ? NaN : evaluate(value));
  const mean = $derived(number > 0 ? meanDiameter(number, thickness, kind) : NaN);
</script>

<div class="cote">
  <span class="label">{label}</span>
  <div class="row">
    <Field compact {label} unit="mm" bind:value {placeholder} />
    <div class="kinds" role="radiogroup" aria-label="{label} : côté de la tôle">
      {#each KINDS as k (k.value)}
        <button role="radio" aria-checked={kind === k.value} class:on={kind === k.value} title={k.title} onclick={() => (kind = k.value)}>
          {k.label}
        </button>
      {/each}
    </div>
  </div>
  <span class="hint">{Number.isFinite(mean) && kind !== "moy" && thickness > 0 ? `fibre moyenne ${format(mean, 2)} mm` : ""}</span>
</div>

<style>
  .cote {
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
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
  }
  .kinds {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--r-sm);
    background: var(--field);
  }
  button {
    height: 28px;
    padding: 0 7px;
    border: 0;
    border-radius: var(--r-xs);
    background: none;
    color: var(--muted);
    font: 500 12px var(--font);
    cursor: pointer;
  }
  button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }
  .hint {
    min-height: 16px;
    font-size: 12px;
    color: var(--faint);
  }
</style>
