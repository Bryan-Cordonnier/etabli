// Logique pure du tableau de widgets de l'accueil (docs/28, section 4) : lecture défensive de ce qui est enregistré, ajout, retrait,
// déplacement, changement de taille. Aucune dépendance à Svelte : testé seul.
import { estTaille } from "$lib/plugins/manifeste";
import type { BoardEntry, WidgetSize } from "$lib/types";

/** Clé du widget du moteur qui montre les pages favorites. */
export const FAVORIS = "@favoris";
/** Autant de widgets qu'on veut, en pratique : la limite n'est là que pour qu'un fichier abîmé ne fige pas l'accueil. */
export const BOARD_MAX = 500;

/** Clé d'un widget posé : « plugin/widget » pour le premier, « plugin/widget#2 », « #3 »… pour les suivants (un même widget peut être posé plusieurs fois). */
const CLE = /^(?:@favoris|[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*)(?:#[2-9]|#[1-9]\d{1,2})?$/;

/** Le widget (« plugin/widget ») que désigne une clé de widget posé. */
export const baseDe = (key: string): string => key.split("#")[0]!;

/** Numéro d'exemplaire d'une clé (1 pour le premier). Le widget le reçoit dans son adresse pour garder ses propres réglages. */
export function exemplaireDe(key: string): number {
  const n = Number(key.split("#")[1]);
  return Number.isInteger(n) && n >= 2 ? n : 1;
}

/** La première clé libre pour ce widget : « base », puis « base#2 », « base#3 »… */
export function nouvelleCle(b: readonly BoardEntry[], base: string): string {
  const prises = new Set(b.map((e) => e.key));
  if (!prises.has(base)) return base;
  for (let n = 2; ; n++) if (!prises.has(`${base}#${n}`)) return `${base}#${n}`;
}

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
    if (!o || typeof o.key !== "string" || !CLE.test(o.key) || vus.has(o.key) || !estTaille(o.size)) continue;
    vus.add(o.key);
    sortie.push({ key: o.key, size: o.size });
  }
  return sortie;
}

/** Pose un widget à la fin ; le widget des favoris n'existe qu'une fois, les autres autant de fois qu'on veut. */
export function ajouterWidget(b: readonly BoardEntry[], base: string, size: WidgetSize): BoardEntry[] {
  if (b.length >= BOARD_MAX || (base === FAVORIS && b.some((e) => e.key === FAVORIS))) return [...b];
  return [...b, { key: nouvelleCle(b, base), size }];
}

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
