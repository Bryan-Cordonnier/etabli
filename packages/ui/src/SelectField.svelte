<script lang="ts" generics="T extends string">
  // Liste de choix. Dessinée par Établi plutôt que par Windows : la liste native reste blanche
  // dans les cadres des mini-apps, même en thème sombre. Clavier : flèches, Entrée, Échap, lettres.
  interface Props {
    label: string;
    options: { value: T; label: string }[];
    value: T;
    compact?: boolean;
    onchange?: (value: T) => void;
  }

  let { label, options, value = $bindable(), compact = false, onchange }: Props = $props();

  const id = `select-${Math.random().toString(36).slice(2, 9)}`;
  let open = $state(false);
  let active = $state(0);
  let root: HTMLElement;
  let list = $state<HTMLElement>();

  const current = $derived(options.find((o) => o.value === value));

  // Le cadre d'une mini-app a la hauteur de son contenu : une liste qui dépasserait en bas serait
  // coupée. Elle s'ouvre donc vers le haut s'il y a plus de place, et se limite à la place libre.
  let up = $state(false);
  let maxHeight = $state(280);

  function show(): void {
    active = Math.max(0, options.findIndex((o) => o.value === value));
    const rect = root.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - (compact ? 0 : 22) - 8;
    const wanted = Math.min(280, options.length * 34 + 10);
    up = below < wanted && above > below;
    maxHeight = Math.max(120, Math.min(280, up ? above : below));
    open = true;
  }

  function choose(index: number): void {
    const option = options[index];
    open = false;
    if (!option || option.value === value) return;
    value = option.value;
    onchange?.(option.value);
  }

  // L'élément actif reste visible quand la liste défile.
  $effect(() => {
    if (open) list?.children[active]?.scrollIntoView({ block: "nearest" });
  });

  // Clic ailleurs : la liste se ferme.
  $effect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) open = false;
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  });

  function onkeydown(event: KeyboardEvent): void {
    const last = options.length - 1;
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 };
    if (event.key in moves) {
      event.preventDefault();
      if (!open) show();
      else active = Math.min(last, Math.max(0, active + moves[event.key]!));
    } else if (event.key === "Home" || event.key === "End") {
      if (!open) return;
      event.preventDefault();
      active = event.key === "Home" ? 0 : last;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else show();
    } else if (event.key === "Escape" && open) {
      // Échap ferme la liste, pas l'aperçu rapide ni le calcul.
      event.preventDefault();
      event.stopPropagation();
      open = false;
    } else if (event.key === "Tab") {
      open = false;
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      // Première lettre : saute à l'option suivante qui commence par elle.
      const letter = event.key.toLowerCase();
      const start = open ? active : options.findIndex((o) => o.value === value);
      for (let step = 1; step <= options.length; step++) {
        const index = (start + step) % options.length;
        if (options[index]!.label.toLowerCase().startsWith(letter)) {
          if (open) active = index;
          else choose(index);
          break;
        }
      }
    }
  }
</script>

<div class="field" class:compact class:open bind:this={root}>
  {#if !compact}<span class="label" id="{id}-label">{label}</span>{/if}
  <button
    type="button"
    class="input"
    role="combobox"
    aria-label={compact ? label : undefined}
    aria-labelledby={compact ? undefined : `${id}-label`}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls="{id}-list"
    aria-activedescendant={open ? `${id}-${active}` : undefined}
    onclick={() => (open ? (open = false) : show())}
    {onkeydown}
  >
    <span class="current">{current?.label ?? ""}</span>
    <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
  </button>
  {#if open}
    <ul class="list" class:up id="{id}-list" role="listbox" aria-label={label} style:max-height="{maxHeight}px" bind:this={list}>
      {#each options as option, i (option.value)}
        <!-- Le clavier reste sur le bouton (aria-activedescendant) : les options ne sont que cliquées. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          id="{id}-{i}"
          role="option"
          aria-selected={option.value === value}
          class:active={i === active}
          class:selected={option.value === value}
          onpointerenter={() => (active = i)}
          onpointerdown={(e) => e.preventDefault()}
          onclick={() => choose(i)}
        >
          {option.label}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .field {
    position: relative;
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
    gap: 8px;
    width: 100%;
    height: 36px;
    padding: 0 8px 0 10px;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    background: var(--field);
    color: var(--text);
    font: 500 14px var(--font);
    text-align: left;
    cursor: pointer;
    outline: none;
    transition: border-color 0.12s;
  }
  .compact .input {
    height: 32px;
    padding: 0 6px 0 8px;
  }
  .input:focus-visible,
  .open .input {
    border-color: var(--accent);
    background: var(--surface);
  }
  .current {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron {
    width: 16px;
    height: 16px;
    flex: none;
    fill: none;
    stroke: var(--faint);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.15s;
  }
  .open .chevron {
    transform: rotate(180deg);
  }
  .list {
    position: absolute;
    z-index: 20;
    top: calc(100% + 4px);
    left: 0;
    min-width: 100%;
    overflow-y: auto;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    box-shadow: 0 10px 30px rgba(15, 25, 40, 0.18);
    animation: drop 0.12s ease-out;
  }
  .list.up {
    top: auto;
    bottom: 40px;
    animation-name: rise;
  }
  .compact .list.up {
    bottom: 36px;
  }
  li {
    padding: 7px 10px;
    border-radius: var(--r-xs);
    font-size: 13.5px;
    color: var(--text);
    white-space: nowrap;
    cursor: pointer;
  }
  li.active {
    background: var(--field);
  }
  li.selected {
    color: var(--accent);
    font-weight: 600;
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
</style>
