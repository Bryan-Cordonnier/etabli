const DAY = 86_400_000;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** « aujourd'hui 14:32 », « hier 16:40 », « 21/09 », « 21/09/2025 ». */
export function formatDate(ms: number, now = new Date()): string {
  const date = new Date(ms);
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (days === 0) return `aujourd'hui ${time}`;
  if (days === 1) return `hier ${time}`;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** Horodatage court pour les titres automatiques : « 23/09 14:32 ». */
export function stamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
