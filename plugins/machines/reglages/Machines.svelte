<script lang="ts">
  // Réglages du plugin Machines : les scies et les cisailles de l'atelier. Enregistré dès qu'on modifie
  // un champ, et publié aux plugins qui en dépendent (service « machines »).
  import { SAW_TYPES, type Machine, type MachinesData, type Saw, type Shear } from "@etabli/sdk";
  import { Check, Icon, PluginSettings } from "@etabli/ui";
  import { tick } from "svelte";
  import { GROUPS, cleanMachines, newMachine, requestedKind, setNumber } from "../src/machines";

  const settings = new PluginSettings<MachinesData>(
    { machines: [] },
    (saved) => ({ machines: cleanMachines((saved as { machines?: unknown } | null)?.machines) }),
    "machines",
  );

  /** Machine qui vient d'être ajoutée : on la montre et on place le curseur sur son nom. */
  let highlight = $state<string | null>(null);

  async function add(kind: Machine["kind"]): Promise<void> {
    const machine = newMachine(kind);
    settings.data.machines.push(machine);
    highlight = machine.id;
    await tick();
    const card = document.querySelector<HTMLElement>(`[data-machine="${machine.id}"]`);
    card?.scrollIntoView({ block: "center", behavior: "smooth" });
    card?.querySelector<HTMLInputElement>("input.name")?.focus();
    setTimeout(() => (highlight = null), 1600);
  }

  // « + Ajouter une machine… » d'un calcul : le moteur ouvre cette page avec « #add=scie » ou « #add=cisaille ».
  let requested = false;
  $effect(() => {
    if (!settings.ready || requested) return;
    requested = true;
    const kind = requestedKind(location.hash);
    if (kind) void add(kind);
  });
</script>

{#snippet number(machine: Machine, key: string, label: string, unit: string)}
  <label class="num-field">
    <span>{label}</span>
    <span class="input">
      <input
        inputmode="decimal"
        value={(machine as unknown as Record<string, number | null>)[key] ?? ""}
        onchange={(e) => setNumber(machine, key as keyof Machine, e.currentTarget.value)}
      />
      <small>{unit}</small>
    </span>
  </label>
{/snippet}

{#snippet saw(m: Saw)}
  <div class="grid">
    <label class="num-field">
      <span>Type</span>
      <select bind:value={m.type}>
        {#each SAW_TYPES as type (type.id)}
          <option value={type.id}>{type.label}</option>
        {/each}
      </select>
    </label>
    {@render number(m, "kerf", "Trait de scie", "mm")}
    {@render number(m, "maxAngle", "Angle maxi", "°")}
    {@render number(m, "minLength", "Longueur mini", "mm")}
    {@render number(m, "trim", "Dressage", "mm")}
  </div>
  <div class="switches">
    <Check label="Tourne des deux côtés" bind:checked={m.bothSides} />
    <Check label="Butée de longueur" checked={m.stopMax !== null} onchange={(on) => (m.stopMax = on ? 1000 : null)} />
    {#if m.stopMax !== null}
      <span class="inline">{@render number(m, "stopMax", "Course maxi", "mm")}</span>
    {/if}
  </div>
{/snippet}

{#snippet shear(m: Shear)}
  <div class="grid">
    {@render number(m, "bladeLength", "Longueur de lame", "mm")}
    {@render number(m, "maxThickness", "Épaisseur maxi (acier)", "mm")}
    {@render number(m, "gaugeMax", "Butée arrière maxi", "mm")}
    {@render number(m, "trim", "Dressage", "mm")}
  </div>
{/snippet}

<p class="intro">
  Les machines de l'atelier : les calculs reprennent leurs réglages (trait de scie, angles, longueur de lame, butée) et
  les contraintes qu'elles imposent. Les plugins de calcul fonctionnent aussi sans machine, en saisissant ces réglages à la main.
</p>

<div class="groups">
  {#each GROUPS as group (group.kind)}
    {@const list = settings.data.machines.filter((m) => m.kind === group.kind)}
    <section>
      <h4>{group.title}</h4>
      {#each list as machine (machine.id)}
        <div class="machine" class:highlight={highlight === machine.id} data-machine={machine.id}>
          <div class="head">
            <input class="name" bind:value={machine.name} placeholder={group.placeholder} aria-label="Nom de la machine" spellcheck="false" />
            <button
              class="mini"
              onclick={() => (settings.data.machines = settings.data.machines.filter((m) => m.id !== machine.id))}
              title="Supprimer"
              aria-label="Supprimer {machine.name}"
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
          {#if machine.kind === "scie"}
            {@render saw(machine)}
          {:else}
            {@render shear(machine)}
          {/if}
        </div>
      {:else}
        <p class="none">Aucune pour l'instant.</p>
      {/each}
      <button class="add" onclick={() => void add(group.kind)}><Icon name="plus" size={14} /> {group.add}</button>
    </section>
  {/each}
</div>

<style>
  .intro {
    margin: 0 0 12px;
    color: var(--muted);
    font-size: 13px;
    max-width: 80ch;
  }
  .groups {
    display: flex;
    flex-direction: column;
    gap: 16px;
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
  .none {
    margin: 0;
    font-size: 13px;
    color: var(--faint);
  }
  .machine {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-2);
    transition:
      border-color 0.3s,
      box-shadow 0.3s;
  }
  .machine.highlight {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px 10px;
  }
  .num-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .num-field > span:first-child {
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
  }
  .input {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--field);
  }
  .input:focus-within {
    border-color: var(--accent);
    background: var(--surface);
  }
  .input input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: none;
    font: 500 13.5px var(--mono);
    color: var(--text);
  }
  .input small {
    color: var(--faint);
    font-size: 12px;
  }
  select,
  .name {
    height: 34px;
    min-width: 0;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--field);
    font: 500 13.5px var(--font);
    color: var(--text);
    outline: none;
  }
  .name {
    flex: 1;
    font-weight: 600;
    font-size: 14.5px;
    background: var(--surface);
  }
  select:focus,
  .name:focus {
    border-color: var(--accent);
  }
  .switches {
    display: flex;
    align-items: center;
    gap: 8px 22px;
    flex-wrap: wrap;
  }
  .inline {
    width: 150px;
  }
  .mini {
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: var(--r-xs);
    background: none;
    color: var(--muted);
    display: grid;
    place-items: center;
    flex: none;
  }
  .mini:hover {
    background: var(--field);
    color: var(--err);
  }
  .add {
    align-self: flex-start;
    height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--accent);
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .add:hover {
    background: var(--accent-soft);
  }
</style>
