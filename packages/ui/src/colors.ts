/** Couleurs des repères de pièces (schémas de débit et de calepinage), lisibles en clair et en sombre. */
export const COLORS = ["#2b63d9", "#16a34a", "#ea7a1a", "#7c5cfa", "#0e9fb7", "#e0483e", "#b58a00", "#d9468f"];

export const colorOf = (index: number): string => COLORS[index % COLORS.length]!;
