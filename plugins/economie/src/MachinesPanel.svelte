<script lang="ts">
  // Édition de la bibliothèque Machines : partagée par toutes les mini-apps d'Économie,
  // enregistrée par le moteur dès qu'on la modifie.
  import { Check, Field, SelectField, type PluginSettings } from "@etabli/ui";
  import { SAW_TYPES, newSaw, newShear, type EconomieSettings } from "./machines";

  interface Props {
    store: PluginSettings<EconomieSettings>;
    /** Scies (débit de tubes), cisailles (calepinage), ou les deux. */
    kinds?: ("saws" | "shears")[];
  }

  let { store, kinds = ["saws", "shears"] }: Props = $props();
  const machines = $derived(store.data.machines);
</script>

<div class="panel">
  {#if kinds.includes("saws")}
    <section>
      <h4>Scies</h4>
      {#each machines.saws as saw, i (saw.id)}
        <div class="machine">
          <div class="line">
            <Field label="Nom" numeric={false} bind:value={saw.name} />
            <SelectField label="Type" options={SAW_TYPES} bind:value={saw.type} />
            <button class="remove" onclick={() => machines.saws.splice(i, 1)} aria-label="Supprimer la scie {saw.name}" title="Supprimer">✕</button>
          </div>
          <div class="grid">
            <Field label="Trait de scie" unit="mm" bind:value={saw.kerf} />
            <Field label="Angle maxi" unit="°" bind:value={saw.maxAngle} />
            <Field label="Longueur mini" unit="mm" bind:value={saw.minLength} />
            <Field label="Dressage" unit="mm" bind:value={saw.trim} />
          </div>
          <div class="checks">
            <Check label="Tourne des deux côtés" bind:checked={saw.bothSides} />
            <Check label="Butée de longueur" bind:checked={saw.hasStop} />
            {#if saw.hasStop}
              <div class="stop"><Field compact label="Course maxi de la butée" unit="mm" placeholder="course" bind:value={saw.stopMax} /></div>
            {/if}
          </div>
        </div>
      {/each}
      <button class="btn" onclick={() => machines.saws.push(newSaw())}>+ Ajouter une scie</button>
    </section>
  {/if}

  {#if kinds.includes("shears")}
    <section>
      <h4>Cisailles</h4>
      {#each machines.shears as shear, i (shear.id)}
        <div class="machine">
          <div class="line">
            <Field label="Nom" numeric={false} bind:value={shear.name} />
            <button class="remove" onclick={() => machines.shears.splice(i, 1)} aria-label="Supprimer la cisaille {shear.name}" title="Supprimer">✕</button>
          </div>
          <div class="grid">
            <Field label="Longueur de lame" unit="mm" bind:value={shear.bladeLength} />
            <Field label="Épaisseur maxi (acier)" unit="mm" bind:value={shear.maxThickness} />
            <Field label="Butée arrière maxi" unit="mm" bind:value={shear.gaugeMax} />
            <Field label="Dressage" unit="mm" bind:value={shear.trim} />
          </div>
        </div>
      {/each}
      <button class="btn" onclick={() => machines.shears.push(newShear())}>+ Ajouter une cisaille</button>
    </section>
  {/if}
  <p class="hint">Enregistré pour toutes les mini-apps d'Économie de matière.</p>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
  .machine {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px 8px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-2);
  }
  .line {
    display: grid;
    grid-template-columns: 1fr auto 28px;
    gap: 8px;
    align-items: start;
  }
  .line:has(> :nth-child(2):last-child) {
    grid-template-columns: 1fr 28px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 8px;
  }
  .checks {
    display: flex;
    align-items: center;
    gap: 6px 18px;
    flex-wrap: wrap;
    min-height: 32px;
  }
  .stop {
    width: 150px;
  }
  .remove {
    width: 28px;
    height: 28px;
    margin-top: 22px;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--faint);
  }
  .remove:hover {
    background: var(--field);
    color: var(--err);
  }
  .btn {
    align-self: flex-start;
  }
  .hint {
    margin: 0;
    font-size: 12.5px;
    color: var(--faint);
  }
</style>
