<script lang="ts">
  // Quelques icônes pour les boutons des mini-apps (tracés Lucide, licence ISC). Pas d'émoji.
  type Name = "plus" | "minus" | "x" | "check" | "trash" | "chevron-left" | "chevron-right" | "chevron-up" | "chevron-down" | "expand" | "pencil" | "camera" | "image";

  interface Props {
    name: Name;
    size?: number;
    /** Épaisseur du trait : la même partout (2,4) pour que + − ✓ × se ressemblent. */
    strokeWidth?: number;
  }

  let { name, size = 16, strokeWidth = 2.4 }: Props = $props();

  const PATHS: Record<Name, string[]> = {
    plus: ["M5 12h14", "M12 5v14"],
    minus: ["M5 12h14"],
    check: ["M20 6 9 17l-5-5"],
    "chevron-left": ["m15 18-6-6 6-6"],
    "chevron-right": ["m9 18 6-6-6-6"],
    "chevron-up": ["m18 15-6-6-6 6"],
    "chevron-down": ["m6 9 6 6 6-6"],
    expand: ["M15 3h6v6", "M9 21H3v-6", "M21 3l-7 7", "M3 21l7-7"],
    pencil: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
    x: ["M18 6 6 18", "m6 6 12 12"],
    camera: ["M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z", "M12 10a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z"],
    image: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M9 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z", "m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"],
    trash: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M10 11v6", "M14 11v6"],
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each PATHS[name] as d (d)}<path {d} />{/each}
</svg>
