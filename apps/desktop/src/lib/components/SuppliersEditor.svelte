<script lang="ts">
  // Bibliothèque Fournisseurs (cahier des charges, section 3.3) : la matière que vend chaque
  // fournisseur, avec ses dimensions commerciales, sa tolérance et un prix facultatif.
  import type { StockKind, SupplierItem } from "@etabli/sdk/protocol";
  import { PRICE_UNITS, STOCK_KINDS, libraries, newItem } from "$lib/state/libraries.svelte";
  import Icon from "./Icon.svelte";

  const save = () => libraries.saveSuppliers();

  /** Une tôle a une largeur ; une barre non. Les dimensions par défaut changent avec. */
  function changeKind(item: SupplierItem, kind: StockKind): void {
    const wasSheet = item.kind === "tole";
    item.kind = kind;
    if (kind === "tole" && !wasSheet) Object.assign(item, { length: 2500, width: 1250 });
    if (kind !== "tole" && wasSheet) Object.assign(item, { length: 6000, width: null });
    save();
  }

  /** Champ vidé : 0 pour une dimension, rien pour le prix. */
  function setNumber(item: SupplierItem, key: "length" | "width" | "tolMinus" | "tolPlus" | "price", raw: string): void {
    const value = Number(raw.replace(",", "."));
    const empty = raw.trim() === "" || !Number.isFinite(value);
    if (key === "price") item.price = empty ? null : Math.max(0, value);
    else if (key === "width") item.width = empty ? 0 : Math.max(0, value);
    else item[key] = empty ? 0 : Math.max(0, value);
    save();
  }
</script>

{#snippet number(item: SupplierItem, key: "length" | "width" | "tolMinus" | "tolPlus" | "price", label: string, placeholder = "")}
  <input
    class="num"
    inputmode="decimal"
    value={item[key] ?? ""}
    {placeholder}
    aria-label={label}
    onchange={(e) => setNumber(item, key, e.currentTarget.value)}
  />
{/snippet}

<div class="suppliers">
  {#each libraries.suppliers as supplier (supplier.id)}
    <div class="supplier">
      <div class="supplier-head">
        <input
          class="name"
          bind:value={supplier.name}
          oninput={save}
          placeholder="Nom du fournisseur"
          aria-label="Nom du fournisseur"
          spellcheck="false"
        />
        <button class="mini" onclick={() => libraries.removeSupplier(supplier.id)} title="Supprimer ce fournisseur" aria-label="Supprimer le fournisseur {supplier.name}">
          <Icon name="trash" size={15} />
        </button>
      </div>

      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Matière vendue</th>
              <th>Nuance</th>
              <th>Profilé ou épaisseur</th>
              <th>Longueur × largeur (mm)</th>
              <th>Tolérance (mm)</th>
              <th>Prix</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each supplier.items as item (item.id)}
              <tr>
                <td>
                  <select value={item.kind} onchange={(e) => changeKind(item, e.currentTarget.value as StockKind)} aria-label="Type de matière">
                    {#each STOCK_KINDS as kind (kind.id)}
                      <option value={kind.id}>{kind.label}</option>
                    {/each}
                  </select>
                </td>
                <td><input bind:value={item.material} oninput={save} placeholder="toutes" aria-label="Nuance" spellcheck="false" /></td>
                <td><input bind:value={item.designation} oninput={save} placeholder="tous" aria-label="Profilé ou épaisseur" spellcheck="false" /></td>
                <td>
                  <span class="pair">
                    {@render number(item, "length", "Longueur")}
                    {#if item.kind === "tole"}
                      <span class="sep">×</span>{@render number(item, "width", "Largeur")}
                    {/if}
                  </span>
                </td>
                <td>
                  <span class="pair">
                    <span class="sign">−</span>{@render number(item, "tolMinus", "Tolérance en moins")}
                    <span class="sign">+</span>{@render number(item, "tolPlus", "Tolérance en plus")}
                  </span>
                </td>
                <td>
                  <span class="pair">
                    {@render number(item, "price", "Prix", "—")}
                    <select bind:value={item.priceUnit} onchange={save} aria-label="Unité du prix">
                      {#each PRICE_UNITS as unit (unit.id)}
                        <option value={unit.id}>{unit.label}</option>
                      {/each}
                    </select>
                  </span>
                </td>
                <td>
                  <button
                    class="mini"
                    onclick={() => {
                      supplier.items = supplier.items.filter((i) => i.id !== item.id);
                      save();
                    }}
                    aria-label="Retirer cette ligne"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <button
        class="add"
        onclick={() => {
          const last = supplier.items.at(-1);
          supplier.items.push(last ? { ...$state.snapshot(last), id: newItem().id, price: null } : newItem());
          save();
        }}
      >
        <Icon name="plus" size={14} /> Ajouter une matière
      </button>
    </div>
  {/each}

  <button class="btn" onclick={() => libraries.addSupplier()}><Icon name="plus" size={16} /> Ajouter un fournisseur</button>
</div>

<style>
  .suppliers {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  .supplier {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-2);
  }
  .supplier-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name {
    flex: 1;
    font-weight: 600;
    font-size: 15px;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    min-width: 820px;
  }
  th {
    text-align: left;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--faint);
    padding: 0 4px 4px;
    white-space: nowrap;
  }
  td {
    padding: 2px 4px;
  }
  input,
  select {
    height: 32px;
    width: 100%;
    min-width: 0;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--field);
    font: 500 13px var(--font);
    color: var(--text);
    outline: none;
  }
  select {
    padding: 0 4px;
  }
  input:focus,
  select:focus {
    border-color: var(--accent);
    background: var(--surface);
  }
  input::placeholder {
    color: var(--faint);
    font-style: italic;
  }
  .name {
    background: var(--surface);
  }
  .num {
    width: 62px;
    flex: none;
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .pair {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .pair select {
    width: auto;
  }
  .sep,
  .sign {
    color: var(--faint);
    font-size: 12px;
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
