import { evaluate, parsePasted } from "@etabli/ui";

/** Lettre suivante pour un nouveau repère : A, B, … Z, AA, AB… */
export function nextMark(existing: string[]): string {
  for (let i = 0; ; i++) {
    let n = i;
    let mark = "";
    do {
      mark = String.fromCharCode(65 + (n % 26)) + mark;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    if (!existing.includes(mark)) return mark;
  }
}

/**
 * Lignes collées depuis Excel : « repère, longueur, [largeur,] quantité », ou sans repère
 * (« longueur, quantité »). `columns` : nombre de dimensions attendues (1 pour une barre, 2 pour une tôle).
 * Les colonnes suivantes (angles…) sont renvoyées telles quelles après la quantité.
 */
export function rowsFromPaste(text: string, columns: 1 | 2, existing: string[]): string[][] {
  const marks = [...existing];
  return parsePasted(text).map((cells) => {
    const hasMark = !Number.isFinite(evaluate(cells[0] ?? ""));
    const values = hasMark ? cells.slice(1) : cells;
    const mark = hasMark ? cells[0]! : nextMark(marks);
    marks.push(mark);
    const dims = values.slice(0, columns);
    const quantity = values[columns] ?? "1";
    return [mark, ...dims, quantity, ...values.slice(columns + 1)];
  });
}

/** Nombre saisi, ou NaN si le champ est vide ou invalide. */
export const num = (text: string): number => (text.trim() === "" ? NaN : evaluate(text));

/** Quantité : champ vide = illimitée (null), sinon un entier positif. */
export const quantity = (text: string): number | null => (text.trim() === "" ? null : Math.max(0, Math.floor(evaluate(text) || 0)));
