<script lang="ts">
  import Icon from "./Icon.svelte";

  interface Props {
    value?: string;
    placeholder: string;
    big?: boolean;
    /** Place le curseur dans le champ à l'affichage (nouvel onglet). */
    focus?: boolean;
    oninput?: () => void;
  }

  let { value = $bindable(""), placeholder, big = false, focus = false, oninput }: Props = $props();

  let input: HTMLInputElement;

  $effect(() => {
    if (focus) input.focus();
  });
</script>

<label class="search" class:big>
  <Icon name="search" size={big ? 18 : 16} />
  <input bind:this={input} bind:value {placeholder} {oninput} autocomplete="off" spellcheck="false" aria-label={placeholder} />
</label>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    border-radius: var(--r-md);
    background: var(--field);
    padding: 0 12px;
    color: var(--faint);
    border: 1px solid transparent;
    transition: border-color 0.12s;
  }
  .search:focus-within {
    border-color: var(--accent);
    background: var(--surface);
  }
  .big {
    height: 46px;
    max-width: 620px;
    border-radius: var(--r-md);
  }
  input {
    border: 0;
    background: none;
    outline: none;
    font: inherit;
    color: var(--text);
    width: 100%;
    min-width: 0;
  }
</style>
