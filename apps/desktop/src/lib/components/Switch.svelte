<script lang="ts">
  interface Props {
    checked: boolean;
    label: string;
    onchange: (checked: boolean) => void;
    disabled?: boolean;
  }

  let { checked, label, onchange, disabled = false }: Props = $props();
</script>

<button
  class="switch"
  class:on={checked}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={() => onchange(!checked)}
></button>

<style>
  .switch {
    position: relative;
    width: 38px;
    height: 22px;
    border: 0;
    border-radius: 99px;
    background: var(--border);
    flex: none;
    transition: background 0.15s;
  }
  .switch::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    transition: transform 0.15s;
  }
  .switch.on {
    background: var(--ok);
  }
  .switch.on::after {
    transform: translateX(16px);
  }
  .switch:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
