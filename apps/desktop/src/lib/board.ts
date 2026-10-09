// Logique pure du tableau de widgets de l'accueil (docs/28, section 4) : lecture défensive de ce qui est enregistré, ajout, retrait,
// déplacement, changement de taille. Aucune dépendance à Svelte : testé seul.
import { estTaille } from "$lib/plugins/manifeste";
import type { BoardEntry, WidgetSize } from "$lib/types";

/** Clé du widget du moteur qui montre les pages favorites. */
export const FAVORIS = "@favoris";
export const BOARD_MAX = 40;

/** Ce que montre l'accueil quand l'utilisateur n'a encore rien choisi. */
export const BOARD_DEFAUT: readonly BoardEntry[] = [{ key: FAVORIS, size: "4x2" }];

/** Tailles du widget du moteur. */
export const TAILLES_FAVORIS: readonly WidgetSize[] = ["2x1", "2x2", "4x1", "4x2"];

/** Ce qui est enregistré → un tableau valable : clés uniques, tailles connues, bornes respectées. `null` = jamais modifié. */
export function lireBoard(brut: unknown): BoardEntry[] | null {
  if (!Array.isArray(brut)) return null;
  const vus = new Set<string>();
  const sortie: BoardEntry[] = [];
  for (const e of brut.slice(0, BOARD_MAX)) {
    const o = typeof e === "object" && e !== null ? (e as Record<string, unknown>) : null;
    if (!o || typeof o.key !== "string" || o.key.length > 140 || vus.has(o.key) || !estTaille(o.size)) continue;
    vus.add(o.key);
    sortie.push({ key: o.key, size: o.size });
  }
  return sortie;
}

export const ajouterWidget = (b: readonly BoardEntry[], key: string, size: WidgetSize): BoardEntry[] =>
  b.some((e) => e.key === key) || b.length >= BOARD_MAX ? [...b] : [...b, { key, size }];

export const retirerWidget = (b: readonly BoardEntry[], key: string): BoardEntry[] => b.filter((e) => e.key !== key);

export function redimensionner(b: readonly BoardEntry[], key: string, size: WidgetSize): BoardEntry[] {
  return b.map((e) => (e.key === key ? { key, size } : e));
}

/** Déplace un widget d'un cran (−1 : plus tôt, +1 : plus tard). */
export function deplacer(b: readonly BoardEntry[], key: string, delta: -1 | 1): BoardEntry[] {
  const liste = [...b];
  const de = liste.findIndex((e) => e.key === key);
  const vers = de + delta;
  if (de < 0 || vers < 0 || vers >= liste.length) return liste;
  [liste[de], liste[vers]] = [liste[vers]!, liste[de]!];
  return liste;
}

/** Parmi les tailles que le widget accepte, la plus proche de « l cases de large, h de haut » (à égalité, la plus petite). */
export function plusProcheTaille(tailles: readonly WidgetSize[], l: number, h: number): WidgetSize {
  let meilleure = tailles[0]!;
  let score = Infinity;
  for (const t of tailles) {
    const d = dimensions(t);
    const s = Math.abs(d.l - l) + Math.abs(d.h - h) + (d.l * d.h) / 1000;
    if (s < score) {
      score = s;
      meilleure = t;
    }
  }
  return meilleure;
}

/** « 2x1 » → { l: 2, h: 1 } (nombre de cases). */
export function dimensions(size: WidgetSize): { l: number; h: number } {
  return { l: Number(size[0]), h: Number(size[2]) };
}

/** Colonnes de la grille selon la largeur disponible (un téléphone : une colonne, donc des widgets l'un sous l'autre). */
export const colonnesPour = (largeur: number): number => (largeur >= 900 ? 4 : largeur >= 560 ? 2 : 1);

/** Une taille ne dépasse jamais le nombre de colonnes : sur une grille de 2 colonnes, « 4x2 » s'étale sur 2. */
export const largeurEffective = (size: WidgetSize, colonnes: number): number => Math.min(dimensions(size).l, colonnes);
