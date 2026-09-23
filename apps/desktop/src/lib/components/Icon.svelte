<script lang="ts">
  import { ICONS, type IconName } from "$lib/icons";

  interface Props {
    name: IconName;
    size?: number;
    strokeWidth?: number;
    fill?: string;
  }

  let { name, size = 20, strokeWidth = 2, fill = "none" }: Props = $props();

  const Glyph = $derived(ICONS[name]);
</script>

<Glyph {size} {strokeWidth} {fill} aria-hidden="true" />
