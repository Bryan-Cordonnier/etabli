<script lang="ts">
  // Enregistreur de raccourci : on clique, on appuie sur la combinaison voulue, c'est tout.
  // La touche est prise par son emplacement physique (event.code) : le raccourci marche en AZERTY.
  import type { QuickShortcut } from "$lib/state/settings.svelte";

  interface Props {
    value: QuickShortcut;
    /** Essaie d'appliquer le raccourci ; renvoie un message d'erreur, ou null si c'est bon. */
    onchange: (shortcut: QuickShortcut) => Promise<string | null>;
  }

  let { value, onchange }: Props = $props();

  let recording = $state(false);
  let preview = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);
  let button: HTMLButtonElement;

  const NAMED: Record<string, string> = {
    Space: "Espace",
    Enter: "Entrée",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Insert: "Inser",
    Delete: "Suppr",
    Home: "Début",
    End: "Fin",
    PageUp: "Page préc.",
    PageDown: "Page suiv.",
  };

  /** Nom de la touche pour Windows et pour l'affichage ; null si la touche n'est pas prise en charge. */
  function keyOf(event: KeyboardEvent): { code: string; label: string } | null {
    const { code, key } = event;
    if (/^Key[A-Z]$/.test(code)) return { code, label: key.length === 1 ? key.toUpperCase() : code.slice(3) };
    if (/^Digit\d$/.test(code)) return { code, label: code.slice(5) };
    if (/^Numpad\d$/.test(code)) return { code, label: `Pavé ${code.slice(6)}` };
    if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return { code, label: code };
    if (code in NAMED) return { code, label: NAMED[code]! };
    if (/^(Backquote|Minus|Equal|Comma|Period|Semicolon|Slash|Backslash|BracketLeft|BracketRight|Quote)$/.test(code)) {
      return { code, label: key.length === 1 ? key.toUpperCase() : code };
    }
    return null;
  }

  function modifiers(event: KeyboardEvent): { codes: string[]; labels: string[] } {
    const parts = [
      [event.ctrlKey, "Ctrl", "Ctrl"],
      [event.altKey, "Alt", "Alt"],
      [event.shiftKey, "Shift", "Maj"],
      [event.metaKey, "Super", "Win"],
    ] as const;
    const active = parts.filter(([on]) => on);
    return { codes: active.map(([, code]) => code), labels: active.map(([, , label]) => label) };
  }

  function start(): void {
    recording = true;
    preview = "";
    error = null;
    button.focus();
  }

  async function onkeydown(event: KeyboardEvent): Promise<void> {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();

    const mods = modifiers(event);
    if (event.key === "Escape" && mods.codes.length === 0) {
      recording = false;
      return;
    }
    preview = mods.labels.join(" + ");
    if (["Control", "Alt", "Shift", "Meta", "AltGraph"].includes(event.key)) return;

    const key = keyOf(event);
    if (!key) {
      error = "Cette touche ne peut pas servir de raccourci.";
      return;
    }
    if (!event.ctrlKey && !event.altKey && !event.metaKey) {
      error = "Ajoutez Ctrl, Alt ou Win à la combinaison, pour ne pas bloquer une touche normale.";
      return;
    }

    recording = false;
    busy = true;
    error = await onchange({
      accelerator: [...mods.codes, key.code].join("+"),
      label: [...mods.labels, key.label].join(" + "),
    });
    busy = false;
  }
</script>

<div class="recorder">
  <button
    bind:this={button}
    class="keys"
    class:recording
    onclick={start}
    {onkeydown}
    onblur={() => (recording = false)}
    disabled={busy}
    aria-label="Raccourci de l'aperçu rapide : {value.label}. Cliquer pour le changer."
  >
    {#if recording}
      {preview ? `${preview} + …` : "Appuyez sur la combinaison…"}
    {:else}
      {#each value.label.split(" + ") as part, i (i)}
        {#if i > 0}<span class="plus">+</span>{/if}<kbd>{part}</kbd>
      {/each}
    {/if}
  </button>
  <span class="hint">{recording ? "Échap pour annuler" : "Cliquez pour changer"}</span>
</div>
{#if error}
  <p class="error" role="alert">{error}</p>
{/if}

<style>
  .recorder {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .keys {
    min-width: 240px;
    height: 44px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--field);
    color: var(--text);
    font-weight: 500;
    transition:
      border-color 0.12s,
      background 0.12s;
  }
  .keys:hover {
    border-color: var(--accent);
  }
  .keys.recording {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    animation: pulse 1.2s ease-in-out infinite;
  }
  kbd {
    font: 600 12.5px var(--mono);
    background: var(--surface);
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 6px;
    padding: 3px 8px;
  }
  .plus {
    color: var(--faint);
  }
  .hint {
    font-size: 12px;
    color: var(--faint);
  }
  .error {
    margin: 8px 0 0;
    color: var(--err);
    font-size: 13px;
  }
  @keyframes pulse {
    50% {
      border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    }
  }
</style>
