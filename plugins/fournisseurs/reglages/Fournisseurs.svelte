<script lang="ts">
  // Réglages du plugin Fournisseurs : la matière que vend chaque fournisseur, avec ses dimensions
  // commerciales, sa tolérance et un prix facultatif. Enregistré dès qu'on modifie un champ, et publié
  // aux plugins qui en dépendent (service « fournisseurs »).
  import { STOCK_KINDS, type StockKind, type Supplier, type SupplierItem } from "@etabli/sdk";
  import { Icon, PluginSettings } from "@etabli/ui";
  import {
    PRICE_UNITS,
    changeKind,
    cleanSuppliers,
    newItem,
    newSupplier,
    setNumber,
    type NumberKey,
  } from "../src/fournisseurs";

  const settings = new PluginSettings<{ suppliers: Supplier[] }>(
    { suppliers: [] },
    (saved) => ({ suppliers: cleanSuppliers((saved as { suppliers?: unknown } | null)?.suppliers) }),
    "fournisseurs",
  );
</script>

{#snippet number(item: SupplierItem, key: NumberKey, label: string, placeholder = "")}
  <input
    class="num"
    inputmode="decimal"
    value={item[key] ?? ""}
    {placeholder}
    aria-label={label}
    onchange={(e) => setNumber(item, key, e.currentTarget.value)}
  />
{/snippet}

<p class="intro">
  La matière que vend chaque fournisseur : longueur des barres, format des tôles, tolérance. Les plugins de calcul
  s'en servent pour préremplir leurs formulaires ; ils fonctionnent aussi sans. Le prix est facultatif : il ne sert
  qu'au chiffrage.
</p>

<div class="suppliers">
  {#each settings.data.suppliers as supplier (supplier.id)}
    <div class="supplier">
      <div class="supplier-head">
        <input class="name" bind:value={supplier.name} placeholder="Nom du fournisseur" aria-label="Nom du fournisseur" spellcheck="false" />
        <button
          class="mini"
          onclick={() => (settings.data.suppliers = settings.data.suppliers.filter((s) => s.id !== supplier.id))}
          title="Supprimer ce fournisseur"
          aria-label="Supprimer le fournisseur {supplier.name}"
        >
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
                <td><input bind:value={item.material} placeholder="toutes" aria-label="Nuance" spellcheck="false" /></td>
                <td><input bind:value={item.designation} placeholder="tous" aria-label="Profilé ou épaisseur" spellcheck="false" /></td>
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
                    <select bind:value={item.priceUnit} aria-label="Unité du prix">
                      {#each PRICE_UNITS as unit (unit.id)}
                        <option value={unit.id}>{unit.label}</option>
                      {/each}
                    </select>
                  </span>
                </td>
                <td>
                  <button
                    class="mini"
                    onclick={() => (supplier.items = supplier.items.filter((i) => i.id !== item.id))}
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
        }}
      >
        <Icon name="plus" size={14} /> Ajouter une matière
      </button>
    </div>
  {:else}
    <p class="none">Aucun fournisseur pour l'instant.</p>
  {/each}

  <button class="btn" onclick={() => settings.data.suppliers.push(newSupplier())}><Icon name="plus" size={16} /> Ajouter un fournisseur</button>
</div>

<style>
  .intro {
    margin: 0 0 12px;
    color: var(--muted);
    font-size: 13px;
    max-width: 80ch;
  }
  .none {
    margin: 0;
    color: var(--faint);
    font-size: 13px;
  }
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
    background: var(--surface);
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
  .btn {
    height: 34px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--surface);
    font-weight: 500;
  }
  .btn:hover {
    background: var(--surface-2);
  }
</style>
